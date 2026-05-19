# Migration status

Last update: 2026-05-19T12:52:44-03:00
Current block: 1
Current task within block: 8
Branch: block-1-infrastructure
Last commit: f40b405
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

## Next steps
- Continue Block 1 Task 8: add GitHub Actions deploy workflow. This requires GitHub Actions deploy secrets (`OPS_SSH_PRIVATE_KEY`, `OPS_HOST`, `OPS_USER`) to be configured before the workflow can deploy from `main`.

## Blockers / questions
- Local shell currently has no `docker` or `psql`, so DB-positive tests cannot run locally. I used isolated temporary VPS containers as the verification path for Task 4.

## How to resume
Read this `STATUS.md`, then continue with Block 1 Task 5 in `docs/superpowers/plans/2026-05-15-block-1-infrastructure.md`.
