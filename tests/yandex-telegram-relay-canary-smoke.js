const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/yandex-telegram-relay-canary.yml'),
  'utf8'
);
const relay = fs.readFileSync(path.join(root, 'yandex/telegram-relay/index.js'), 'utf8');

assert.match(workflow, /name: Yandex Telegram relay canary/);
assert.match(workflow, /FUNCTION_NAME: ro-telegram-relay/);
assert.match(workflow, /GATEWAY_NAME: ro-telegram-relay-gateway/);
assert.match(workflow, /secrets\.TELEGRAM_RELAY_SECRET/);
assert.match(workflow, /secrets\.TIMEBOT_TOKEN/);
assert.match(workflow, /secrets\.YC_OAUTH_TOKEN/);
assert.match(workflow, /deploy_version standard/);
assert.match(workflow, /deploy_version user-vpc/);
assert.match(workflow, /--network-name default/);
assert.match(workflow, /Recycle_object_calc_bot/);
assert.doesNotMatch(workflow, /docker (?:run|restart|rm)/, 'canary must not touch production timebot');
assert.doesNotMatch(workflow, /yandex-timebot-deploy/, 'canary must not dispatch production deploy');

assert.match(relay, /require\('node:https'\)/);
assert.match(relay, /family: 4/);
assert.match(relay, /safeNetworkError/);
assert.doesNotMatch(relay, /console\.(?:log|error)\([^)]*targetUrl/, 'relay must not log token-bearing URLs');

console.log('Yandex Telegram relay canary workflow checks passed');
