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

case "$(uname -s)" in Darwin) OS=darwin ;; Linux) OS=linux ;; *) echo "Unsupported OS: $(uname -s) (run this on macOS or Linux)." >&2; exit 1 ;; esac
case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; *) ARCH=x86_64 ;; esac
# SHA-256 of each archive, from the release's checksums.txt (change together with VERSION).
case "$OS-$ARCH" in
  linux-x86_64) SUM=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d ;;
  linux-arm64) SUM=f8ca4a050095c1efbda2c4365172e61bf9d955ea0d9ac42f448b52e51819baa5 ;;
  darwin-x86_64) SUM=891875af09db152e93a4b31a8a79f538ce7ce702c132803cfe0a831e7cb1b7db ;;
  darwin-arm64) SUM=e211f68ff7658d19f193f2914417afdf8f89a053ff8f263e5d6b3b1d3bbc7b08 ;;
esac
curl -fsSL -o "$WORK/litestream.tar.gz" "https://github.com/benbjohnson/litestream/releases/download/v${VERSION}/litestream-${VERSION}-${OS}-${ARCH}.tar.gz"
if command -v sha256sum > /dev/null; then GOT=$(sha256sum "$WORK/litestream.tar.gz" | cut -d' ' -f1); else GOT=$(shasum -a 256 "$WORK/litestream.tar.gz" | cut -d' ' -f1); fi
[ "$GOT" = "$SUM" ] || { echo "Litestream download doesn't match its published checksum; stopping." >&2; exit 1; }
tar -xzf "$WORK/litestream.tar.gz" -C "$WORK" litestream

# Consistent snapshot even while the local server is running.
sqlite3 server/data/app.db "VACUUM INTO '$WORK/app.db'"
sqlite3 "$WORK/app.db" "PRAGMA journal_mode = WAL" > /dev/null  # Litestream replicates WAL-mode databases

set -a; . ./.env; set +a
export R2_BUCKET R2_ACCOUNT_ID
sed "s#/data/app.db#$WORK/app.db#" deploy/cloudflare/litestream.yml > "$WORK/litestream.yml"
"$WORK/litestream" replicate -config "$WORK/litestream.yml" -once
echo "Seeded R2 replica overt/app.db from server/data/app.db ($(du -h "$WORK/app.db" | cut -f1))."
