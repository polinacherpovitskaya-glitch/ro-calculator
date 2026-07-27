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

const workflow = read('.github/workflows/yandex-timebot-deploy.yml');
const legacyWorkflow = read('.github/workflows/ops-deploy.yml');
assert.match(legacyWorkflow, /node --test yandex\/telegram-relay\/index\.test\.js/, 'CI should test the relay');
assert.match(legacyWorkflow, /node --test tests\/vercel-telegram-relay\.test\.js/, 'CI should test the Vercel adapter');
assert.match(workflow, /https:\/\/ro-calculator\.vercel\.app\/api\/telegram-relay/, 'Yandex VM should use the stable Vercel relay domain');
assert.doesNotMatch(workflow, /yc serverless/, 'CI should not deploy the unreachable Yandex relay');
assert.match(workflow, /secrets\.TELEGRAM_RELAY_SECRET/, 'relay authorization should come from a GitHub secret');
assert.match(workflow, /secrets\.TIMEBOT_TOKEN/, 'timebot token should come from a GitHub secret');
assert.match(workflow, /SUPABASE_URL=https:\/\/db\.recycleobject\.ru/, 'timebot should write to the Yandex database');
assert.match(workflow, /ro-timebot-state:\/app\/state/, 'deploy should retain persistent timebot state');
assert.match(workflow, /FATAL: Another bot instance/, 'deploy should fail on polling conflict');
assert.doesNotMatch(legacyWorkflow, /^\s{2}push:/m, 'legacy Selectel deploy must not run on push');

const vercelConfig = JSON.parse(read('vercel.json'));
assert.equal(vercelConfig.functions['api/telegram-relay.js'].maxDuration, 45, 'Vercel relay should outlive upstream polling');
assert.deepEqual(vercelConfig.rewrites[0], {
    source: '/api/telegram-relay/:relay_path*',
    destination: '/api/telegram-relay?relay_path=:relay_path*',
}, 'Vercel should route protected wildcard paths into the relay function');

const relay = read('yandex/telegram-relay/index.js');
assert.match(relay, /const TELEGRAM_ORIGIN = 'https:\/\/api\.telegram\.org'/, 'relay upstream should be fixed');
assert.doesNotMatch(relay, /event\.(?:url|target)/, 'relay should not accept an arbitrary upstream target');

console.log('timebot server migration smoke checks passed');
