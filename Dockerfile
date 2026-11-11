# syntax=docker/dockerfile:1
# ai visibility container: the Node server (API + SPA) with its SQLite database in /data, for amd64 and arm64.
# With R2 credentials, Litestream replicates the database to R2; that is the Cloudflare setup, built by `wrangler deploy`
# (see deploy/cloudflare/README.md). Anywhere else, run it with BACKUPS=off and a volume on /data (see README.md).

# ---- web: build the SPA (plain static files, so it runs once on the build machine for every target CPU) ------------
FROM --platform=$BUILDPLATFORM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w web --include-workspace-root=false --no-audit --no-fund
COPY shared shared
COPY brand brand
COPY web web
RUN npm run build -w web

# ---- runtime -----------------------------------------------------------------------------------------------------
FROM node:24-slim
# The archive is checked against the SHA-256 the release publishes (checksums.txt); change version and sums together.
ARG LITESTREAM_VERSION=0.5.17
ARG LITESTREAM_SHA256_AMD64=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
ARG LITESTREAM_SHA256_ARM64=f8ca4a050095c1efbda2c4365172e61bf9d955ea0d9ac42f448b52e51819baa5
ARG TARGETARCH
RUN case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) LITESTREAM_ARCH=x86_64 LITESTREAM_SHA256=$LITESTREAM_SHA256_AMD64 ;; \
      arm64) LITESTREAM_ARCH=arm64 LITESTREAM_SHA256=$LITESTREAM_SHA256_ARM64 ;; \
      *) echo "unsupported architecture: ${TARGETARCH:-$(dpkg --print-architecture)}" >&2; exit 1 ;; \
    esac \
  && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL -o /tmp/litestream.tar.gz "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${LITESTREAM_ARCH}.tar.gz" \
  && echo "${LITESTREAM_SHA256}  /tmp/litestream.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream && rm /tmp/litestream.tar.gz \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server --no-audit --no-fund && npm cache clean --force
COPY shared shared
COPY server/src server/src
COPY --from=web /app/web/dist web/dist
COPY deploy/cloudflare/litestream.yml /etc/litestream.yml
COPY deploy/cloudflare/entrypoint.sh /usr/local/bin/ai-visibility-entrypoint

ENV NODE_ENV=production PORT=8080 DATA_DIR=/data WEB_DIST=/app/web/dist
RUN mkdir -p /data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/ai-visibility-entrypoint"]
