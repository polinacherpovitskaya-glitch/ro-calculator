function firstNonEmpty(values) {
  return values.find((value) => typeof value === 'string' && value.trim() !== '') || '';
}

const token = firstNonEmpty([
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.TASK_BOT_TOKEN,
  process.env.BOT_TOKEN,
]);

const chatId = firstNonEmpty([
  process.env.TELEGRAM_ALERT_CHAT_ID,
  process.env.TELEGRAM_SMOKE_CHAT_ID,
  process.env.TELEGRAM_CHAT_ID,
]);

if (!token || !chatId) {
  console.log('telegram alert skipped: missing bot token or chat id');
  process.exit(0);
}

const workflow = process.env.ALERT_WORKFLOW || 'Unknown workflow';
const scope = process.env.ALERT_SCOPE || 'No scope provided';
const repository = process.env.GITHUB_REPOSITORY || 'unknown-repo';
const refName = process.env.GITHUB_REF_NAME || 'unknown-ref';
const sha = process.env.GITHUB_SHA || 'unknown-sha';
const shortSha = sha.slice(0, 7);
const actor = process.env.GITHUB_ACTOR || 'unknown-actor';
const eventName = process.env.GITHUB_EVENT_NAME || 'unknown-event';
const runUrl = process.env.ALERT_RUN_URL || '';
const sourceWorkflow = process.env.ALERT_SOURCE_WORKFLOW || '';

const lines = [
  'RO smoke alert: FAILED',
  `Workflow: ${workflow}`,
  `Scope: ${scope}`,
  `Repository: ${repository}`,
  `Branch: ${refName}`,
  `Commit: ${shortSha}`,
  `Actor: ${actor}`,
  `Event: ${eventName}`,
];

if (sourceWorkflow) {
  lines.push(`Triggered by: ${sourceWorkflow}`);
}

if (runUrl) {
  lines.push(`Run: ${runUrl}`);
}

lines.push(`Time (UTC): ${new Date().toISOString()}`);

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    chat_id: chatId,
    text: lines.join('\n'),
    disable_web_page_preview: true,
  }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Telegram API request failed (${response.status}): ${body}`);
}

console.log('telegram alert sent');
