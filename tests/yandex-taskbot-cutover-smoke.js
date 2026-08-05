const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

const deploy = read('.github/workflows/yandex-timebot-deploy.yml');
const monitor = read('.github/workflows/yandex-timebot-health.yml');
const taskbot = read('ops/bot/taskbot.js');
const spec = read('docs/specs/2026-08-05-yandex-taskbot-cutover.md');
const plan = read('docs/plans/2026-08-05-yandex-taskbot-cutover.md');

assert.match(deploy, /secrets\.TASK_BOT_TOKEN/, 'taskbot token must come from GitHub Secrets');
assert.match(deploy, /TG_BOT_TOKEN=%s/, 'deploy must install the token under the taskbot runtime key');
assert.match(deploy, /--name ro-taskbot/, 'deploy must create a dedicated taskbot container');
assert.match(deploy, /--network ro-platform-shadow_shadow/, 'taskbot must join the private Yandex API network');
assert.match(deploy, /ro-taskbot:latest node taskbot\.js/, 'taskbot container must start the API-backed runtime');
assert.match(deploy, /OPS_API_URL=http:\/\/ro-platform-shadow-api:3000/, 'taskbot must use the Yandex API');
assert.match(deploy, /Taskbot Yandex API probe passed/, 'deploy must prove API queue reads');
assert.match(deploy, /RestartCount[^]*ro-taskbot/, 'deploy must reject taskbot restart loops');
assert.match(deploy, /SUPABASE_/, 'deploy must explicitly inspect for leaked Supabase credentials');
assert.match(deploy, /DATABASE_URL=/, 'deploy must explicitly inspect for direct database credentials');
assert.match(deploy, /FATAL: Another bot instance/, 'deploy must reject a duplicate Telegram poller');

assert.match(monitor, /cron:\s*'\*\/5 \* \* \* \*'/, 'both bots must be monitored every five minutes');
assert.match(monitor, /ro-taskbot/, 'ongoing monitor must include taskbot');
assert.match(monitor, /bot\$\{TASK_BOT_TOKEN\}\/getMe/, 'monitor must probe taskbot through the protected relay');

assert.match(taskbot, /createOpsApiClient/, 'production taskbot must use the Ops API client');
assert.doesNotMatch(taskbot, /@supabase\/supabase-js/, 'production taskbot must not import Supabase');
assert.match(taskbot, /createTaskNotificationWorker\(\{[^]*apiClient/, 'worker must receive the API client');

assert.match(spec, /launchctl bootout/, 'spec must preserve a controlled single-poller cutover');
assert.match(spec, /launchctl bootstrap/, 'spec must document the local rollback');
assert.match(plan, /Managed Supabase не отключается/, 'plan must retain the legacy source during observation');

console.log('Yandex taskbot cutover smoke checks passed');
