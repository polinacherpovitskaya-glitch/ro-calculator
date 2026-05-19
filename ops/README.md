# RO Ops Stack

Operational core of `recycleobject.ru`: migration target for the old Vercel + Supabase stack.

## Status

- Stage A — Build, Blocks 1-5 merged; Block 6 bugs in progress
- Staging domain: `https://ops-staging.recycleobject.ru`
- Production cutover: not here; Stage C is owner-run only
- UptimeRobot: deferred/manual follow-up, not blocking the migration blocks

## Structure

```text
ops/
├── api/                 Node 20 + Express API
├── web/                 Vue 3 + Vite SPA
├── db/                  SQL migrations
└── infra/               docker-compose, Caddyfile, scripts
```

## Local Development

Requirements: Node 20 and Docker/Postgres.

```bash
docker run -d --name ops-pg-dev \
  -e POSTGRES_USER=ops \
  -e POSTGRES_PASSWORD=ops_dev_password \
  -e POSTGRES_DB=ops \
  -p 127.0.0.1:5433:5432 \
  postgres:16-alpine

DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" ops/db/migrate.sh

cd ops/api
npm install
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm start

cd ../web
npm install
npm run dev
```

Open `http://localhost:5173`.

## Tests

```bash
cd ops/api
TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm test

cd ../web
npm run build
```

Staging smokes live in:

```text
tests/playwright/warehouse.spec.ts
tests/playwright/shipments-china.spec.ts
tests/playwright/molds-blanks.spec.ts
tests/playwright/bugs.spec.ts
```

They expect:

```text
E2E_BASE_URL=https://ops-staging.recycleobject.ru
E2E_USER=<staging user>
E2E_PASSWORD=<staging password>
```

## Deploy

Deploy is automatic on push to `main` when `ops/**` or `.github/workflows/ops-deploy.yml` changes.

1. GitHub Actions installs dependencies.
2. It applies migrations to a CI Postgres service.
3. It runs API tests and builds the web app.
4. On `main` only, it rsyncs `ops/` to `/srv/ops/`.
5. It runs `docker compose --env-file .env up -d --build`.
6. It applies migrations to staging and checks `/api/health`.

Required GitHub Actions secrets:

```text
OPS_SSH_PRIVATE_KEY
OPS_HOST
OPS_USER
```

## VPS Operations

SSH:

```bash
ssh ops@ops-staging.recycleobject.ru
```

Logs:

```bash
cd /srv/ops/infra
docker compose logs -f api
docker compose logs -f caddy
docker compose logs -f postgres
```

Restart:

```bash
cd /srv/ops/infra
docker compose --env-file .env restart api
```

Health:

```bash
curl -sS https://ops-staging.recycleobject.ru/api/health
```

Expected:

```json
{"status":"ok","version":"dev","uptime_seconds":1,"db":{"ok":true,"latency_ms":1}}
```

## Backups

Backups run daily at 03:00 MSK through `ops-backup.timer`.

- S3 bucket: `ro-ops-backups`
- Region endpoint: `https://s3.ru-3.storage.selcloud.ru`
- Local backups: `/srv/ops/backups/`
- Local retention: 7 days
- S3 retention: managed in Selectel bucket policy/lifecycle

Manual backup:

```bash
ssh ops@ops-staging.recycleobject.ru
systemctl start ops-backup.service
journalctl -u ops-backup.service -n 50
```

Timer:

```bash
systemctl list-timers ops-backup.timer
```

## Restore

Warning: restore replaces the current `ops` database. The script first renames the existing DB to `ops_old`.

Recommended drill flow while staging has no production data:

```bash
ssh ops@ops-staging.recycleobject.ru
cd /srv/ops/infra
docker compose --env-file .env stop api caddy
printf "yes\n" | bash /srv/ops/infra/scripts/restore.sh
docker exec ops-postgres psql -U ops -d ops -c "SELECT id, version FROM app_meta;"
docker exec ops-postgres dropdb -U ops ops_old
docker compose --env-file .env up -d
curl -sS https://ops-staging.recycleobject.ru/api/health
```

For a specific backup:

```bash
bash /srv/ops/infra/scripts/restore.sh s3://ro-ops-backups/ops-YYYYMMDD-HHMM.sql.gz
```

## Monitoring

External monitoring is intended to use UptimeRobot:

- Monitor type: HTTP(s)
- URL: `https://ops-staging.recycleobject.ru/api/health`
- Interval: 5 minutes
- Alert contacts: email, optional Telegram

This manual UptimeRobot setup is deferred and is not blocking the migration. The health endpoint and TLS are already live.

## Auth Module

Block 2 adds cookie-based auth for the staging ops stack.

Endpoints:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/change-password
GET  /api/employees
```

Runtime notes:

- Sessions live in `auth_sessions`.
- Password hashes use Argon2.
- Employee data is refreshed from Supabase with `ops/scripts/refresh/01-employees.mjs`.
- Staging admin credentials are stored outside the rsync deploy directory at `/srv/ops-secrets/admin-login.txt`.

## Warehouse Module

Block 3 redesigns warehouse instead of copying the old cache-heavy shape 1:1.

Tables:

```text
warehouse_items
warehouse_reservations
warehouse_history
```

Canonical rules:

- `warehouse_history.type`: `receipt`, `consume`, `inventory_audit`, `manual_edit`, `return`.
- `warehouse_reservations.source`: `order`, `manual`.
- Mutating endpoints require `Idempotency-Key`.
- Quantity-changing mutations use transactions and row locks.
- `orders` FKs are intentionally deferred until Block 9, when the `orders` table exists.

Endpoints:

```text
GET    /api/warehouse/items
GET    /api/warehouse/items/:id
POST   /api/warehouse/items
PATCH  /api/warehouse/items/:id
DELETE /api/warehouse/items/:id

GET    /api/warehouse/reservations
POST   /api/warehouse/reservations
PATCH  /api/warehouse/reservations/:id
POST   /api/warehouse/reservations/:id/release
POST   /api/warehouse/reservations/:id/consume

GET    /api/warehouse/history
POST   /api/warehouse/inventory-audit
```

Screens:

```text
/warehouse
/warehouse/:id
/warehouse/inventory
/warehouse/history
```

Data refresh:

```bash
cd /srv/ops
set -a; source /srv/ops/infra/.env; set +a
docker run --rm --network infra_internal \
  -v /srv/ops:/srv/ops \
  -w /srv/ops \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_KEY=... \
  -e DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@ops-postgres:5432/${POSTGRES_DB}" \
  node:20-alpine sh -c "cd scripts && npm ci && cd /srv/ops && node scripts/refresh-staging-snapshot.mjs"
```

Dataset compare:

```bash
node ops/scripts/compare-datasets.mjs
```

## Shipments + China Module

Block 4 adds receipt workflows and China purchasing on top of the warehouse redesign.

Tables:

```text
shipments
shipment_items
china_purchases
china_purchase_items
china_catalog
```

Canonical rules:

- `POST /api/shipments/:id/receive` and `POST /api/china/purchases/:id/receive` require `Idempotency-Key`.
- Receive runs in a transaction, locks the shipment row, locks each touched warehouse item, writes `warehouse_history.type='receipt'`, and increments `warehouse_items.qty`.
- Receipt never creates reservations.
- New warehouse items must be explicit (`extras.create_new=true`) and carry a SKU.
- China purchase receive creates a shipment, copies purchase items into `shipment_items`, then uses the same receive operation as direct shipments.

Endpoints:

```text
GET    /api/shipments
GET    /api/shipments/:id
POST   /api/shipments
PATCH  /api/shipments/:id
DELETE /api/shipments/:id
POST   /api/shipments/:id/receive

GET    /api/china/purchases
POST   /api/china/purchases
GET    /api/china/purchases/:id
PATCH  /api/china/purchases/:id
DELETE /api/china/purchases/:id
POST   /api/china/purchases/:id/receive

GET    /api/china/catalog
POST   /api/china/catalog
PATCH  /api/china/catalog/:id
```

Screens:

```text
/shipments
/shipments/new
/shipments/:id
/china
/china/new
/china/:id
/china/catalog
```

Refresh notes:

- Legacy Supabase stores shipments and China purchases as JSON snapshot columns (`shipment_data`, `purchase_data`).
- `ops/scripts/refresh/03-shipments-china.mjs` normalizes child item rows from those snapshots.
- The China catalog is seeded from `data/china_catalog.json` locally, or from `https://calc.recycleobject.ru/data/china_catalog.json` on VPS.
- Compare includes `shipments`, `shipment_items`, `china_purchases`, `china_purchase_items`, and `china_catalog`.

## Molds + Blanks + Colors + Marketplaces Module

Block 5 adds the catalog and direct-consumption workflows used by molds and marketplace sets.

Tables:

```text
molds
mold_hardware
mold_usage_log
hw_blanks
pkg_blanks
app_colors
marketplace_sets
```

Canonical rules:

- Mutating endpoints require `Idempotency-Key`.
- `mold_hardware` is the source of truth for mold-to-warehouse hardware links.
- `POST /api/molds/:id/use` consumes warehouse stock directly, writes `warehouse_history.type='consume'` with `mold_id`, increments `molds.usage_count`, and does not create reservations.
- `marketplace_sets.composition` stores `[{ warehouse_item_id, qty }]` and is validated against existing warehouse items.
- `POST /api/marketplaces/:id/sell` consumes warehouse stock directly, writes `warehouse_history.type='consume'` with `marketplace_set_id`, and does not create reservations.

Endpoints:

```text
GET    /api/molds
GET    /api/molds/:id
POST   /api/molds
PATCH  /api/molds/:id
DELETE /api/molds/:id
GET    /api/molds/:id/hardware
PUT    /api/molds/:id/hardware
POST   /api/molds/:id/use

GET    /api/blanks/hardware
POST   /api/blanks/hardware
PATCH  /api/blanks/hardware/:id
DELETE /api/blanks/hardware/:id
GET    /api/blanks/packaging
POST   /api/blanks/packaging
PATCH  /api/blanks/packaging/:id
DELETE /api/blanks/packaging/:id

GET    /api/colors
POST   /api/colors
PATCH  /api/colors/:id
DELETE /api/colors/:id

GET    /api/marketplaces
GET    /api/marketplaces/:id
POST   /api/marketplaces
PATCH  /api/marketplaces/:id
DELETE /api/marketplaces/:id
POST   /api/marketplaces/:id/sell
```

Screens:

```text
/molds
/molds/:id
/blanks
/colors
/marketplaces
```

Refresh notes:

- `ops/scripts/refresh/04-molds-blanks.mjs` normalizes legacy JSON columns (`mold_data`, `blank_data`, `color_data`, `set_data`) into the Block 5 tables.
- Legacy `mold_hardware` rows are reconstructed from `mold.hw_warehouse_item_id` when the referenced warehouse item exists.
- Legacy marketplace compositions are reconstructed from direct `wh_id` values or blank-to-warehouse links.
- `mold_usage_log` has no legacy source rows, so refresh expects `0`.
- Compare includes all Block 5 tables and computes the expected `mold_hardware` count from legacy mold links.

Staging smoke:

```text
tests/playwright/molds-blanks.spec.ts
```

## Bugs Module

Block 6 adds bug report tracking and bug attachment metadata.

Tables:

```text
bug_reports
bug_attachments
```

Canonical rules:

- Mutating endpoints require `Idempotency-Key`.
- Bugs API is authenticated; delete requires `admin`.
- Attachment bytes belong in private Selectel Object Storage and are exposed through short-lived signed URLs.
- During Stage A, legacy attachment markers may still point to Supabase/public data sources until the one-shot storage migration is run.
- Current Supabase does not expose `bug_reports`; refresh synthesizes bug rows from legacy `[Баг]` tasks and preserves source fields in `bug_reports.extras`.

Endpoints:

```text
GET    /api/bugs
POST   /api/bugs
GET    /api/bugs/:id
PATCH  /api/bugs/:id
DELETE /api/bugs/:id
POST   /api/bugs/:id/attachments
DELETE /api/bugs/:id/attachments/:attId
```

Screens:

```text
/bugs
```

Refresh notes:

- `ops/scripts/refresh/05-bugs.mjs` imports 10 current legacy bug tasks and 8 bug file assets from `work_assets`.
- `compare-datasets.mjs` includes `bug_reports` and `bug_attachments`.
- `ops/scripts/migrate-storage-bug-attachments.mjs` handles `supabase://`, `data-url://work_assets/...`, direct `data:`, and legacy HTTP(S) attachment sources.
- Do not run the real storage migration until the final bug attachment S3 bucket/env decision is confirmed.

Staging smoke:

```text
tests/playwright/bugs.spec.ts
```

## Current Infra

| Parameter | Value |
|---|---|
| Provider | Selectel Cloud |
| Region | Moscow VPS; S3 bucket in ru-3 |
| OS | Ubuntu 22.04 LTS |
| Domain | `ops-staging.recycleobject.ru` |
| TLS | Let's Encrypt via Caddy |
| Database | PostgreSQL 16 in Docker |
| API | Node 20 + Express |
| Web | Vue 3 + Vite |

## Next

Finish Block 6 PR, then continue with Block 7 per the migration playbook.
