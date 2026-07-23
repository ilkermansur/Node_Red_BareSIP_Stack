FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    baresip \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 5060/udp 5060/tcp 5555/tcp 10000-10020/udp

ENTRYPOINT ["baresip", "-f", "/root/.baresip"]
