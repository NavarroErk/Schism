from fastapi import FastAPI, HTTPException, BackgroundTasks, Response, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import Literal
import time
import uuid
import logging
import os
from logging.handlers import RotatingFileHandler
import shutil
from helpers import check_dependencies, get_jobs_data, process_url_job, process_file_job, update_job_status, find_job_by_id, sanitize_filename, get_job_directory, get_stem_file_names, render_mix, get_job_timestamp, rename_job, TERMINAL_STATUSES, get_demucs_input_file, get_compressed_stem, job_queue, start_job_worker, add_job, remove_job


@asynccontextmanager
async def lifespan(app:FastAPI):
    # startup logic
    jobs_data = get_jobs_data()

    for job in jobs_data:
        if job["status"] not in TERMINAL_STATUSES:
            update_job_status(job["job_id"], "Failed", "Server restarted unexpectedly")

    start_job_worker()  # runs queued jobs one at a time for the life of the server
    yield
    # shutdown logic (as necessary)

app = FastAPI(lifespan=lifespan)

# implement uvicorn logger
logger = logging.getLogger("uvicorn")
os.makedirs("logs", exist_ok=True)
handler = RotatingFileHandler("logs/app.log", maxBytes=10_000_000, backupCount=3)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
formatter.converter = time.localtime
handler.setFormatter(formatter)
for name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(name).addHandler(handler)

@app.get("/api/health")
def health():
    return {"status": "ok", "dependencies": check_dependencies()}

class URLJobRequest(BaseModel):
    url: str
    output_format: Literal["wav", "flac", "mp3"]
    demucs_model: Literal["htdemucs", "htdemucs_ft", "htdemucs_6s"]

@app.post("/api/jobs/url")
def post_url_job(request: URLJobRequest):
    job_id = str(uuid.uuid4())

    new_job = {
        "job_id": job_id,
        "url": request.url,
        "file_name": None,
        "path": None,
        "date": get_job_timestamp(),
        "output_format": request.output_format,
        "demucs_model": request.demucs_model,
        "status": "Queued",
        "error": None
    }
    add_job(new_job)

    # get in line, the worker runs it when it's this job's turn
    job_queue.put((process_url_job, (job_id, request.url, request.output_format, request.demucs_model)))
    return f"Job Created: {job_id}"

  
@app.post("/api/jobs/file")
async def post_file_job(
    file: UploadFile = File(...),
    output_format: Literal["wav", "flac", "mp3"] = Form(...),
    demucs_model: Literal["htdemucs", "htdemucs_ft", "htdemucs_6s"] = Form(...),
):
    job_id = str(uuid.uuid4())

    name = sanitize_filename(os.path.splitext(file.filename or "upload")[0])
    os.makedirs(os.path.join("jobs", f"{name} ({job_id[:5]})"), exist_ok=True)

    new_job = {
        "job_id": job_id,
        "url": "N/A",
        "file_name": file.filename,
        "path": os.path.join("jobs", f"{name} ({job_id[:5]})"),
        "date": get_job_timestamp(),
        "output_format": output_format,
        "demucs_model": demucs_model,
        "status": "Queued",
        "error": None
    }

    file_path = f"{f"jobs/{name} ({job_id[:5]})"}/{file.filename}"
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    add_job(new_job)
    job_queue.put((process_file_job, (job_id, output_format, demucs_model)))
    return f"Job Created: {job_id}"

@app.get("/api/jobs/{id}/stem-file-names")
def get_stem_paths_by_id(id: str):
    return get_stem_file_names(id)

@app.get("/api/jobs/{id}/stem/{stemFileName}")
def get_stem_file(id: str, stemFileName: str, compressed: bool = False):
    stem_path = os.path.join(get_job_directory(id), "output", stemFileName)
    # compressed = smaller copy for faster loading in Studio/Practice (export always uses the originals)
    if compressed:
        stem_path = get_compressed_stem(stem_path)
    return FileResponse(stem_path)

        

class ExportRequest(BaseModel):
    output_format: Literal["wav", "flac", "mp3"]
    gains: dict[str, float]
    save_to_server: bool
    download: bool

@app.post("/api/jobs/{id}/export")
def export_mix(id: str, request: ExportRequest, background_tasks: BackgroundTasks):
    job = find_job_by_id(id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if not request.save_to_server and not request.download:
        raise HTTPException(status_code=400, detail="Choose at least one destination")

    try:
        mix_path = render_mix(id, request.gains, request.output_format, request.save_to_server)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

    # download only - delete temp copy after it's sent
    if not request.save_to_server:
        background_tasks.add_task(shutil.rmtree, os.path.dirname(mix_path), ignore_errors=True)

    if request.download:
        return FileResponse(mix_path, filename=os.path.basename(mix_path))
    return {"saved": os.path.basename(mix_path)}


@app.get("/api/jobs")
def get_jobs(response: Response):
    response.headers["Cache-Control"] = "no-store"
    jobs_data = get_jobs_data()
    return jobs_data


@app.get("/api/jobs/{id}")
def get_job_by_id(id: str):
    job = find_job_by_id(id)
    if job is None:    
        raise HTTPException(status_code=404, detail="Job not found")
    else:
        return job

class RenameRequest(BaseModel):
    name: str

@app.patch("/api/jobs/{id}")
def rename_job_by_id(id: str, request: RenameRequest):
    return rename_job(id, request.name)

@app.post("/api/jobs/{id}/retry")
def retry_job(id: str):
    job = find_job_by_id(id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    # stops a double click from starting two runs of the same job
    if job["status"] not in ["YT-DLP Failed", "Demucs Failed", "Failed"]:
        raise HTTPException(status_code=409, detail="Only failed jobs can be retried")
    # check the audio is still on disk before starting (also catches a missing folder)
    if job["path"]:
        try:
            get_demucs_input_file(job["path"])
        except FileNotFoundError:
            raise HTTPException(status_code=400, detail="Audio file is missing. Delete this job and start a new one")

    update_job_status(id, "Queued")  # also clears the error

    # path is only set once the audio is on disk (uploaded, or downloaded by yt-dlp)
    if job["path"]:
        # remove a half finished demucs folder, if there is one
        shutil.rmtree(os.path.join(job["path"], job["demucs_model"]), ignore_errors=True)
        job_queue.put((process_file_job, (id, job["output_format"], job["demucs_model"])))
    else:
        job_queue.put((process_url_job, (id, job["url"], job["output_format"], job["demucs_model"])))
    return f"Retrying job: {id}"

@app.delete("/api/jobs/{id}")
def delete_job_by_id(id:str):
    #! Handle deletion of active job
    job = find_job_by_id(id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["path"] is not None and os.path.exists(job["path"]):
        try:
            shutil.rmtree(job["path"])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete directory: {str(e)}")
    remove_job(id)
    return f"Removed Job with ID: {id}"




if os.path.exists("static"):
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join("static", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("static/index.html")