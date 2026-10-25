#!/bin/sh
# Container entrypoint. With R2 credentials (the Cloudflare setup): restore the database from R2 when this instance
# starts empty, then run the server under Litestream, which streams every write to R2 (about one second behind) and
# exits when the server exits. With BACKUPS=off (any other host): run the server alone; the database in $DATA_DIR is
# only as safe as the volume it sits on.
set -eu

cd /app/server

if [ "${BACKUPS:-}" = "off" ]; then
  echo "[entrypoint] BACKUPS=off: no R2 backups. Keep ${DATA_DIR:-/data} on a persistent volume and back it up yourself." >&2
  exec node --import tsx src/index.ts
fi

if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  echo "[entrypoint] R2 credentials missing — refusing to start without backups." >&2
  echo "[entrypoint] Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID and R2_BUCKET, or BACKUPS=off to run without them." >&2
  exit 1
fi

exec litestream replicate -config /etc/litestream.yml -restore-if-db-not-exists \
  -exec "node --import tsx src/index.ts"
