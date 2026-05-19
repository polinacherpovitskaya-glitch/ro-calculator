# Migration status

Last update: 2026-05-19T13:58:00-03:00
Current block: 3
Current task within block: Task 4 refresh/compare scripts
Branch: block-3-warehouse
Last commit: main `9a563e6` includes Block 2 merge
Tests: Block 2 PR checks passed; main deploy passed; live staging health `db.ok=true`; live auth smoke passed after deploy.

## What was just done

- Block 1 PR #36 was merged to `main`; GitHub Actions deploy to staging passed.
- Block 2 PR #37 was merged to `main`; GitHub Actions deploy run `26111396624` passed.
- Created `block-3-warehouse` from fresh `main`.
- Read Block 3 required docs before editing:
  - `docs/superpowers/plans/2026-05-15-block-3-warehouse.md`
  - `docs/superpowers/plans/2026-05-15-WAREHOUSE-INTERACTION-MAP.md`
  - `docs/superpowers/plans/2026-05-15-BUG-INVENTORY.md`
- Block 2 summary:
- Added migration `002_auth.sql` for `employees`, `auth_users`, `auth_sessions`, and `idempotency_keys`.
- Added `argon2`, `cookie-parser`, password hashing helpers, `withTransaction`, session store, auth middleware.
- Added `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/change-password`.
- Added protected `/api/employees`.
- Added employee refresh and temporary password scripts:
  - `ops/scripts/refresh/01-employees.mjs`
  - `ops/scripts/issue-temp-passwords.mjs`
  - `ops/api/scripts/hash.mjs`
- Added Vue login flow: auth API wrapper, Pinia auth store, `/login`, `/change-password`, route guards, logout button.
- Fixed `employees.id` / `auth_users.employee_id` to `BIGINT`; real Supabase employee IDs include timestamp-like values such as `1741700005000`.
- Added explicit `ws` transport for the Supabase refresh script so it works in the Node 20 Docker runtime.
- Copied `employees` from Supabase to staging Postgres: 14 rows total, 12 active.
- Confirmed current Supabase employee rows have no email values, so `/srv/ops/temp-passwords.csv` currently contains only the header row.
- Created staging admin credentials and stored them only on the VPS at `/srv/ops-secrets/admin-login.txt` with `0600` permissions. This path is outside the rsync deploy directory.
- Verified live auth smoke on staging: admin login, `/api/auth/me`, protected `/api/employees`, logout.
- Verified API tests 15/15 in isolated VPS containers with migrations 001+002.
- Verified `ops/web npm run build` locally.
- Added `ops/db/migrations/003_warehouse.sql` for warehouse items, reservations, and history. Because `orders` is not created until Block 9, `order_id` columns are raw `BIGINT` for now; Block 9 will add the FK/CASCADE.
- Verified migrations 001+002+003 on a clean temporary Postgres container on the VPS.
- Added `ops/api/src/idempotency.js` with required `Idempotency-Key`, cached JSON responses, and conflict detection when a key is reused on another method/path.
- Added `/api/warehouse` routes:
  - `GET/POST/PATCH/DELETE /items`
  - `GET/POST/PATCH /reservations`
  - `POST /reservations/:id/release`
  - `POST /reservations/:id/consume`
  - `GET /history`
  - `POST /inventory-audit`
- Added warehouse API tests and invariant tests I1-I7.
- Verified full API test suite in temporary VPS containers: 30/30 passing.

## Next steps for Codex

1. Add `ops/scripts/refresh/02-warehouse.mjs`.
2. Add `ops/scripts/refresh-staging-snapshot.mjs`.
3. Add `ops/scripts/compare-datasets.mjs`.
4. Refresh staging warehouse data from Supabase and compare counts.
5. Continue Vue warehouse screens.

## Quality gates status (Block 2)

- [x] API tests 15/15 passing in temp VPS containers
- [x] `cd ops/web && npm run build` passing
- [x] `/api/health` green on staging
- [x] `employees` copied from Supabase to staging
- [x] admin auth smoke on staging
- [x] PR opened
- [x] PR merged to main
- [x] main deploy passed

## Quality gates status (Block 3)

- [x] `003_warehouse.sql` added
- [x] API warehouse tests added and passing
- [ ] `refresh-staging-snapshot.mjs` and `compare-datasets.mjs` added
- [ ] staging warehouse data refreshed from Supabase
- [ ] Vue warehouse screens built
- [ ] Playwright warehouse smoke passing
- [ ] PR opened
- [ ] PR merged to main

## Blockers / questions

- No current Block 2 blocker.
- Supabase `employees` currently have no email values, so employee temp-password issuance produced only a CSV header. Staging admin smoke still covers the protected auth path.
- Local shell currently has no `docker` or `psql`, so DB-positive tests cannot run locally. Using isolated VPS containers as the verification path.

## Manual steps required by Polina

- UptimeRobot setup from Block 1 is still deferred/manual and not blocking Auth.

## Completed blocks summary

- ✅ Block 1: Infrastructure merged to `main` and deployed to staging
- ✅ Block 2: Auth + employees merged to `main` and deployed to staging
- 🔄 Block 3: Warehouse started
- ⏳ Block 4-16, Stages B/C/D: pending

## How to resume

1. Read this `STATUS.md`.
2. Continue Block 3 from Task 1 (`003_warehouse.sql`) on branch `block-3-warehouse`.
