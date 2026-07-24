FROM python:3.10-slim

WORKDIR /usr/src/node-red

ENV NODE_PATH=/usr/lib/node_modules:/usr/local/lib/node_modules

# Install Node.js, FFmpeg, Curl, CA Certs
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements for Piper TTS API
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Node-RED globally and required npm packages
RUN npm install -g --unsafe-perm node-red node-red-contrib-python-function node-red-contrib-postgresql bcryptjs

# Create node-red user and directories
RUN useradd -m -u 1000 node-red && \
    mkdir -p /data /app/models /tmp/media && \
    chown -R node-red:node-red /data /app /tmp/media /usr/src/node-red

COPY app.py /usr/src/node-red/app.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node-red
EXPOSE 1880 5000

ENTRYPOINT ["/entrypoint.sh"]
