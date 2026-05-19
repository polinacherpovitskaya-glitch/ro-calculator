# Migration status

Last update: 2026-05-19T12:55:50-03:00
Current block: 1
Current task within block: 9
Branch: block-1-infrastructure
Last commit: 7e2b6fd
Tests: 4/4 API health tests passing in temporary VPS containers; `ops/web` production build passing; compose smoke passing on VPS temp stack; live staging health `db.ok=true`; production dependency audit has 0 vulnerabilities

## What was just done
- Read `docs/superpowers/CODEX-KICKOFF.md` and all required linked docs before editing code.
- Completed Block 1 Task 4: added `ops/db/migrations/001_init.sql`, `ops/db/migrate.sh`, `ops/api/src/db.js`.
- Extended `/api/health` to report DB status and latency, returning `status: "degraded"` when DB ping fails.
- Extended `ops/api/test/health.test.js` with DB-ok and DB-unreachable cases.
- Verified the task on `ops-staging.recycleobject.ru` VPS with an isolated temporary Postgres container and Node test container. No project staging data was touched.
- Completed Block 1 Task 5: added Vue 3 + Vite + Pinia + vue-router skeleton in `ops/web`.
- Added placeholder route `/` that displays API health from `/api/health`.
- Ran `npm run build` successfully in `ops/web`.
- Completed Block 1 Task 6: added API Dockerfile, Caddyfile, docker-compose stack, and infra `.env.example`.
- Verified compose on the VPS in a temporary directory with temporary containers/volumes: Postgres, API, and Caddy started; `GET /api/health` returned `db.ok=true`; SPA returned `<title>RO Ops</title>`.
- Completed Block 1 Task 7: deployed `/srv/ops` to the VPS, generated `/srv/ops/infra/.env` with a private Postgres password, built web on the VPS, started the real staging compose stack.
- Caddy obtained a Let's Encrypt certificate for `ops-staging.recycleobject.ru`.
- Verified `https://ops-staging.recycleobject.ru/api/health` returns `status: "ok"` and `db.ok=true`.
- Completed Block 1 Task 8 code/setup: generated and installed GitHub Actions deploy key, set GitHub secrets `OPS_SSH_PRIVATE_KEY`, `OPS_HOST`, `OPS_USER`, added `.github/workflows/ops-deploy.yml`, and pushed `block-1-infrastructure`.
- Workflow runs tests/builds on PRs and deploys only on push to `main`.
- Added Block 1 Task 9/10 scripts that do not require secrets to write: `backup.sh`, `restore.sh`, `ops-backup.service`, `ops-backup.timer`.
- Syntax-checked backup/restore scripts with `bash -n`; no whitespace errors from `git diff --check`.

## Next steps
- Configure Selectel Object Storage credentials on the VPS, install the systemd timer, run a manual backup, then run restore drill.
- Need `S3_ACCESS_KEY` and `S3_SECRET_KEY` for bucket `ro-ops-backups` before backup/restore verification can be completed.

## Blockers / questions
- Need Selectel Object Storage S3 credentials (`S3_ACCESS_KEY`, `S3_SECRET_KEY`) for Task 9 backup verification.
- Local shell currently has no `docker` or `psql`, so DB-positive tests cannot run locally. I used isolated temporary VPS containers as the verification path.

## How to resume
Read this `STATUS.md`, then continue with Block 1 Task 5 in `docs/superpowers/plans/2026-05-15-block-1-infrastructure.md`.
