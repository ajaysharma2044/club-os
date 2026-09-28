FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates restic openssh-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
COPY services/quant/ /app/services/quant/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production CEC_DATABASE=/data/cec.sqlite

# Starts as root ONLY to chown the mounted volume, then drops to `node`.
# See docker-entrypoint.sh for why this is necessary.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3000
# Bind to every interface, not just loopback.
#
# `next start` alone was only ever reachable because compose.production.yaml
# overrides the command with --hostname 0.0.0.0. Anyone deploying this
# Dockerfile directly — Fly, Railway, Render, a plain `docker run` — got a
# container that builds, starts, reports healthy to itself and accepts no
# external connection. PORT is honoured because most platforms assign it.
CMD ["sh", "-c", "npm run start -- --hostname 0.0.0.0 --port ${PORT:-3000}"]
