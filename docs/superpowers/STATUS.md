# Migration status

Last update: 2026-05-19T13:26:51-03:00
Current block: 2
Current task within block: Task 5 staging data copy / smoke, blocked on Supabase service key
Branch: block-2-auth
Last commit: 764895d
Tests: Block 2 API tests 15/15 passing in temporary VPS containers; `ops/web npm run build` passing; live staging health `db.ok=true`.

## What was just done

- Block 1 PR #36 was merged to `main`; GitHub Actions deploy to staging passed.
- Created `block-2-auth` from fresh `main`.
- Read `docs/superpowers/plans/2026-05-15-block-2-auth.md` before editing.
- Added migration `002_auth.sql` for `employees`, `auth_users`, `auth_sessions`, and `idempotency_keys`.
- Added `argon2`, `cookie-parser`, password hashing helpers, `withTransaction`, session store, auth middleware.
- Added `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/change-password`.
- Added protected `/api/employees`.
- Added employee refresh and temporary password scripts:
  - `ops/scripts/refresh/01-employees.mjs`
  - `ops/scripts/issue-temp-passwords.mjs`
  - `ops/api/scripts/hash.mjs`
- Added Vue login flow: auth API wrapper, Pinia auth store, `/login`, `/change-password`, route guards, logout button.
- Verified API tests 15/15 in isolated VPS containers with migrations 001+002.
- Verified `ops/web npm run build` locally.

## Next steps for Codex

1. Get `SUPABASE_SERVICE_KEY` from Polina.
2. Add `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` to the secure runtime environment only, not the repo.
3. Apply `002_auth.sql` to staging and run `ops/scripts/refresh/01-employees.mjs` against staging Postgres.
4. Issue temporary passwords or create a staging admin user for manual smoke.
5. Run staging smoke: `/login`, `/change-password`, `/api/employees`.
6. Finish Block 2 quality gates, open PR, merge if green.

## Quality gates status (Block 2)

- [x] API tests 15/15 passing in temp VPS containers
- [x] `cd ops/web && npm run build` passing
- [x] `/api/health` green on staging
- [ ] `employees` copied from Supabase to staging
- [ ] admin/user auth smoke on staging
- [ ] PR opened
- [ ] PR merged to main

## Blockers / questions

- Need `SUPABASE_SERVICE_KEY` to copy `employees` from Supabase and finish Block 2 staging smoke.
- Need a desired staging admin email/password decision. I can generate a strong temporary password and store it only on the VPS if preferred.
- Local shell currently has no `docker` or `psql`, so DB-positive tests cannot run locally. Using isolated VPS containers as the verification path.

## Manual steps required by Polina

- Provide `SUPABASE_SERVICE_KEY` for read-only staging refresh from Supabase.
- UptimeRobot setup from Block 1 is still deferred/manual and not blocking Auth.

## Completed blocks summary

- ✅ Block 1: Infrastructure merged to `main` and deployed to staging
- 🔄 Block 2: Auth + employees in progress, blocked on Supabase service key for data copy/smoke
- ⏳ Block 3-16, Stages B/C/D: pending

## How to resume

1. Read this `STATUS.md`.
2. Continue Block 2 from Task 5 staging data copy once `SUPABASE_SERVICE_KEY` is available.
