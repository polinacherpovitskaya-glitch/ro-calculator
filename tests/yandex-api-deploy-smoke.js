const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/yandex-api-deploy.yml', 'utf8');
const db = fs.readFileSync('ops/api/src/db.js', 'utf8');
const deployScript = fs.readFileSync('ops/infra/scripts/deploy-yandex-shadow.sh', 'utf8');

assert.match(workflow, /npm test/, 'API deploy must run the full API test suite');
assert.match(workflow, /pre-api-deploy-/, 'API deploy must create a production backup first');
assert.match(workflow, /pg_restore --list/, 'pre-deploy backup must be structurally verified');
assert.match(workflow, /deploy-yandex-shadow\.sh/, 'API deploy must reuse the isolated Yandex deploy script');
assert.match(workflow, /https:\/\/api\.recycleobject\.ru\/api\/health/, 'public API must be checked');
assert.match(workflow, /supabase-db/, 'rollback Supabase must remain running after deploy');
assert.doesNotMatch(workflow, /rehearse-yandex-platform|refresh\/\d+|sync-supabase-cutover/, 'API deploy must not refresh production rows');
assert.doesNotMatch(workflow, /docker\s+(?:rm|volume\s+rm)\b/, 'API deploy must not remove containers or volumes');
assert.doesNotMatch(deployScript, /(?:^|\s)-delete(?:\s|$)/m, 'API deploy must preserve every verified rollback dump');
assert.match(db, /connectionTimeoutMillis:\s*5000/, 'pool must tolerate normal connection scheduling delays');
assert.match(db, /nextPool\.on\('error'/, 'idle pool errors must not crash the API process');
assert.match(db, /allowExitOnIdle:\s*true/, 'idle test workers must be able to exit without delaying CI');

console.log('yandex API deploy smoke checks passed');
