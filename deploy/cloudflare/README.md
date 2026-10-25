# ai visibility on Cloudflare

```
browser ──► Cloudflare Access ──► Worker "ai-visibility" (your hostname)
                                   ├─ static SPA (Workers Static Assets)
                                   ├─ /api/* ─► Container (Node server, port 8080) ──► AI engine APIs
                                   │              └─ Litestream ──► R2 bucket "ai-visibility-db" (continuous SQLite backup)
                                   └─ cron */5 ─► keeps the container awake (scheduler + batch poller)
customer sites ──► /api/ingest, /api/collect, /px.js (public, no Access)
```

- **Account:** any Cloudflare account on Workers Paid (Containers need it), with a zone for the hostname ai visibility runs on.
- **Cost:** ≈ $7/month on top of Workers Paid ($5/month) — one always-on `basic` container (1/4 vCPU, 1 GiB) beyond the plan's included container allowance. R2 storage for a <100 MB database is within the free tier. AI engine API usage is billed by each provider.
- **Data:** the SQLite database lives on the container disk and is streamed to R2 by Litestream (about one second behind). A fresh or restarted container restores it from R2 before the server starts, so deploys and restarts keep all data.
- **Auth:** Cloudflare Access (email one-time code) protects the hostname; the Worker verifies the Access token again on every API call and refuses everything if Access isn't configured. Ingestion endpoints are public so customer sites can report bot hits.

## One-time setup

1. **Config:** `cp wrangler.example.jsonc wrangler.jsonc` (git-ignored) and fill in your `account_id`, the hostname (`routes` pattern and `PUBLIC_HOSTNAME`) and `R2_ACCOUNT_ID` (the same account ID).
2. **Docker engine** (to build the container image): `brew install colima docker docker-buildx && colima start --arch x86_64 --cpu 2 --memory 4` (or Docker Desktop / OrbStack).
3. **Workers Paid** on the account, and R2 enabled (dash → R2).
4. **R2 bucket and credentials for Litestream:** `npx wrangler r2 bucket create ai-visibility-db`, then dash → R2 → Manage API tokens → *Create Account API token* → permission *Object Read & Write*, scoped to bucket `ai-visibility-db`. Add to the repo-root `.env`:
   ```
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   ```
5. **Public ingestion is authenticated:** server snippets and log uploads send the project's secret ingest token (Integrations page; rotate it there). The public site key in the referral script can only report AI referral visits. Per-IP edge limits (`ratelimits` in wrangler.jsonc), per-site request/event budgets and daily caps bound abuse.
6. **Secrets:** `node deploy/cloudflare/push-secrets.mjs` (engine keys + R2 credentials from `.env`; values are never printed).
7. **Seed the database** (optional, before the first deploy only — uploads your local `server/data/app.db`): `sh deploy/cloudflare/seed-db.sh`
8. **Deploy:** `npm run build && npx wrangler deploy`
9. **Cloudflare Access** (Zero Trust → Access → Applications):
   - *Self-hosted* app **ai visibility** — your hostname, policy *Allow* → *Emails*: the people who may use it. Login method: One-time PIN.
   - *Self-hosted* app **ai visibility public endpoints** — destinations `<hostname>/api/ingest`, `/api/collect`, `/px.js`, `/api/health`; policy action *Bypass* → *Everyone*.
   - From the **ai visibility** app copy the *Application Audience (AUD) tag*; the team domain is `https://<team>.cloudflareaccess.com`. Uncomment `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` in the `vars` of `wrangler.jsonc`, fill them in, then `npx wrangler deploy` again.

## Day to day

- **Scheduled checks** run on this hosted instance; a local `npm run dev` with the same keys doesn't run them (set `SCHEDULER=on` to override), so checks are never paid for twice.
- **Deploy a change:** `npm run build && npx wrangler deploy` (rolling container restart; in-flight checks resume after restart, provider batches are never lost).
- **Logs:** `npx wrangler tail` (Worker) · Workers & Pages → your Worker → Containers for container logs.
- **Rotate a key:** update `.env`, rerun `push-secrets.mjs`, redeploy.
- **Restore to a point in time:** `litestream restore -timestamp <RFC3339> …` with the same config (see litestream.io/reference/restore).
