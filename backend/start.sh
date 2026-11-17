#!/bin/sh
PUID=${PUID:-1000}
PGID=${PGID:-1000}

# update yt-dlp while still root
if [ "$YTDLP_AUTO_UPDATE" != "false" ]; then
    echo "Updating yt-dlp"
    pip install -U -q yt-dlp || echo "yt-dlp update failed, using installed version"
fi

# set data folders perms to PUID:PGID if not already done
for dir in /app/jobs /app/logs /app/models; do
    mkdir -p "$dir"
    if [ "$(stat -c %u:%g "$dir")" != "$PUID:$PGID" ]; then
        echo "Setting owner of $dir to $PUID:$PGID"
        chown -R "$PUID:$PGID" "$dir"
    fi
done

export HOME=/tmp

# drop root and start the app as PUID:PGID
exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups uvicorn main:app --host 0.0.0.0 --port 8212