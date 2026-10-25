# Security policy

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub: **Security → Report a vulnerability** on this repository. If that isn't possible, email hello@analitikisler.com with the subject "ai visibility security".

Include what you found, how to reproduce it, and what an attacker could do with it. Analitik İşler will confirm it got the report and keep you updated until it's fixed. Credit in the release notes is yours if you want it.

## Supported versions

Only the latest `main` gets security fixes.

## Scope

Most relevant are the parts reachable without a login:

- the ingestion endpoints (`/api/ingest/*`, `/api/collect/*`) and the referral pixel (`/px.js`)
- server-side fetches (AI-readiness audit, sitemap, onboarding suggestions), which must only reach public addresses
- the Cloudflare Worker's Access check in `deploy/cloudflare/worker.ts`

Also in scope: anything that leaks engine API keys or ingest tokens, or lets one project read or write another's data.

Out of scope: a self-hosted copy exposed without `APP_USER`/`APP_PASSWORD` or Cloudflare Access after the operator added its host to `ALLOWED_HOSTS`, and the costs of engine API keys you configure yourself.
