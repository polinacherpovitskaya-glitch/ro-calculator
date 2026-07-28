const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const compose = fs.readFileSync(
  path.join(root, 'ops/infra/docker-compose.yandex-shadow.yml'),
  'utf8'
);
const deploy = fs.readFileSync(
  path.join(root, 'ops/infra/scripts/deploy-yandex-shadow.sh'),
  'utf8'
);
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/yandex-platform-shadow.yml'),
  'utf8'
);
const caddy = fs.readFileSync(
  path.join(root, 'ops/infra/yandex-caddy/Caddyfile'),
  'utf8'
);
const caddyCompose = fs.readFileSync(
  path.join(root, 'ops/infra/yandex-caddy/compose.yml'),
  'utf8'
);
const caddyDeploy = fs.readFileSync(
  path.join(root, 'ops/infra/scripts/deploy-yandex-caddy.sh'),
  'utf8'
);
const rehearsal = fs.readFileSync(
  path.join(root, 'ops/infra/scripts/rehearse-yandex-platform.sh'),
  'utf8'
);
const financeMigration = fs.readFileSync(
  path.join(root, 'ops/db/migrations/014_finance.sql'),
  'utf8'
);
const timebotMigration = fs.readFileSync(
  path.join(root, 'ops/db/migrations/016_timebot_compatibility.sql'),
  'utf8'
);
const financeRefresh = fs.readFileSync(
  path.join(root, 'ops/scripts/refresh/11-finance.mjs'),
  'utf8'
);
const refreshSnapshot = fs.readFileSync(
  path.join(root, 'ops/scripts/refresh-staging-snapshot.mjs'),
  'utf8'
);
const compareDatasets = fs.readFileSync(
  path.join(root, 'ops/scripts/compare-datasets.mjs'),
  'utf8'
);
const compatMigration = fs.readFileSync(
  path.join(root, 'ops/db/migrations/017_compatibility_store.sql'),
  'utf8'
);
const legacyAuthMigration = fs.readFileSync(
  path.join(root, 'ops/db/migrations/018_legacy_auth_bridge.sql'),
  'utf8'
);
const compatRoute = fs.readFileSync(
  path.join(root, 'ops/api/src/routes/compat.js'),
  'utf8'
);
const apiServer = fs.readFileSync(
  path.join(root, 'ops/api/src/server.js'),
  'utf8'
);
const browserPlatformClient = fs.readFileSync(
  path.join(root, 'js/platform-client.js'),
  'utf8'
);

assert.match(compose, /name: ro-platform-shadow/);
assert.match(compose, /image: postgres:16-alpine/);
assert.match(compose, /container_name: ro-platform-shadow-postgres/);
assert.match(compose, /container_name: ro-platform-shadow-api/);
assert.match(compose, /127\.0\.0\.1:\$\{SHADOW_API_PORT:-3100\}:3000/);
assert.match(compose, /platform-shadow-postgres-data/);
assert.match(compose, /path: \.env\.storage/);
assert.match(compose, /required: true/);
assert.doesNotMatch(compose, /supabase|selectel/i);
assert.doesNotMatch(compose, /(?:^|\s)(?:80|443):(?:80|443)/);

assert.match(deploy, /openssl rand -hex 24/);
assert.match(deploy, /chmod 600 "\$\{ENV_FILE\}"/);
assert.match(deploy, /test -s "\$\{STORAGE_ENV_FILE\}"/);
assert.match(deploy, /db\/migrations\/\*\.sql/);
assert.match(deploy, /http:\/\/127\.0\.0\.1:\$\{API_PORT\}\/api\/health/);
assert.match(deploy, /grep -Eq '"status"/);
assert.match(deploy, /grep -Eq '"db"/);
assert.match(deploy, /pg_dump[^]*-Fc/);
assert.match(deploy, /pg_restore --list/);
assert.match(deploy, /chmod 600 "\$\{BACKUP_FILE\}"/);
assert.doesNotMatch(deploy, /^\s*node\b/m);
assert.doesNotMatch(deploy, /docker (?:stop|rm).*supabase/);

assert.match(caddy, /db\.recycleobject\.ru[^]*reverse_proxy supabase-kong:8000/);
assert.match(caddy, /api\.recycleobject\.ru[^]*reverse_proxy ro-platform-shadow-api:3000/);
assert.match(caddyCompose, /name: supabase_default/);
assert.match(caddyCompose, /name: ro-platform-shadow_shadow/);
assert.match(caddyDeploy, /caddy validate/);
assert.match(caddyDeploy, /trap rollback ERR/);
assert.match(caddyDeploy, /db_status[^]*\^\(200\|401\)\$/);
assert.match(caddyDeploy, /--resolve db\.recycleobject\.ru:443:127\.0\.0\.1/);
assert.match(caddyDeploy, /--resolve api\.recycleobject\.ru:443:127\.0\.0\.1/);

assert.match(rehearsal, /refresh-staging-snapshot\.mjs/);
assert.match(rehearsal, /compare-datasets\.mjs/);
assert.match(rehearsal, /SUPABASE_URL=https:\/\/db\.recycleobject\.ru/);
assert.match(rehearsal, /ro-platform-shadow-postgres:5432/);
assert.match(rehearsal, /grep -q 'MISMATCH'/);
assert.match(rehearsal, /pg_dump[^]*-Fc/);
assert.match(rehearsal, /pg_restore --list/);
assert.doesNotMatch(rehearsal, /Selectel|OPS_HOST|ops-staging/i);

assert.match(financeMigration, /CREATE TABLE IF NOT EXISTS finance_transactions/);
assert.match(financeMigration, /CREATE TABLE IF NOT EXISTS bank_transactions/);
assert.match(financeMigration, /CREATE TABLE IF NOT EXISTS legacy_finance_transactions/);
assert.match(financeMigration, /CREATE TABLE IF NOT EXISTS fintablo_imports/);
assert.match(timebotMigration, /ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_id/);
assert.match(timebotMigration, /ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_description/);
assert.match(financeRefresh, /PAGE_SIZE = 1000/);
assert.match(financeRefresh, /OVERRIDING SYSTEM VALUE/);
assert.match(financeRefresh, /finance_transactions/);
assert.match(financeRefresh, /legacy_finance_transactions/);
assert.match(refreshSnapshot, /'11-finance'/);
assert.match(refreshSnapshot, /'12-legacy-site-archive'/);
assert.match(refreshSnapshot, /'13-compatibility-store'/);
assert.match(refreshSnapshot, /'14-rewrite-storage-urls'/);
assert.match(compareDatasets, /'finance_transactions'/);
assert.match(compareDatasets, /'fintablo_imports'/);
assert.match(compareDatasets, /archive:/);
assert.match(compareDatasets, /compat:/);
assert.match(compareDatasets, /yandex_storage_urls/);
assert.match(compareDatasets, /const sbCount = await supabaseRawCount\(table\)/);
assert.match(compatMigration, /CREATE TABLE IF NOT EXISTS compat_rows/);
assert.match(compatMigration, /data JSONB NOT NULL/);
assert.match(legacyAuthMigration, /legacy_account_id TEXT/);
assert.match(compatRoute, /pg_advisory_xact_lock/);
assert.match(compatRoute, /withIdempotency/);
assert.match(compatRoute, /requireAuth/);
assert.match(apiServer, /calculatorCors/);
assert.match(apiServer, /\/api\/compat/);
assert.match(browserPlatformClient, /credentials: 'include'/);
assert.match(browserPlatformClient, /Idempotency-Key/);
assert.match(browserPlatformClient, /\/api\/compat\/query/);

assert.match(workflow, /name: Yandex platform shadow/);
assert.match(workflow, /secrets\.YANDEX_VM_SSH_PRIVATE_KEY/);
assert.match(workflow, /secrets\.YANDEX_VM_HOST/);
assert.match(workflow, /secrets\.YANDEX_VM_USER/);
assert.match(workflow, /--exclude \.env\.shadow/);
assert.match(workflow, /ro-platform-media-api/);
assert.match(workflow, /yc iam access-key create/);
assert.match(workflow, /S3_ENDPOINT=https:\/\/storage\.yandexcloud\.net/);
assert.match(workflow, /platform-secrets\/yandex-storage\.env/);
assert.match(workflow, /Verify Yandex media read and write/);
assert.match(workflow, /yandex-storage-ok/);
assert.match(workflow, /docker port ro-platform-shadow-api/);
assert.match(workflow, /docker inspect[^]*supabase-db/);
assert.match(workflow, /docker inspect[^]*ro-timebot/);
assert.match(workflow, /deploy-yandex-caddy\.sh/);
assert.match(workflow, /https:\/\/api\.recycleobject\.ru\/api\/health/);
assert.match(workflow, /rehearse-yandex-platform\.sh/);
assert.doesNotMatch(workflow, /OPS_HOST|OPS_SSH_PRIVATE_KEY|Selectel/);

console.log('Yandex platform shadow contract checks passed');
