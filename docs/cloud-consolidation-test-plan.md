# Тест-план консолидации инфраструктуры

## Source

- Task: перенести четыре продукта в Yandex Cloud без потери данных и без VPN
  для пользователей в России.
- Plan file: `docs/plans/2026-08-04-russia-cloud-consolidation.md`.
- Status file: `docs/cloud-consolidation-status.md`.
- Repositories: `ro-calculator`, `cnc-calculator`, `repanel-site`,
  `recycle-object-site`.
- Last updated: 2026-08-05.

## Validation scope

- In scope: DB, document stores, auth, Storage, runtime volumes, jobs, secrets
  inventory, live domains, restore/parity, writes and rollback.
- Out of scope: physical provider deletion and unrelated UX/business-logic
  changes. Production cutovers M3–M6 are now covered by this plan.

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
- RO site daily backup downloads DB/Storage/manifest/checksums back from Yandex
  and validates the uploaded bytes with SHA-256.

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
- [x] backups mode passes before first shadow import.
- [ ] decommission mode passes before any provider pause/delete.
- [x] `node tests/version-smoke.js`
- [x] Four Git bundles pass `git bundle verify`.
- [x] Firestore and Firebase Storage SHA-256 manifests pass; second
  generation listing reports no source changes.
- [x] Railway server/local tar size and SHA-256 match; tar traversal passes.
- [x] Encrypted preservation set passes SHA-256 generation and full
  decrypt/tar traversal.
- [x] product-specific test suites and builds pass for completed cutovers.
- [x] completed-cutover restore/parity reports contain no unexplained mismatch.
- [x] rollback artifacts exist and isolated restore rehearsals pass.
- [x] `node tests/ro-site-backup-smoke.js`.
- [x] RO site first daily backup service run exits 0 and remote read-back passes.
- [x] Fresh scheduled RO site dump restores with `supabase_admin`, matches all
  manifest counts and its Storage archive passes full traversal.

## Release / demo readiness

- [x] Core scenario works end to end for completed product cutovers.
- [x] Primary regression checks are green for completed cutovers.
- [x] No blocker-level backup, restore or parity issue remains.
- [x] Production URLs are directly reachable without VPN.
- [x] Daily RO site backup timer is active; broader alert observation continues.
- [x] Old sources remain recoverable during the observation window.

## Command matrix

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=inventory
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=backups
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=decommission
node tests/cloud-consolidation-preservation-smoke.js
node tests/ro-site-backup-smoke.js
node tests/version-smoke.js
```

Product-specific commands are added in each product repository plan before its
implementation begins.

## Open risks

- Managed Supabase projects remain rollback sources during observation; their
  physical deletion is not authorized.
- Restore drills require the original `supabase_admin` owner role because Vault
  tables intentionally reject a plain non-superuser `postgres` restore.
- Google Gemini remains a foreign runtime provider until replaced or disabled.
- Vercel/foreign email/AI logs may require separate data-flow minimization even
  after primary data is in Russia.

## Deferred coverage

- Physical deletion of old provider data is a separate destructive project.
- Legal validation of privacy policies, consents and Roskomnadzor notifications
  is required but does not replace technical backup/restore tests.
