#!/bin/sh
# Container entrypoint: restore the database from R2 when this instance starts empty, then run the server under
# Litestream, which streams every write to R2 (about one second behind) and exits when the server exits.
set -eu

if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  echo "[entrypoint] R2 credentials missing — refusing to start without backups" >&2
  exit 1
fi

cd /app/server
exec litestream replicate -config /etc/litestream.yml -restore-if-db-not-exists \
  -exec "node --import tsx src/index.ts"
