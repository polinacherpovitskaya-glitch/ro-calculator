const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

const workflow = read('.github/workflows/yandex-timebot-health.yml');
const timebot = read('ops/bot/timebot.js');
const stateUtils = read('ops/bot/timebot-state-utils.js');
const alertScript = read('.github/scripts/send-telegram-alert.mjs');
const deployWorkflow = read('.github/workflows/deploy-pages.yml');

assert.match(workflow, /cron:\s*'\*\/5 \* \* \* \*'/, 'monitor should run every five minutes');
assert.match(workflow, /Yandex timebot deploy/, 'monitor should also run after a timebot deploy');
assert.match(workflow, /docker inspect[^]*ro-timebot/, 'monitor should verify the Yandex container');
assert.match(workflow, /timebot\.health\.json/, 'monitor should validate the persistent health file');
assert.match(workflow, /validateTimebotHealthSnapshot/, 'monitor should reject stale or unhealthy snapshots');
assert.match(workflow, /telegram-relay[^]*getMe/, 'monitor should probe the Telegram relay independently');
assert.match(workflow, /https:\/\/db\.recycleobject\.ru/, 'monitor should require the Yandex database');
assert.match(workflow, /rest\/v1\/employees\?select=id&limit=1/, 'monitor DB probe should be read-only');
assert.match(workflow, /127\.0\.0\.1:3100\/api\/health/, 'monitor should probe the replacement API and PostgreSQL');
assert.match(workflow, /replacement API/, 'alerts should identify replacement API failures');
assert.match(workflow, /TELEGRAM_DEDUP_FAILURES:\s*'true'/, 'monitor should deduplicate repeated incidents');
assert.match(workflow, /TELEGRAM_NOTIFY_RECOVERY:\s*'true'/, 'monitor should report recovery');
assert.match(workflow, /TELEGRAM_ALERT_CHAT_ID/, 'monitor should route alerts to the configured chat');
assert.match(workflow, /send_test_alert/, 'manual monitor run should support one test notification');

assert.match(stateUtils, /timebot\.health\.json/, 'health file should live in the persistent timebot state directory');
assert.match(timebot, /refreshTimebotHealth/, 'timebot should publish active self-health');
assert.match(timebot, /bot\.getMe\(\)/, 'timebot self-health should verify Telegram');
assert.match(timebot, /from\('employees'\)\.select\('id'\)\.limit\(1\)/, 'timebot self-health should verify Yandex DB');
assert.match(timebot, /HEALTH_PROBE_INTERVAL_MS\s*=\s*60 \* 1000/, 'timebot should refresh health every minute');

assert.match(alertScript, /TELEGRAM_DEDUP_FAILURES/, 'alert sender should support incident deduplication');
assert.match(alertScript, /incident already tracked/, 'repeat failures should be skipped');
assert.match(alertScript, /status === 'test'[^]*'TEST'/, 'alert sender should label test notifications clearly');
assert.match(
    deployWorkflow,
    /node tests\/timebot-health-monitor-smoke\.js/,
    'the production verification workflow should enforce the monitor contract'
);

console.log('timebot health monitor smoke checks passed');
