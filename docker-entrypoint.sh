#!/bin/sh
# Make the mounted volume writable, then drop privileges.
#
# THE BUG THIS FIXES: a mounted volume arrives owned by root. The image runs as
# `node`, so every write to /data failed with EACCES — on Fly, Railway, Render
# and plain `docker run` alike. compose.production.yaml hides this with a
# separate one-shot `permissions` service that chowns the volume first;
# nothing else does, so the Dockerfile only ever worked under compose.
#
# The container therefore starts as root, fixes ownership of the data
# directory only, and immediately drops to `node` for the actual process. Root
# does not survive into the application.
set -e

# compose.production.yaml runs a one-shot `permissions` service AS ROOT to
# chown the backup and operations volumes. If this entrypoint dropped it to
# `node`, that chown would fail and the whole stack would refuse to start, so
# that service sets CEC_ENTRYPOINT_ROOT=1 to opt out.
if [ "${CEC_ENTRYPOINT_ROOT:-}" = "1" ]; then
  exec "$@"
fi

DATA_DIR="$(dirname "${CEC_DATABASE:-/data/cec.sqlite}")"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR" "${CEC_BACKUP_DIR:-$DATA_DIR/backups}"
  chown -R node:node "$DATA_DIR"
  chmod 700 "$DATA_DIR"
  # setpriv (util-linux) is present in debian-slim, but do not bet the
  # container on it: an image that cannot start is worse than one that starts
  # with a slightly different privilege-dropping tool.
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  elif command -v su-exec >/dev/null 2>&1; then
    exec su-exec node "$@"
  elif command -v gosu >/dev/null 2>&1; then
    exec gosu node "$@"
  else
    exec su node -s /bin/sh -c 'exec "$0" "$@"' -- "$@"
  fi
fi

# Already unprivileged: the volume must have been prepared for us.
exec "$@"
