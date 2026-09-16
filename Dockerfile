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
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
