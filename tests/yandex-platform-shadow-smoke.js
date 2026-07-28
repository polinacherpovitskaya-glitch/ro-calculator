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
assert.doesNotMatch(deploy, /docker (?:stop|rm).*supabase/);

assert.match(workflow, /name: Yandex platform shadow/);
assert.match(workflow, /secrets\.YANDEX_VM_SSH_PRIVATE_KEY/);
assert.match(workflow, /secrets\.YANDEX_VM_HOST/);
assert.match(workflow, /secrets\.YANDEX_VM_USER/);
assert.match(workflow, /--exclude \.env\.shadow/);
assert.match(workflow, /docker port ro-platform-shadow-api/);
assert.match(workflow, /docker inspect[^]*supabase-db/);
assert.match(workflow, /docker inspect[^]*ro-timebot/);
assert.doesNotMatch(workflow, /OPS_HOST|OPS_SSH_PRIVATE_KEY|Selectel/);

console.log('Yandex platform shadow contract checks passed');

