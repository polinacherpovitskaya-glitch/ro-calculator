# Migration status

Last update: 2026-05-19T13:17:02-03:00
Current block: 1
Current task within block: complete, PR/merge pending
Branch: block-1-infrastructure
Last commit: 9477403
Tests: 4/4 API health tests passing in temp VPS containers; `ops/web` production build passing; live staging health `db.ok=true`; backup verified end-to-end with 2 successful uploads to S3; restore drill passed.

## What was just done

### By Codex (Tasks 4-9 code, blocker on Task 9 verification):
- Block 1 Task 4: Postgres migration `001_init.sql`, `db.js`, DB-aware `/api/health`.
- Block 1 Task 5: Vue 3 + Vite + Pinia + vue-router skeleton in `ops/web`.
- Block 1 Task 6: API Dockerfile, Caddyfile, docker-compose stack, `.env.example`.
- Block 1 Task 7: live staging deploy — `https://ops-staging.recycleobject.ru/api/health` returns `status:ok, db.ok=true`. TLS via Let's Encrypt working.
- Block 1 Task 8: GitHub Actions deploy workflow + deploy secrets + ssh key.
- Block 1 Task 9/10 code: `backup.sh`, `restore.sh`, `ops-backup.service`, `ops-backup.timer` added to repo.
- Stopped at Task 9 verification: needed S3 access/secret keys.

### By Polina (just now — unblocking Task 9):
- Selectel S3 bucket **`ro-ops-backups` created in region `ru-3` (СПб)**, type private, standard storage.
- S3 service-key "ops-backup" created (account-scoped key, "Мне" option — see Selectel: S3 → S3-ключи).
- Credentials placed in `/srv/ops/infra/.env` on the VPS.
- **S3_ENDPOINT changed from `https://s3.storage.selcloud.ru` to `https://s3.ru-3.storage.selcloud.ru`** (region-specific) — the default endpoint fails SSL hostname verification when using vHosted addressing for ru-3 buckets (cert is regional). **Codex: please reflect this in `ops/infra/.env.example`.**
- `backup.sh` + `restore.sh` + systemd unit files rsync'ed to `/srv/ops/infra/scripts/` and `/srv/ops/infra/systemd/` on the VPS, chowned `ops:ops`, chmod +x. (Codex's `gh actions deploy` will also pick them up on next push to main.)
- **backup.sh verified end-to-end** on VPS:
  - pg_dump → /srv/ops/backups/ops-<ts>.sql.gz
  - upload to `s3://ro-ops-backups/ops-<ts>.sql.gz` ✓
  - rotate local backups
  - "Backup complete."
- Two test backups now visible in S3 bucket: `ops-20260519-1607.sql.gz`, `ops-20260519-1608.sql.gz`.
- systemd timer `ops-backup.timer` installed + enabled. Next run: 2026-05-20 03:00 MSK (00:00 UTC + ~3 min RandomizedDelay).

### By Codex after unblock:
- Updated `ops/infra/.env.example` to use `S3_ENDPOINT=https://s3.ru-3.storage.selcloud.ru`.
- Ran restore drill from latest S3 backup `ops-20260519-1608.sql.gz`.
- Stopped API/Caddy before restore, restored DB, confirmed `app_meta` contains `(1, 001-init)`, dropped `ops_old`, restarted stack.
- Verified `https://ops-staging.recycleobject.ru/api/health` returns `status:ok, db.ok=true` after restore.
- Added `ops/README.md` with deploy, backup, restore, SSH, and monitoring notes. UptimeRobot is documented as deferred/manual, not blocking Block 1.
- Re-ran Block 1 quality gates: API tests 4/4 in temporary VPS containers, `ops/web npm run build`, and live staging health.

## Next steps for Codex (auto-resume from here)

1. Push `block-1-infrastructure`.
2. Open PR `block-1-infrastructure` → `main`.
3. Verify GitHub checks and merge if green.
4. Move to Block 2.

## Quality gates status (Block 1 — almost done)

- [x] `cd ops/api && npm test` — passing in temp containers
- [x] `cd ops/web && npm run build` — passing
- [x] `/api/health` green on staging
- [x] Caddy TLS via Let's Encrypt
- [x] CI workflow added + secrets configured
- [x] Backup script verified working (2 backups in S3 bucket)
- [x] systemd timer for backups installed and active
- [x] Restore drill (Task 10)
- [ ] UptimeRobot monitor (manual/deferred, not blocking)
- [x] `ops/README.md` updated with full playbook
- [ ] PR opened
- [ ] PR merged to main

## Blockers / questions

- ✅ ~~Need Selectel Object Storage S3 credentials~~ — **resolved by Polina**, see above.
- Local shell currently has no `docker` or `psql`, so DB-positive tests cannot run locally. Using isolated VPS containers as the verification path.

## Manual steps required by Polina

- **UptimeRobot setup (Block 1 Task 11):** Create free UptimeRobot account at https://uptimerobot.com. Add new HTTP(s) monitor:
  - Friendly name: `RO Ops Staging API Health`
  - URL: `https://ops-staging.recycleobject.ru/api/health`
  - Monitoring interval: 5 minutes
  - Alert contacts: email + (optional) Telegram via `@uptimerobot_bot`
  - **Not blocking on Codex for now** — Codex can finish Task 10 + open PR. UptimeRobot can be added before PR merge or as a follow-up.

## Completed blocks summary

- 🔄 Block 1: Infrastructure (Tasks 4-9 done; Task 10 + 11 next; PR pending)
- ⏳ Block 2-16, Stages B/C/D: pending

## How to resume

1. Read this `STATUS.md`.
2. Continue with Block 1 Task 11 PR/merge.
3. Per `CODEX-KICKOFF.md`: when all applicable quality gates are green — self-merge PR, continue to Block 2.
