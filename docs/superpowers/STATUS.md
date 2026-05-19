# Migration status

Last update: 2026-05-19T13:38:57-03:00
Current block: 2
Current task within block: PR / merge
Branch: block-2-auth
Last commit: latest `block-2-auth` commit
Tests: Block 2 API tests 15/15 passing in temporary VPS containers; `ops/web npm run build` passing; live staging health `db.ok=true`; live auth smoke passed.

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
- Fixed `employees.id` / `auth_users.employee_id` to `BIGINT`; real Supabase employee IDs include timestamp-like values such as `1741700005000`.
- Added explicit `ws` transport for the Supabase refresh script so it works in the Node 20 Docker runtime.
- Copied `employees` from Supabase to staging Postgres: 14 rows total, 12 active.
- Confirmed current Supabase employee rows have no email values, so `/srv/ops/temp-passwords.csv` currently contains only the header row.
- Created staging admin credentials and stored them only on the VPS at `/srv/ops/admin-login.txt` with `0600` permissions.
- Verified live auth smoke on staging: admin login, `/api/auth/me`, protected `/api/employees`, logout.
- Verified API tests 15/15 in isolated VPS containers with migrations 001+002.
- Verified `ops/web npm run build` locally.

## Next steps for Codex

1. Commit final Block 2 fixes/status.
2. Push `block-2-auth`.
3. Open PR to `main`, wait for checks, merge if green.
4. Let GitHub Actions deploy `main` to staging.
5. Start Block 3 from fresh `main`.

## Quality gates status (Block 2)

- [x] API tests 15/15 passing in temp VPS containers
- [x] `cd ops/web && npm run build` passing
- [x] `/api/health` green on staging
- [x] `employees` copied from Supabase to staging
- [x] admin auth smoke on staging
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
- 🔄 Block 2: Auth + employees ready for PR/merge
- ⏳ Block 3-16, Stages B/C/D: pending

## How to resume

1. Read this `STATUS.md`.
2. Continue Block 2 by opening/merging the PR if checks are green.
