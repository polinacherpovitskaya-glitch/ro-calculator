# Stage B test results

Last update: 2026-05-20T15:14:34-03:00

## Scope

Stage B automated pre-flight, refresh, test, invariant, and initial performance checks for `ops-staging.recycleobject.ru`.

Manual 10-order money reconciliation, staff double-smoke, and cutover scheduling remain owner-led follow-ups.

## Pre-flight

- Blocks 1-16 are merged to `main`.
- Latest checked staging health: `status=ok`, `db.ok=true`.
- Latest checked `main` workflows before Stage B start were green.

## Task 1: staging refresh

Full staging refresh from Supabase completed on 2026-05-20.

Final compare after refresh and warehouse history baseline fix:

- employees: 14/14 OK
- orders: 191/191 OK
- order_items: 740/740 OK
- warehouse_items: 227/227 OK
- warehouse_reservations: 1167/1167 OK
- warehouse_history: 198/198 OK
- shipments: 13/13 OK
- shipment_items: 62/62 OK
- china_purchases: 14/14 OK
- china_purchase_items: 45/45 OK
- molds: 53/53 OK
- bug_reports: 10/10 OK
- time_entries: 193/193 OK
- settings: 46/46 OK
- all other compared tables: OK

## Task 2: automated tests

- `ops/api npm test`: 170/170 passed.
- `ops/api npm run test:calc`: 102/102 passed.
- `ops/api npm run typecheck`: passed.
- `ops/web npm run build`: passed.
- `tests/playwright`: 9/9 passed against staging.

Notes:

- The first Playwright run found an ambiguous `Месяц` selector in `time-payroll.spec.ts`; the app flow itself worked. The smoke now targets the month spinbutton by role/name.
- Stage B plan referenced `ops/scripts/check-warehouse-invariants.mjs`, which was missing. Added it in this branch.

## Staging warehouse invariants

After full refresh with baseline warehouse history:

- I1: sum of active reservations vs qty: 0 violations
- I2: history sum vs current qty: 0 violations
- I3: actor missing on non-audit history: 0 violations
- I4: orphan reservations: 0 violations
- I5-I7: covered by API integration tests and architecture/E2E checks

## Task 5: performance

Warm 20-request samples from the VPS with authenticated cookie:

| Endpoint | min | p50 | p95 | max | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| `/api/warehouse/items` | 0.099s | 0.107s | 0.124s | 0.138s | OK |
| `/api/orders` | 0.175s | 0.193s | 0.220s | 0.233s | Needs fix |
| `/api/tasks` | 0.083s | 0.090s | 0.143s | 0.154s | OK |
| `/api/health` | 0.072s | 0.076s | 0.086s | 0.087s | OK |

`/api/orders` SQL itself is fast (`EXPLAIN ANALYZE` around 1.4 ms); the overhead was response payload size from `SELECT *` including `calculator_data`. PR #65 changed the list endpoint to return only list columns.

Post-deploy re-test after PR #65 merged to `main`:

| Endpoint | min | p50 | p95 | max | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| `/api/orders` | 0.089s | 0.096s | 0.111s | 0.136s | OK |

## Post-deploy verification

- PR #65 was squash-merged to `main` as `b80b563`.
- GitHub Actions ops deploy run `26181038209` passed.
- Deployed full staging refresh + compare: all compared tables OK, including `warehouse_reservations 1167/1167`, `warehouse_history 198/198`, `settings 46/46`.
- Deployed warehouse invariants I1-I4: 0 violations.

## Remaining Stage B work

- Manual 10-order production-vs-staging money reconciliation.
- Full human screen walkthrough / staff double-smoke.
- Cutover checklist/date confirmation; Stage C remains owner-run.
