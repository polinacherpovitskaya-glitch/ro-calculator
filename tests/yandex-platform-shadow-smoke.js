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

assert.match(compose, /name: ro-platform-shadow/);
assert.match(compose, /image: postgres:16-alpine/);
assert.match(compose, /container_name: ro-platform-shadow-postgres/);
assert.match(compose, /container_name: ro-platform-shadow-api/);
assert.match(compose, /127\.0\.0\.1:\$\{SHADOW_API_PORT:-3100\}:3000/);
assert.match(compose, /platform-shadow-postgres-data/);
assert.match(compose, /S3_MOCK_DIR: \/app\/shadow-s3/);
assert.doesNotMatch(compose, /supabase|selectel/i);
assert.doesNotMatch(compose, /(?:^|\s)(?:80|443):(?:80|443)/);

assert.match(deploy, /openssl rand -hex 24/);
assert.match(deploy, /chmod 600 "\$\{ENV_FILE\}"/);
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

assert.match(workflow, /name: Yandex platform shadow/);
assert.match(workflow, /secrets\.YANDEX_VM_SSH_PRIVATE_KEY/);
assert.match(workflow, /secrets\.YANDEX_VM_HOST/);
assert.match(workflow, /secrets\.YANDEX_VM_USER/);
assert.match(workflow, /--exclude \.env\.shadow/);
assert.match(workflow, /docker port ro-platform-shadow-api/);
assert.match(workflow, /docker inspect[^]*supabase-db/);
assert.match(workflow, /docker inspect[^]*ro-timebot/);
assert.match(workflow, /deploy-yandex-caddy\.sh/);
assert.match(workflow, /https:\/\/api\.recycleobject\.ru\/api\/health/);
assert.match(workflow, /rehearse-yandex-platform\.sh/);
assert.doesNotMatch(workflow, /OPS_HOST|OPS_SSH_PRIVATE_KEY|Selectel/);

console.log('Yandex platform shadow contract checks passed');
