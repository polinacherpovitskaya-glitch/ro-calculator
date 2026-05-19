# Migration status

Last update: 2026-05-19T15:35:36-03:00
Current block: 5
Current task within block: Task 6 Refresh + compare
Branch: block-5-molds-blanks
Last commit: Add marketplaces API
Tests: Block 5 API suite 80/80 passing in temp VPS containers with migrations 001-005; Block 4 web build and Playwright smoke passed; staging health `db.ok=true`; latest staging refresh/compare matched.

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
- Added warehouse refresh/data scripts:
  - `ops/scripts/refresh/02-warehouse.mjs`
  - `ops/scripts/refresh-staging-snapshot.mjs`
  - `ops/scripts/compare-datasets.mjs`
- Ran staging snapshot refresh from Supabase:
  - employees: 14
  - warehouse_items: 227
  - warehouse_reservations: 351 legacy JSON entries -> 348 canonical unique reservation rows
  - warehouse_history: 1
- Ran dataset compare successfully:
  - employees 14/14
  - warehouse_items 227/227
  - warehouse_reservations 348/348
  - warehouse_history 1/1
- Added Vue warehouse API wrapper, Pinia store, `/warehouse` route, and list view with search, category filter, create dialog, inline qty/min/category edits, delete action, and low-stock highlighting.
- Added home navigation link to `/warehouse`.
- Verified `cd ops/web && npm run build` passing.
- Added `GET /api/warehouse/items/:id`.
- Added `/warehouse/:id` item card with editable fields and recent movement history.
- Verified API test suite again in temporary VPS containers: 30/30 passing.
- Verified `cd ops/web && npm run build` passing after item card.
- Added `/warehouse/inventory` inventory audit view with factual qty entry, delta calculation, and `POST /api/warehouse/inventory-audit` integration.
- Verified `cd ops/web && npm run build` passing after inventory view.
- Added `/warehouse/history` movement history view with type/item/date filters and simple page controls.
- Extended `GET /api/warehouse/history` with `type` and `offset` query support.
- Verified API test suite again in temporary VPS containers: 30/30 passing.
- Verified `cd ops/web && npm run build` passing after history view.
- Added `tests/playwright/warehouse.spec.ts` staging smoke scaffold for login -> warehouse -> edit qty -> verify history.
- Playwright smoke not run yet because Block 3 UI is not deployed to staging until this branch is merged; it requires `E2E_USER` / `E2E_PASSWORD`.
- Updated `ops/README.md` with Auth and Warehouse module endpoints, screens, tests, refresh, and compare notes.
- Block 3 PR #38 was merged to `main`; GitHub Actions deploy run `26112916646` passed.
- Verified live staging after deploy:
  - `/api/health` ok with `db.ok=true`
  - admin login ok
  - protected `/api/warehouse/items` returned 227 rows
  - `/warehouse` SPA route returned HTTP 200
- Fixed and ran Playwright warehouse smoke against live staging: 1/1 passing.
- Block 3 Playwright follow-up PR #39 was merged to `main`.
- Created `block-4-shipments-china` from fresh `main`.
- Read `docs/superpowers/plans/2026-05-15-block-4-shipments-china.md`.
- Added `ops/db/migrations/004_shipments_china.sql` for `shipments`, `shipment_items`, `china_purchases`, `china_purchase_items`, and `china_catalog`.
- Verified migrations 001-004 on a clean temporary Postgres container on the VPS.
- Added shipments API with CRUD and idempotent `POST /api/shipments/:id/receive`.
- Added shipment receive tests for idempotency, empty shipment, warehouse link validation, create_new validation, receipt history, and ALREADY_RECEIVED.
- Verified API suite in temporary VPS containers: 37/37 passing.
- Added China API TDD coverage for purchases, catalog, receive validation, receive idempotency, and status transitions.
- Extracted the shipment receive operation into `ops/api/src/shipments/receive.js` so direct shipments and China purchase receive use the same transaction/lock/history path.
- Added `/api/china` routes:
  - `GET/POST /purchases`
  - `GET/PATCH/DELETE /purchases/:id`
  - `POST /purchases/:id/receive`
  - `GET/POST /catalog`
  - `PATCH /catalog/:id`
- Hardened `withIdempotency()` so successful mutation responses are persisted before the JSON response is sent. This closes a same-key immediate retry race where the second request could arrive before the first response was cached.
- Verified full API suite in temporary VPS containers: 52/52 passing.
- Added `ops/scripts/refresh/03-shipments-china.mjs` and wired it into staging refresh.
- Extended compare-datasets for `shipments`, `shipment_items`, `china_purchases`, `china_purchase_items`, and `china_catalog`.
- Legacy mapping notes:
  - Supabase stores `shipments.shipment_data` and `china_purchases.purchase_data` as JSON snapshots, so refresh normalizes child item rows from those snapshots.
  - Old China catalog is a static seed JSON, not a Supabase table; refresh/compare load it from local `data/china_catalog.json` when present or from `https://calc.recycleobject.ru/data/china_catalog.json` on VPS.
  - If a legacy shipment/purchase item references a missing `warehouse_item_id`, refresh stores that ID in `extras.legacy_warehouse_item_id` and leaves the FK null instead of failing.
- Verified refresh/compare against a temporary VPS Postgres using Supabase anon read key: all counts matched.
- Refreshed live staging snapshot from Supabase:
  - employees 14/14
  - warehouse_items 227/227
  - warehouse_reservations 402/402
  - warehouse_history 1/1
  - shipments 13/13
  - shipment_items 62/62
  - china_purchases 14/14
  - china_purchase_items 45/45
  - china_catalog 103/103
- Verified live staging `/api/health`: `db.ok=true`.
- Added Vue API wrappers and Pinia stores for shipments/china.
- Added screens:
  - `/shipments`
  - `/shipments/new`
  - `/shipments/:id`
  - `/china`
  - `/china/new`
  - `/china/:id`
  - `/china/catalog`
- Added home navigation links for shipments and China.
- Verified `cd ops/web && npm run build` passing.
- Added `tests/playwright/shipments-china.spec.ts`:
  - login
  - create shipment with a linked warehouse item
  - receive it
  - verify warehouse qty increased
  - verify receipt history is visible
- Fixed the `/shipments/new -> /shipments/:id` and `/china/new -> /china/:id` component reuse bug by updating local form state after create.
- Relaxed the warehouse Playwright history assertion so it checks that `manual_edit` exists, not that it is the newest row; Block 4 receipts can legitimately appear above it.
- Updated `ops/README.md` with Block 4 endpoints, screens, refresh, compare, and smoke notes.
- Manually deployed the current branch to staging for live smoke.
- Verified final gates:
  - API suite in temporary VPS containers: 52/52 passing
  - `cd ops/web && npm run build`: passing
  - Playwright staging smoke: `warehouse.spec.ts` + `shipments-china.spec.ts`, 2/2 passing
  - staging refresh/compare re-run after smoke, all counts matched
  - live staging `/api/health`: `db.ok=true`
- Block 4 PR #40 was squash-merged to `main`.
- GitHub Actions deploy run `26116185206` passed on `main`.
- Post-deploy Playwright smoke on main found the old warehouse smoke still depended on imported legacy item history. Updated it to create a dedicated smoke warehouse item via API before editing.
- Verified post-deploy Playwright smoke again: `warehouse.spec.ts` + `shipments-china.spec.ts`, 2/2 passing.
- Refreshed staging after post-deploy smoke so e2e-created rows do not remain in staging:
  - employees 14/14
  - warehouse_items 227/227
  - warehouse_reservations 429/429
  - warehouse_history 1/1
  - shipments 13/13
  - shipment_items 62/62
  - china_purchases 14/14
  - china_purchase_items 45/45
  - china_catalog 103/103
  - `/api/health`: `db.ok=true`
- Created `block-5-molds-blanks` from fresh `main`.
- Read Block 5 required docs before editing:
  - `docs/superpowers/plans/2026-05-15-block-5-molds-blanks.md`
  - `docs/superpowers/plans/2026-05-15-WAREHOUSE-INTERACTION-MAP.md`
  - `docs/superpowers/plans/2026-05-15-BUG-INVENTORY.md`
- Added `ops/db/migrations/005_molds_blanks.sql` for:
  - `molds`
  - `mold_hardware`
  - `mold_usage_log`
  - `hw_blanks`
  - `pkg_blanks`
  - `app_colors`
  - `marketplace_sets`
- Added FK constraints from `warehouse_history.mold_id` and `warehouse_history.marketplace_set_id` after the referenced tables exist.
- Verified migrations 001-005 on a clean temporary Postgres container on the VPS; `app_meta.version` is `005-molds-blanks`.
- Added molds API tests first, then implemented `ops/api/src/routes/molds.js`.
- Added `/api/molds` routes:
  - `GET /api/molds`
  - `GET /api/molds/:id`
  - `POST /api/molds`
  - `PATCH /api/molds/:id`
  - `DELETE /api/molds/:id`
  - `GET /api/molds/:id/hardware`
  - `PUT /api/molds/:id/hardware`
  - `POST /api/molds/:id/use`
- Mold use uses Idempotency-Key, a transaction, `SELECT FOR UPDATE` on the mold and touched warehouse items, direct `warehouse_history.type='consume'`, and no reservations.
- Verified full API suite in temporary VPS containers: 60/60 passing.
- Added blanks API tests first, then implemented `ops/api/src/routes/blanks.js`.
- Added `/api/blanks` routes:
  - `GET /api/blanks/hardware`
  - `POST /api/blanks/hardware`
  - `PATCH /api/blanks/hardware/:id`
  - `DELETE /api/blanks/hardware/:id`
  - `GET /api/blanks/packaging`
  - `POST /api/blanks/packaging`
  - `PATCH /api/blanks/packaging/:id`
  - `DELETE /api/blanks/packaging/:id`
- Blanks mutations require `Idempotency-Key`; list supports `search` and `category` filters.
- Verified full API suite in temporary VPS containers: 66/66 passing.
- Added colors API tests first, then implemented `ops/api/src/routes/colors.js`.
- Added `/api/colors` routes:
  - `GET /api/colors`
  - `POST /api/colors`
  - `PATCH /api/colors/:id`
  - `DELETE /api/colors/:id`
- Colors mutations require `Idempotency-Key`; list supports `search` and `category` filters; `hex` is validated as `#RRGGBB` when present.
- Verified full API suite in temporary VPS containers: 72/72 passing.
- Added marketplace sets API tests first, then implemented `ops/api/src/routes/marketplaces.js`.
- Added `/api/marketplaces` routes:
  - `GET /api/marketplaces`
  - `GET /api/marketplaces/:id`
  - `POST /api/marketplaces`
  - `PATCH /api/marketplaces/:id`
  - `DELETE /api/marketplaces/:id`
  - `POST /api/marketplaces/:id/sell`
- Marketplace composition is normalized and validated against existing `warehouse_items`.
- Marketplace `sell` uses Idempotency-Key, a transaction, `SELECT FOR UPDATE` on the set and touched warehouse items, direct `warehouse_history.type='consume'` with `marketplace_set_id`, and no reservations.
- Verified full API suite in temporary VPS containers: 80/80 passing.

## Next steps for Codex

1. Add `ops/scripts/refresh/04-molds-blanks.mjs`.
2. Wire Block 5 tables into `refresh-staging-snapshot.mjs` and `compare-datasets.mjs`.
3. Verify refresh/compare against a temporary VPS Postgres database.

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
- [x] `refresh-staging-snapshot.mjs` and `compare-datasets.mjs` added
- [x] staging warehouse data refreshed from Supabase
- [x] Vue warehouse screens built
- [x] Playwright warehouse smoke passing
- [x] `ops/README.md` updated
- [x] PR opened
- [x] PR merged to main
- [x] main deploy passed

## Quality gates status (Block 4)

- [x] `004_shipments_china.sql` added
- [x] Shipments API tests passing
- [x] China API tests passing
- [x] refresh/compare scripts updated
- [x] staging shipments/china data refreshed from Supabase
- [x] Vue shipments/china screens built
- [x] Playwright shipments/china smoke passing
- [x] `ops/README.md` updated
- [x] PR opened
- [x] PR merged to main

## Quality gates status (Block 5)

- [x] `005_molds_blanks.sql` added
- [x] Molds API tests passing
- [x] Blanks API tests passing
- [x] Colors API tests passing
- [x] Marketplace API tests passing
- [ ] Refresh/compare updated for Block 5 tables
- [ ] Marketplaces API tests passing
- [ ] refresh/compare scripts updated
- [ ] staging molds/blanks/colors/marketplaces data refreshed from Supabase
- [ ] Vue molds/blanks/colors/marketplaces screens built
- [ ] Playwright molds/blanks smoke passing
- [ ] `ops/README.md` updated
- [ ] PR opened
- [ ] PR merged to main

## Blockers / questions

- No current Block 5 blocker.
- Supabase `employees` currently have no email values, so employee temp-password issuance produced only a CSV header. Staging admin smoke still covers the protected auth path.
- Local shell currently has no `docker` or `psql`, so DB-positive tests cannot run locally. Using isolated VPS containers as the verification path.

## Manual steps required by Polina

- UptimeRobot setup from Block 1 is still deferred/manual and not blocking Auth.

## Completed blocks summary

- ✅ Block 1: Infrastructure merged to `main` and deployed to staging
- ✅ Block 2: Auth + employees merged to `main` and deployed to staging
- ✅ Block 3: Warehouse merged to `main`, deployed to staging, live smoke passed
- ✅ Block 4: Shipments + China merged to `main`, deployed to staging, live smoke passed
- 🔄 Block 5: Molds + blanks + colors + marketplaces started
- ⏳ Block 6-16, Stages B/C/D: pending

## How to resume

1. Read this `STATUS.md`.
2. Continue Block 5 from Task 1 (`005_molds_blanks.sql`) on branch `block-5-molds-blanks`.
