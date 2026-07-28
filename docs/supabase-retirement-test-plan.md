# Тест-план полного отказа от Supabase

## Source

- Task: полностью убрать Supabase без потери данных и работы timebot.
- Plan file: `docs/plans/2026-07-28-supabase-retirement.md`.
- Status file: `docs/supabase-retirement-status.md`.
- Repo context: frontend data layer, ops API/PostgreSQL, bot, CI и Yandex VM.
- Last updated: 2026-07-28.

## Validation Scope

- In scope: PostgreSQL schema/data parity, Express API, timebot, frontend
  persistence, Storage, scripts, CI, backup/restore и production cutover.
- Out of scope: Telegram-relay replacement и Selectel deployment.

## Environment / Fixtures

- Source: production self-hosted Supabase на `ro-db`.
- Shadow target: отдельный PostgreSQL volume на той же VM.
- API: `api.recycleobject.ru`.
- Critical fixtures: employees 1772715209137 и новые сотрудники, active orders,
  warehouse items, molds with media, time entries, settings/auth JSON.
- External dependencies: Telegram через Vercel relay, Yandex Object Storage,
  GitHub Actions.

## Test Levels

### Unit

- API validation, auth, idempotency and serializers.
- Bot API client for employee/time/task queries.
- Frontend transport mapping for every migrated function.
- Storage URL mapping and checksum manifest.

### Integration

- All `ops/api` tests against disposable PostgreSQL 16.
- Refresh scripts are idempotent.
- Source/target counts and critical rows match.
- Write/read/delete round trip through API.
- Backup restores into a separate database.

### End-to-End / Smoke

- Login and calculator startup.
- Create/update/load/delete an order.
- Warehouse reserve/return flow.
- Mold/blank/color/catalog load and media access.
- Manual time entry and Telegram time report.
- FinTablo/Точка snapshot write.
- Both `calc` and `calc2`.

## Negative / Edge Cases

- Invalid/expired browser session.
- Invalid bot token.
- Duplicate idempotency key.
- API unavailable while local fallback contains data.
- Partial final delta or parity mismatch.
- Storage object missing or checksum mismatch.
- VM/container restart during a pending time report.
- Old Supabase endpoint accidentally receiving traffic after cutover.

## Data Parity Gates

- [x] All source tables have an explicit target or documented retirement.
- [x] Counts match for employees, orders, order_items, time_entries, warehouse,
  molds, shipments, finance and work tables.
- [x] Latest timestamps match.
- [x] Critical IDs and JSON payload hashes match.
- [x] Storage count/bytes/checksums match.
- [x] Rehearsal can be rerun without duplicates.

## Acceptance Gates

- [x] `node tests/version-smoke.js`
- [x] `node scripts/audit-data-paths.mjs`
- [x] `node tests/yandex-platform-shadow-smoke.js`
- [x] `cd ops/api && npm test`
- [x] `cd ops/bot && npm test`
- [x] `node tests/order-flow-smoke.js`
- [x] `node tests/warehouse-migration-smoke.js`
- [x] `node tests/finance-smoke.js`
- [x] `node tests/tasks-smoke.js`
- [x] `node tests/live-site-smoke.mjs`
- [x] `node tests/yandex-mirror-smoke.mjs`
- [x] New API write-back smoke
- [x] Backup restore drill
- [x] Shadow backup format/list verification
- [x] Shadow PostgreSQL/API restart recovery
- [x] Timebot/relay/DB/replacement API monitor and test alert

## Release / Demo Readiness

- [x] Core scenarios work end to end through own API.
- [x] Primary regression checks are green.
- [x] Production rollback is copy-pasteable and rehearsed.
- [x] No blocker-level parity issue remains.
- [x] Health alert covers API, PostgreSQL, Telegram and write-back.
- [ ] Supabase removal waits for the observation window.

## Command Matrix

```sh
node tests/version-smoke.js
node scripts/audit-data-paths.mjs
node tests/yandex-platform-shadow-smoke.js
cd ops/api && npm ci && npm test
cd ops/bot && npm ci && npm test
node tests/order-flow-smoke.js
node tests/warehouse-migration-smoke.js
node tests/finance-smoke.js
node tests/tasks-smoke.js
```

## Open Risks

- Legacy JSON blobs may contain fields not represented in normalized ops schema.
- External repos/plugins may retain old endpoint configuration.
- Production cutover must keep the bot write freeze short and rerun final parity.

## Deferred Coverage

- Physical deletion of the old PostgreSQL volume is a separate destructive
  action after restore drill and explicit user confirmation.
