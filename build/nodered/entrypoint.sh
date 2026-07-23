#!/bin/sh
set -e

# Start Piper TTS API daemon in background
echo "[Entrypoint] Starting Piper TTS API daemon on port 5000..."
python3 -m uvicorn app:app --host 0.0.0.0 --port 5000 &

# Start Node-RED in foreground
echo "[Entrypoint] Starting Node-RED on port 1880..."
exec node-red --userDir /data
