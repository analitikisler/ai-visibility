# syntax=docker/dockerfile:1
# ai visibility on Cloudflare Containers: the Node server (API + SPA) with Litestream replicating its SQLite database to R2.
# Built by `wrangler deploy` (see wrangler.jsonc and deploy/cloudflare/README.md).

# ---- web: build the SPA ------------------------------------------------------------------------------------------
FROM node:25-slim AS web
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
FROM node:25-slim
ARG LITESTREAM_VERSION=0.5.17
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz" \
     | tar -xz -C /usr/local/bin litestream \
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
