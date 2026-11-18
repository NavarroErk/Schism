# Stage 1 - Build React frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json .
RUN npm ci
COPY frontend .
RUN npm run build

# Stage 2 - Python backend
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENV TORCH_HOME=/app/models
ENV HF_HOME=/app/models/huggingface

COPY backend/ .

# Copy React build output into backend static folder
COPY --from=frontend /app/dist ./static

RUN chmod +x start.sh
CMD ["./start.sh"]
