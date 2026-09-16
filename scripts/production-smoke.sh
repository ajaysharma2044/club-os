#!/usr/bin/env bash
# Isolated container smoke test. Run from repository root; requires Docker.
set -euo pipefail
smoke_name="club-os-smoke-$$"
smoke_volume="$smoke_name-data"
cleanup() {
  docker rm -f "$smoke_name" >/dev/null 2>&1 || true
  docker volume rm "$smoke_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
ready() {
  for attempt in $(seq 1 60); do
    if docker exec "$smoke_name" node -e "fetch('http://127.0.0.1:3000/api/cec/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo 'Container failed to become healthy.' >&2
  return 1
}
docker build -t club-os:smoke .
docker volume create "$smoke_volume" >/dev/null
docker run -d --name "$smoke_name" --network none -v "$smoke_volume:/data" -e CEC_ORIGIN=https://smoke.example.test club-os:smoke >/dev/null
ready
docker exec "$smoke_name" node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const d=new DatabaseSync("/data/cec.sqlite"); d.prepare("INSERT INTO settings VALUES (?,?)").run("container_smoke","persisted"); d.close();'
docker exec "$smoke_name" python3 ../services/quant/pipeline.py backup --backups /data/backups >/dev/null
docker restart "$smoke_name" >/dev/null
ready
docker exec "$smoke_name" node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const d=new DatabaseSync("/data/cec.sqlite"); if(d.prepare("SELECT value FROM settings WHERE key=?").get("container_smoke").value!=="persisted") process.exit(1); if(d.prepare("PRAGMA foreign_key_check").all().length) process.exit(1); d.close();'
echo 'Container health, persistent-volume restart, and SQLite backup smoke checks passed.'
