from fastapi import FastAPI, HTTPException, BackgroundTasks, Response, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import Literal
from datetime import datetime, timezone
import time
import uuid
import logging
import os
from logging.handlers import RotatingFileHandler
import shutil
from helpers import check_dependencies, get_jobs_data, write_jobs_data, process_url_job, process_file_job, update_job_status, find_job_by_id, sanitize_filename, update_job_path, get_job_directory, get_stem_file_names, render_mix



# on server start, any job still running should be set to status = failed
@asynccontextmanager
async def lifespan(app:FastAPI):
    # startup logic
    jobs_data = get_jobs_data()

    TERMINAL_STATUSES = ["Success", "YT-DLP Failed", "Demucs Failed", "Failed"]

    for job in jobs_data:
        print(job["status"])
        if job["status"] not in TERMINAL_STATUSES:
            update_job_status(job["job_id"], "Failed", "Server restarted unexpectedly")
            
    yield
    # shutdown logic (as necessary)

app = FastAPI(lifespan=lifespan)

# implement uvicorn logger
logger = logging.getLogger("uvicorn")
os.makedirs("logs", exist_ok=True)
handler = RotatingFileHandler("logs/app.log", maxBytes=10_000_000, backupCount=3)
handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
handler.formatter.converter = time.localtime
for name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(name).addHandler(handler)


origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#! on server start, check for ffmpeg (alert user if not installed)


@app.get("/api/health")
def health():
    return {"status": "ok", "dependencies": check_dependencies()}


class URLJobRequest(BaseModel):
    url: str
    output_format: Literal["wav", "flac", "mp3"]
    demucs_model: Literal["htdemucs", "htdemucs_ft", "htdemucs_6s"]

@app.post("/api/jobs/url")
def post_url_job(request: URLJobRequest, background_tasks: BackgroundTasks):
    jobs_data = get_jobs_data()
    job_id = str(uuid.uuid4())

    new_job = {
        "job_id": job_id,
        "url": request.url,
        "file_name": None,
        "path": None,
        # "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "output_format": request.output_format,
        "demucs_model": request.demucs_model,
        "status": "Starting job.",
        "error": None
    }

    # create and write new job to jobs_data
    jobs_data.append(new_job)
    write_jobs_data(jobs_data)
    
    # update_job_status(job_id, "Job Created", None)

    # run task in background
    background_tasks.add_task(process_url_job,job_id, request.url, request.output_format, request.demucs_model)
    return f"Job Created: {job_id}"

  
@app.post("/api/jobs/file")
async def post_file_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    output_format: Literal["wav", "flac", "mp3"] = Form(...),
    demucs_model: Literal["htdemucs", "htdemucs_ft", "htdemucs_6s"] = Form(...),
):
    jobs_data = get_jobs_data()
    job_id = str(uuid.uuid4())

    name = sanitize_filename(os.path.splitext(file.filename or "upload")[0])
    os.makedirs(os.path.join("jobs", f"{name} ({job_id[:5]})"), exist_ok=True)

    new_job = {
        "job_id": job_id,
        "url": "N/A",
        "file_name": file.filename,
        "path": None,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "output_format": output_format,
        "demucs_model": demucs_model,
        "status": "Starting job.",
        "error": None
    }

    file_path = f"{f"jobs/{name} ({job_id[:5]})"}/{file.filename}"
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # create and write new job to jobs_data
    jobs_data.append(new_job)
    write_jobs_data(jobs_data)
    update_job_path(job_id, os.path.join("jobs", f"{name} ({job_id[:5]})"))

    background_tasks.add_task(process_file_job,job_id, output_format, demucs_model)
    return f"Job Created: {job_id}"

@app.get("/api/jobs/{id}/stem-file-names")
def get_stem_paths_by_id(id: str):
    return get_stem_file_names(id)

@app.get("/api/jobs/{id}/stem/{stemFileName}")
def get_stem_file(id: str, stemFileName: str):
    path_to_stem = os.path.join(get_job_directory(id), "output")

    print(f"\n\n\n\nReceived id: {id}\n\nFile name: {stemFileName}")

    return FileResponse(os.path.join(path_to_stem, stemFileName))

        

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

@app.delete("/api/jobs/{id}")
def delete_job_by_id(id:str):
    #! Handle deletion of active job
    job = find_job_by_id(id)
    if job is None:    
        raise HTTPException(status_code=404, detail="Job not found")
    # null check and 
    elif job["path"] is not None and os.path.exists(job["path"]):
        path = job["path"]

        try:
            shutil.rmtree(path)
            jobs_data = get_jobs_data()
            # remove job by id from jobs_data
            jobs_data = [job for job in jobs_data if job["job_id"] != id]
            write_jobs_data(jobs_data)
            return f"Removed Job with ID: {id}" 

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete directory: {str(e)}")

        # return f'Job exists at path: [{path}]'
    else:
        jobs_data = get_jobs_data()
        # remove job by id from jobs_data
        jobs_data = [job for job in jobs_data if job["job_id"] != id]
        write_jobs_data(jobs_data)
        return f"Removed Job with ID: {id}"




if os.path.exists("static"):
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join("static", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("static/index.html")