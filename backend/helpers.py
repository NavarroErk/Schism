from fastapi import HTTPException
import shutil
import importlib.util
import subprocess
import tempfile
import json
import yt_dlp
import os
import sys
import re
import logging
import queue
import threading
import uuid
from typing import Any
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


logger = logging.getLogger("uvicorn")


def get_timezone():
    """Timezone from the TZ env var (set in docker-compose.yml), e.g. "America/New_York".
    No TZ -> the machine's local timezone. A TZ that isn't a real zone -> UTC."""
    tz_name = os.environ.get("TZ")
    if not tz_name:
        return datetime.now().astimezone().tzinfo
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning(f"Unknown TZ '{tz_name}', using UTC instead")
        return timezone.utc


def get_job_timestamp():
    """Current time for a job's "date" field, e.g. "2026-11-10 14:05 EST"."""
    now = datetime.now(get_timezone())
    tz_label = now.strftime("%Z")
    # Windows reports long names ("Eastern Standard Time"), shorten to "EST"
    if " " in tz_label:
        tz_label = "".join(word[0] for word in tz_label.split())
    return f"{now.strftime('%Y-%m-%d %H:%M')} {tz_label}"

MIX_SUFFIX = " - MIX"
TERMINAL_STATUSES = ["Success", "YT-DLP Failed", "Demucs Failed", "Failed"]

# only one thread at a time may read or write jobs.json.
# RLock so a function holding it can call another function that also takes it
jobs_lock = threading.RLock()

# jobs wait here and run one at a time, in the order they were added
job_queue = queue.Queue()


def job_worker():
    while True:
        func, args = job_queue.get()  # waits until a job is added
        try:
            if find_job_by_id(args[0]) is not None:  # skip jobs deleted while queued
                func(*args)
        except Exception:
            logger.exception("Job failed")  # the job already marked itself failed, keep going
        finally:
            job_queue.task_done()


def start_job_worker():
    threading.Thread(target=job_worker, daemon=True).start()


def check_dependencies():
    return [
        {"name": "ffmpeg", "found": shutil.which("ffmpeg") is not None},
        {"name": "yt_dlp", "found": importlib.util.find_spec("yt_dlp") is not None},
        {"name": "demucs", "found": importlib.util.find_spec("demucs") is not None},
    ]

def process_url_job(job_id, url, output_format, demucs_model):
    run_ytdlp(job_id, url)
    run_demucs(job_id, output_format, demucs_model)
    run_beat_detection(job_id)
    update_job_status(job_id, "Success")


def process_file_job(job_id, output_format, demucs_model):
    run_demucs(job_id, output_format, demucs_model)
    run_beat_detection(job_id)
    update_job_status(job_id, "Success")


def run_ytdlp(job_id, url):
    try:
        update_job_status(job_id, "Downloading Audio", None)
        options: Any = {  # Any: yt-dlp's own options type is private, so the checker can't match a plain dict to it
            'format': 'bestaudio/best',
            'outtmpl': f'jobs/{job_id}/%(title)s.%(ext)s',
            'noplaylist': True,
            'postprocessors': [
                {'key': 'FFmpegExtractAudio', 'preferredcodec': 'wav'}
                ]
        }


        downloaded_title = ""
        with yt_dlp.YoutubeDL(options) as ytdlp:
            extracted_info = ytdlp.extract_info(url, download=True)
            if extracted_info is None:
                raise RuntimeError("yt-dlp returned no info for this URL")
            downloaded_title = sanitize_filename(extracted_info.get("title") or "Untitled")
            file_name = f"{downloaded_title}.wav"
        # 
        # rename directory to include job_id slice for uniqueness
        os.rename(os.path.join("jobs", job_id), os.path.join("jobs", f"{downloaded_title} ({job_id[:5]})"))

        # jobs.json updates
        update_job_file_name(job_id, file_name)
        update_job_path(job_id, os.path.join("jobs", f"{downloaded_title} ({job_id[:5]})"))
        update_job_status(job_id, "Audio Download Success", None)

    except Exception as e:
        update_job_status(job_id, "YT-DLP Failed", str(e))
        raise
def run_demucs(job_id, output_format, demucs_model):
    try:
        update_job_status(job_id, "Splitting Audio", None)

        job_directory = get_job_directory(job_id)
        file_to_split = get_demucs_input_file(job_directory)

        # run demucs in its own process so its memory is fully freed when it finishes
        args = [sys.executable, "-m", "demucs.separate", "-n", demucs_model, "-o", job_directory]
        if output_format != "wav":
            args.append(f"--{output_format}")
        args.append(file_to_split)
        # force utf-8 so filenames like "⧸" don't crash demucs on Windows (default there is cp1252)
        subprocess.run(args, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env={**os.environ, "PYTHONIOENCODING": "utf-8"})

        # move output files up one directory, delete directory, rename parent directory
        model_dir_path = os.path.join(job_directory, demucs_model)
        stems_dir_path = os.path.join(model_dir_path, os.listdir(model_dir_path)[0])

        for stem in os.listdir(stems_dir_path):
            shutil.move(os.path.join(stems_dir_path, stem), model_dir_path)
        shutil.rmtree(stems_dir_path)
        os.rename(model_dir_path, os.path.join(job_directory, "output"))

        update_job_status(job_id, "Audio Split Success", None)

    except subprocess.CalledProcessError as e:
        # show demucs' own error instead of "exit status 1"
        update_job_status(job_id, "Demucs Failed", e.stderr[-500:])
        raise
    except Exception as e:
        update_job_status(job_id, "Demucs Failed", str(e))
        raise

CLICK_STEM = "click.flac"


def run_beat_detection(job_id):
    # Create a click track from the beats in the original audio. If it fails the job still succeeds, just without a click track
    try:
        update_job_status(job_id, "Detecting Beats", None)
        job_directory = get_job_directory(job_id)
        audio_path = get_demucs_input_file(job_directory)
        beats_path = os.path.join(job_directory, "beats.tsv")
        click_path = os.path.join(job_directory, "output", CLICK_STEM)

        subprocess.run(["beat_this", audio_path, "-o", beats_path, "--gpu=-1", "--model", "final0"],
                       check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
        write_click_track(beats_path, audio_path, click_path)
    except Exception as e:
        logger.warning(f"Beat detection failed for job {job_id}: {e}")


def write_click_track(beats_path, audio_path, click_path):
    # create silent track the length of the audio, with a click on every beat
    import numpy as np
    import soundfile as sf

    # create list of timestamps
    with open(beats_path) as file:
        beats = [float(line.split()[0]) for line in file if line.strip()]

    # count in beats on silence before audio begins
    if len(beats) >= 5:
        spacing = np.median(np.diff(beats[:5]))
        while beats[0] - spacing >= 0:
            beats.insert(0, beats[0] - spacing)

    info = sf.info(audio_path)
    sample_rate = info.samplerate
    track = np.zeros(info.frames, dtype=np.float32)

    # making the click sound
    # evenly spaced timestamps over the course of 40ms
    t = np.arange(int(sample_rate * 0.04)) / sample_rate
    # amplitude at each evenly spaced point in time of 1 click sample (40ms)
    click = np.sin(2 * np.pi * 1000 * t) * np.exp(-t * 100)

    for beat in beats:
        # start pos in track for click sample
        start = int(beat * sample_rate)
        if start >= len(track):
            break
        piece = click[:len(track) - start]  # cut off clicks that would run past the end
        track[start:start + len(piece)] += piece # write the click into the track at this beat

    # place 2 copies side-by-side for stereo, axis 1 = cols
    sf.write(click_path, np.stack([track, track], axis=1), sample_rate)


def get_job_directory(job_id):
    jobs_data = get_jobs_data()
    for job in jobs_data:
        if job["job_id"] == job_id:
            directory = job["path"]
            return directory
    raise FileNotFoundError("No job directory found.")
    

def get_demucs_input_file(job_directory):
    logger.info(os.listdir(job_directory))
    supported_types = (".wav", ".flac", ".mp3", ".m4a")
    for file in os.listdir(job_directory):
        if file.lower().endswith(supported_types):
            return os.path.join(job_directory, file)
    raise FileNotFoundError("No supported audio file found")

def get_jobs_data():
    with jobs_lock:
        os.makedirs("jobs", exist_ok=True)
        if not os.path.exists("jobs/jobs.json"):
            with open("jobs/jobs.json", "w") as f:
                json.dump([], f)
        try:
            with open("jobs/jobs.json", "r") as jobs_json:
                return json.load(jobs_json)
        except json.JSONDecodeError:
            # keep the broken file so it can be recovered, then start fresh
            backup = f"jobs/jobs.json.bad-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            os.replace("jobs/jobs.json", backup)
            logger.warning(f"jobs.json was malformed. Saved it as {backup} and started a new one.")
            with open("jobs/jobs.json", "w") as f:
                json.dump([], f)
            return []

def write_jobs_data(jobs_data):
    with jobs_lock:
        with open("jobs/jobs.json", "w") as jobs_json:
            json.dump(jobs_data, jobs_json, indent=2)

def add_job(new_job):
    with jobs_lock:
        jobs_data = get_jobs_data()
        jobs_data.append(new_job)
        write_jobs_data(jobs_data)

def remove_job(job_id):
    with jobs_lock:
        jobs_data = get_jobs_data()
        write_jobs_data([job for job in jobs_data if job["job_id"] != job_id])

def update_job_file_name(job_id, file_name):
    with jobs_lock:
        jobs_data = get_jobs_data()
        for job in jobs_data:
            if job["job_id"] == job_id:
                job["file_name"] = file_name
                logger.info(f"File name updated to [{file_name}] for job: {job_id}.")
                break
        write_jobs_data(jobs_data)

def update_job_path(job_id, path):
    with jobs_lock:
        jobs_data = get_jobs_data()
        for job in jobs_data:
            if job["job_id"] == job_id:
                job["path"] = path
                logger.info(f"Path updated to [{path}] for job: {job_id}.")
                break
        write_jobs_data(jobs_data)

def update_job_status(job_id, status, error = None):
    with jobs_lock:
        jobs_data = get_jobs_data()
        for job in jobs_data:
            if job["job_id"] == job_id:
                job["status"] = status
                job["error"] = error
                logger.info(f"Status updated to [{status}] for job: {job_id}. Error: {error}.")
                break
        write_jobs_data(jobs_data)



def get_stem_file_names(job_id):
    # everything in output/ ; except exported mixes
    stems_dir = os.path.join(get_job_directory(job_id), "output")
    return [
        stem for stem in os.listdir(stems_dir)
        if not os.path.splitext(stem)[0].endswith(MIX_SUFFIX)
    ]


def render_mix(job_id, gains, output_format, save_to_server):
    job = find_job_by_id(job_id)
    if job is None:
        raise FileNotFoundError("No job found.")
    stems_dir = os.path.join(get_job_directory(job_id), "output")
    stems = get_stem_file_names(job_id)

    # saved mixes go in output/ , download-only mixes go to a temp folder
    output_dir = stems_dir if save_to_server else tempfile.mkdtemp()
    job_name = os.path.splitext(job["file_name"] or "mix")[0]
    mix_path = os.path.join(output_dir, f"{job_name}{MIX_SUFFIX}.{output_format}")

    # each stem gets its fader volume, then they're summed at unity (no master gain)
    inputs = []
    filters = []
    for i, stem in enumerate(stems):
        gain = min(max(float(gains.get(stem, 1.0)), 0.0), 1.0)
        inputs += ["-i", os.path.join(stems_dir, stem)]
        filters.append(f"[{i}:a]volume={gain}[a{i}]")
    mix_inputs = "".join(f"[a{i}]" for i in range(len(stems)))
    filters.append(f"{mix_inputs}amix=inputs={len(stems)}:normalize=0[out]")

    codecs = {
        "wav": ["-c:a", "pcm_s16le"],
        "flac": ["-c:a", "flac"],
        "mp3": ["-c:a", "libmp3lame", "-b:a", "320k"],
    }

    result = subprocess.run(
        ["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filters),
         "-map", "[out]", *codecs[output_format], mix_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500:])

    logger.info(f"Mix exported to [{mix_path}] for job: {job_id}.")
    return mix_path


def rename_job(job_id, new_name):
    """Rename a finished job: its audio file, its folder and jobs.json."""
    with jobs_lock:
        return _rename_job(job_id, new_name)


def _rename_job(job_id, new_name):
    jobs_data = get_jobs_data()
    job = next((j for j in jobs_data if j["job_id"] == job_id), None)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in TERMINAL_STATUSES:
        raise HTTPException(status_code=409, detail="Unable to rename an active job")
    if not job["path"] or not job["file_name"]:
        raise HTTPException(status_code=400, detail="This job has no files to rename")
    name = " ".join(sanitize_filename(new_name).split())  # also collapses double spaces
    if not name:
        raise HTTPException(status_code=400, detail="Name can't be empty")

    extension = os.path.splitext(job["file_name"])[1]
    old_dir = job["path"]
    new_dir = os.path.join("jobs", f"{name} ({job_id[:5]})")
    old_file = os.path.join(old_dir, job["file_name"])
    new_file = os.path.join(old_dir, name + extension)

    # rename the audio file, then the folder. if the folder fails, undo the file rename
    try:
        if os.path.exists(old_file):
            os.rename(old_file, new_file)
        try:
            os.rename(old_dir, new_dir)
        except OSError:
            if os.path.exists(new_file):
                os.rename(new_file, old_file)
            raise
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Rename failed: {e.strerror}")

    job["file_name"] = name + extension
    job["path"] = new_dir
    write_jobs_data(jobs_data)
    logger.info(f"Renamed job {job_id} to [{name}].")
    return job


def get_compressed_stem(stem_path):
    """Smaller MP3 copy of a stem, only for playback in the browser.
    Made once in the job's preview/ folder and reused. Exports never use it."""
    if stem_path.lower().endswith(".mp3"):
        return stem_path  # already small
    job_dir = os.path.dirname(os.path.dirname(stem_path))  # .../Job (id)/output/bass.wav -> .../Job (id)
    preview_path = os.path.join(job_dir, "preview", os.path.splitext(os.path.basename(stem_path))[0] + ".mp3")
    if not os.path.exists(preview_path):
        os.makedirs(os.path.dirname(preview_path), exist_ok=True)
        # write to a temp name first, so a half written file is never served
        temp_path = f"{preview_path}.{uuid.uuid4().hex}.mp3"
        subprocess.run(["ffmpeg", "-y", "-i", stem_path, "-c:a", "libmp3lame", "-b:a", "192k", temp_path],
                       check=True, capture_output=True)
        os.replace(temp_path, preview_path)
    return preview_path


def sanitize_filename(title):
    return re.sub(r'[<>:"/\\|?*]', '', title).strip()


def find_job_by_id(id):
    jobs_data = get_jobs_data()
    for job in jobs_data:
        if job["job_id"] == id:
            return job
    return None