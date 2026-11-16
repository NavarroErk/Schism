#!/bin/sh
if [ "$YTDLP_AUTO_UPDATE" != "false" ]; then
    echo "Updating yt-dlp"
    pip install -U -q yt-dlp || echo "yt-dlp update failed, using installed version"
fi
exec uvicorn main:app --host 0.0.0.0 --port 8212