# Тест-план консолидации инфраструктуры

## Source

- Task: перенести четыре продукта в Yandex Cloud без потери данных и без VPN
  для пользователей в России.
- Plan file: `docs/plans/2026-08-04-russia-cloud-consolidation.md`.
- Status file: `docs/cloud-consolidation-status.md`.
- Repositories: `ro-calculator`, `cnc-calculator`, `repanel-site`,
  `recycle-object-site`.
- Last updated: 2026-08-04.

## Validation scope

- In scope: DB, document stores, auth, Storage, runtime volumes, jobs, secrets
  inventory, live domains, restore/parity, writes and rollback.
- Out of scope for M1: production migration, DNS changes, provider deletion and
  UX/business-logic changes.

## Environment / fixtures

- Existing production sources remain authoritative until their own cutover.
- Backup artifacts are stored outside Git and referenced only by safe metadata.
- Tests use synthetic control records; реальные пользовательские payloads не
  выводятся в CI artifacts.
- Provider credentials are read from protected env/GitHub Secrets and never
  embedded in commands, manifests or logs.

## Test levels

### Unit

- Preservation manifest rejects unknown statuses and missing required fields.
- SHA-256 must contain exactly 64 lowercase hex characters when verified.
- A verified backup without verified restore is insufficient for decommission.
- Missing offline/cloud copy evidence blocks decommission.

### Integration

- PostgreSQL dumps pass `pg_restore --list` and restore into an isolated DB.
- Firestore export is readable and collection/document counts are reproducible.
- Firebase/Supabase/Yandex/Railway file manifests match count, bytes and SHA-256.
- Git bundles pass `git bundle verify`.
- Yandex backup bucket versioning and downloaded checksum verification pass.

### End-to-end / smoke

- `calc.recycleobject.ru` remains available throughout M1/M2.
- RePanel calculator shadow covers login, order save, CRM, warehouse, finance,
  time and attachment upload before cutover.
- RePanel site shadow covers catalog, admin, order, payment, return and webhook.
- Recycle Object shadow covers admin auth, checkout, payment, delivery, email,
  Telegram, refund and cron recovery.
- After each cutover, a control write is created/read/updated/deleted in Yandex
  and absent from old-provider new-write logs.

## Negative / edge cases

- Backup file exists but is empty or truncated.
- Checksum belongs to a different artifact.
- Restore succeeds structurally but row/document/object counts differ.
- A concurrent write lands between final delta and DNS switch.
- Duplicate payment/delivery webhook reaches old and new runtime.
- Auth users exist in public tables but are missing from auth export.
- Object metadata exists but file bytes are missing.
- Secret appears in generated manifest or CI log.
- Yandex runtime restarts and loses state that was incorrectly stored locally.
- Old provider still receives traffic during observation.

## Acceptance gates

- [x] `node tests/cloud-consolidation-preservation-smoke.js`
- [x] inventory mode passes.
- [ ] backups mode passes before first shadow import.
- [ ] decommission mode passes before any provider pause/delete.
- [x] `node tests/version-smoke.js`
- [ ] product-specific test suites and builds pass before each cutover.
- [ ] restore drill and parity reports contain no unexplained mismatch.
- [ ] rollback is executable and rehearsed.

## Release / demo readiness

- [ ] Core scenario works end to end for each product.
- [ ] Primary regression checks are green.
- [ ] No blocker-level backup, restore or parity issue remains.
- [ ] Production URL works from Russia without VPN.
- [ ] Monitoring and backup alerts are active.
- [ ] Old source remains recoverable during the observation window.

## Command matrix

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=inventory
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=backups
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=decommission
node tests/cloud-consolidation-preservation-smoke.js
node tests/version-smoke.js
```

Product-specific commands are added in each product repository plan before its
implementation begins.

## Open risks

- Railway Hobby Volume does not provide the required backup guarantees by
  itself.
- Managed Supabase database export is not equivalent to Storage/Auth export.
- Firebase export tooling and bucket permissions must be proven with current
  credentials.
- Vercel/foreign email/AI logs may require separate data-flow minimization even
  after primary data is in Russia.

## Deferred coverage

- Physical deletion of old provider data is a separate destructive project.
- Legal validation of privacy policies, consents and Roskomnadzor notifications
  is required but does not replace technical backup/restore tests.
