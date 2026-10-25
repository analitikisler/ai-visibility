#!/bin/sh
# One-time: upload the local database (server/data/app.db) to R2 as the Litestream replica the container restores on
# its first boot. Run BEFORE the first deploy, from the repo root: sh deploy/cloudflare/seed-db.sh
# Needs R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env, R2_ACCOUNT_ID / R2_BUCKET in wrangler.jsonc vars and the
# sqlite3 CLI. Downloads Litestream into a temp dir.
set -eu
var() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" wrangler.jsonc | head -n 1; }
R2_BUCKET=$(var R2_BUCKET) R2_ACCOUNT_ID=$(var R2_ACCOUNT_ID)
case "$R2_BUCKET$R2_ACCOUNT_ID" in
  ''|*'<'*) echo "Set R2_BUCKET and R2_ACCOUNT_ID in wrangler.jsonc vars first (copy wrangler.example.jsonc)." >&2; exit 1 ;;
esac
VERSION=0.5.17
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

ARCH=$(uname -m); [ "$ARCH" = "arm64" ] || ARCH=x86_64
curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${VERSION}/litestream-${VERSION}-darwin-${ARCH}.tar.gz" | tar -xz -C "$WORK" litestream

# Consistent snapshot even while the local server is running.
sqlite3 server/data/app.db "VACUUM INTO '$WORK/app.db'"
sqlite3 "$WORK/app.db" "PRAGMA journal_mode = WAL" > /dev/null  # Litestream replicates WAL-mode databases

set -a; . ./.env; set +a
export R2_BUCKET R2_ACCOUNT_ID
sed "s#/data/app.db#$WORK/app.db#" deploy/cloudflare/litestream.yml > "$WORK/litestream.yml"
"$WORK/litestream" replicate -config "$WORK/litestream.yml" -once
echo "Seeded R2 replica overt/app.db from server/data/app.db ($(du -h "$WORK/app.db" | cut -f1))."
