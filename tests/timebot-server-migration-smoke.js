const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const compose = read('ops/infra/docker-compose.yml');
assert.match(compose, /^\s{2}timebot:\n/m, 'compose should define a separate timebot service');
assert.match(compose, /profiles:\s*\["timebot"\]/, 'timebot should remain opt-in outside the deploy workflow');
assert.match(compose, /container_name:\s*ops-timebot/, 'timebot should have a stable container name');
assert.match(compose, /TIMEBOT_STATE_DIR:\s*\/app\/state/, 'timebot should write runtime files into the volume');
assert.match(compose, /timebot-state:\/app\/state/, 'timebot should mount its persistent state volume');
assert.match(compose, /^\s{2}timebot-state:\s*$/m, 'compose should declare the state volume');

const runtime = read('ops/bot/telegram-runtime.js');
assert.match(runtime, /TELEGRAM_BASE_API_URL/, 'bot runtime should support a relay base URL');
assert.match(runtime, /TELEGRAM_POLL_TIMEOUT_SECONDS/, 'bot runtime should cap long polling for the relay');

const timebot = read('ops/bot/timebot.js');
assert.match(timebot, /getTimebotRuntimePaths\(__dirname\)/, 'timebot should resolve persistent runtime paths');
assert.match(timebot, /buildTelegramBotOptions\(\)/, 'timebot should use shared Telegram client options');

const workflow = read('.github/workflows/ops-deploy.yml');
assert.match(workflow, /node --test yandex\/telegram-relay\/index\.test\.js/, 'CI should test the relay');
assert.match(workflow, /FUNCTION_NAME:\s*ro-telegram-relay/, 'CI should deploy the dedicated relay function');
assert.match(workflow, /secrets\.TELEGRAM_RELAY_SECRET/, 'relay authorization should come from a GitHub secret');
assert.match(workflow, /secrets\.TIMEBOT_TOKEN/, 'timebot token should come from a GitHub secret');
assert.match(workflow, /--env-file \.env\.timebot --profile timebot/, 'deploy should start timebot with server-only env');
assert.match(workflow, /FATAL: Another bot instance/, 'deploy should fail on polling conflict');

const relay = read('yandex/telegram-relay/index.js');
assert.match(relay, /const TELEGRAM_ORIGIN = 'https:\/\/api\.telegram\.org'/, 'relay upstream should be fixed');
assert.doesNotMatch(relay, /event\.(?:url|target)/, 'relay should not accept an arbitrary upstream target');

console.log('timebot server migration smoke checks passed');
