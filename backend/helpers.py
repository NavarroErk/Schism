from fastapi import HTTPException
import shutil
import importlib.util
import subprocess
import tempfile
import json
import yt_dlp
import demucs.separate
import os
import re
import logging


logger = logging.getLogger("uvicorn")

MIX_SUFFIX = " - MIX"


def check_dependencies():
    return [
        {"name": "ffmpeg", "found": shutil.which("ffmpeg") is not None},
        {"name": "yt_dlp", "found": importlib.util.find_spec("yt_dlp") is not None},
        {"name": "demucs", "found": importlib.util.find_spec("demucs") is not None},
    ]

def process_url_job(job_id, url, output_format, demucs_model):
    run_ytdlp(job_id, url)
    run_demucs(job_id, output_format, demucs_model)
    update_job_status(job_id, "Success")


def process_file_job(job_id, output_format, demucs_model):
    run_demucs(job_id, output_format, demucs_model)
    update_job_status(job_id, "Success")


def run_ytdlp(job_id, url):
    try:
        update_job_status(job_id, "Downloading Audio", None)
        options = {
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
            downloaded_title = sanitize_filename(f'{extracted_info["title"]}')
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

        if output_format == "wav":
            demucs.separate.main(["-n", demucs_model, "-o", job_directory, file_to_split])
        else:
            demucs.separate.main(["-n", demucs_model, "-o", job_directory, f"--{output_format}", file_to_split])

        # move output files up one directory, delete directory, rename parent directory     
        model_dir_path = os.path.join(job_directory, demucs_model)
        stems_dir_path = os.path.join(model_dir_path, os.listdir(model_dir_path)[0])

        for stem in os.listdir(stems_dir_path):
            shutil.move(os.path.join(stems_dir_path, stem), model_dir_path)
        shutil.rmtree(stems_dir_path)
        os.rename(model_dir_path, os.path.join(job_directory, "output"))

        update_job_status(job_id, "Audio Split Success", None)
    
    except Exception as e:
        update_job_status(job_id, "Demucs Failed", str(e))
        raise

def get_job_directory(job_id):
    jobs_data = get_jobs_data()
    for job in jobs_data:
        if job["job_id"] == job_id:
            directory = job["path"]
            return directory
    raise FileNotFoundError("No job directory found.")
    

def get_demucs_input_file(job_directory):
    logger.info(os.listdir(job_directory))
    supported_types = (".wav", ".flac", ".mp3")
    for file in os.listdir(job_directory):
        if file.endswith(supported_types):
            return os.path.join(job_directory, file)
    raise FileNotFoundError("No supported audio file found")

def get_jobs_data():
    os.makedirs("jobs", exist_ok=True)
    if not os.path.exists("jobs/jobs.json"):
        with open("jobs/jobs.json", "w") as f:
            json.dump([], f)
    try:
        with open("jobs/jobs.json", "r") as jobs_json:
            jobs_data = json.load(jobs_json)
    except json.JSONDecodeError:
        logger.warning("jobs.json was malformed and has been reset to empty. Orphaned jobs remain on disk.")
        jobs_data = []
        with open("jobs/jobs.json", "w") as f:
            json.dump([], f)
    return jobs_data

def write_jobs_data(jobs_data):
    #! handle case where there is no jobs.json
    with open("jobs/jobs.json", "w") as jobs_json:
        json.dump(jobs_data, jobs_json, indent=2)

def update_job_file_name(job_id, file_name):
    jobs_data = get_jobs_data()
    for job in jobs_data:
        if job["job_id"] == job_id:
            job["file_name"] = file_name
            logger.info(f"File name updated to [{file_name}] for job: {job_id}.")
            break
    write_jobs_data(jobs_data)

def update_job_path(job_id, path):
    jobs_data = get_jobs_data()
    for job in jobs_data:
        if job["job_id"] == job_id:
            job["path"] = path
            logger.info(f"Path updated to [{path}] for job: {job_id}.")
            break
    write_jobs_data(jobs_data)

def update_job_status(job_id, status, error = None):
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


def sanitize_filename(title):
    return re.sub(r'[<>:"/\\|?*]', '', title).strip()


def find_job_by_id(id):
    jobs_data = get_jobs_data()
    for job in jobs_data:
        if job["job_id"] == id:
            return job
    return None