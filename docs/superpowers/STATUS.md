# Migration status

Last update: 2026-05-19T12:50:58-03:00
Current block: 1
Current task within block: 7
Branch: block-1-infrastructure
Last commit: cde8c0f
Tests: 4/4 API health tests passing in temporary VPS containers; `ops/web` production build passing; compose smoke passing on VPS temp stack; production dependency audit has 0 vulnerabilities

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

## Next steps
- Continue Block 1 Task 7: deploy the stack to `/srv/ops` on the VPS and verify TLS on `ops-staging.recycleobject.ru`.

## Blockers / questions
- Local shell currently has no `docker` or `psql`, so DB-positive tests cannot run locally. I used isolated temporary VPS containers as the verification path for Task 4.

## How to resume
Read this `STATUS.md`, then continue with Block 1 Task 5 in `docs/superpowers/plans/2026-05-15-block-1-infrastructure.md`.
