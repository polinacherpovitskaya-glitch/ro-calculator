import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync('node', ['.github/scripts/send-telegram-alert.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ALERT_CHAT_ID: 'test-chat',
    ALERT_STATUS: 'success',
    ALERT_WORKFLOW: 'Yandex mirror smoke',
    GITHUB_TOKEN: 'test-gh-token',
    GITHUB_REPOSITORY: 'polinacherpovitskaya-glitch/ro-calculator',
  },
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /recovery notifications disabled/);

console.log('telegram alert smoke checks passed');
