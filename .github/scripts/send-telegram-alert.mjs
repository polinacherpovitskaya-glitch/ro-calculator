function firstNonEmpty(values) {
  return values.find((value) => typeof value === 'string' && value.trim() !== '') || '';
}

async function githubRequest(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
      'content-type': 'application/json',
      'user-agent': 'ro-calculator-smoke-monitor',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}) for ${path}: ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
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
const githubToken = firstNonEmpty([process.env.GITHUB_TOKEN]);
const repository = firstNonEmpty([process.env.GITHUB_REPOSITORY]);
const status = String(process.env.ALERT_STATUS || 'failure').trim().toLowerCase();

if (!token || !chatId) {
  console.log('telegram alert skipped: missing bot token or chat id');
  process.exit(0);
}

const workflow = process.env.ALERT_WORKFLOW || 'Unknown workflow';
const scope = process.env.ALERT_SCOPE || 'No scope provided';
const repositoryLabel = repository || 'unknown-repo';
const refName = process.env.GITHUB_REF_NAME || 'unknown-ref';
const sha = process.env.GITHUB_SHA || 'unknown-sha';
const shortSha = sha.slice(0, 7);
const actor = process.env.GITHUB_ACTOR || 'unknown-actor';
const eventName = process.env.GITHUB_EVENT_NAME || 'unknown-event';
const runUrl = process.env.ALERT_RUN_URL || '';
const sourceWorkflow = process.env.ALERT_SOURCE_WORKFLOW || '';
const issueTitle = `Smoke alert: ${workflow}`;
const notifyRecovery = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.TELEGRAM_NOTIFY_RECOVERY || process.env.ALERT_NOTIFY_RECOVERY || '')
    .trim()
    .toLowerCase()
);
const dedupeFailures = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.TELEGRAM_DEDUP_FAILURES || '')
    .trim()
    .toLowerCase()
);

let currentIssue = null;
const needsIssueLookup = (status === 'success' && notifyRecovery)
  || (status === 'failure' && dedupeFailures);

if (needsIssueLookup) {
  if (!githubToken || !repository) {
    console.log('telegram incident lookup skipped: missing GitHub token or repository');
  } else {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      console.log(`telegram incident lookup skipped: invalid repository ${repository}`);
    } else {
      const openIssues = await githubRequest(`/repos/${owner}/${repo}/issues?state=open&per_page=100`);
      currentIssue = (openIssues || []).find((issue) => !issue.pull_request && issue.title === issueTitle) || null;
    }
  }
}

if (status === 'success') {
  if (!notifyRecovery) {
    console.log('telegram recovery skipped: recovery notifications disabled');
    process.exit(0);
  }

  if (!currentIssue) {
    console.log('telegram recovery skipped: no open smoke issue to resolve');
    process.exit(0);
  }
}

if (status === 'failure' && dedupeFailures && currentIssue) {
  console.log(`telegram failure skipped: incident already tracked in issue #${currentIssue.number}`);
  process.exit(0);
}

const statusLabel = status === 'success'
  ? 'RECOVERED'
  : status === 'test'
    ? 'TEST'
    : 'FAILED';

const lines = [
  `RO smoke alert: ${statusLabel}`,
  `Workflow: ${workflow}`,
  `Scope: ${scope}`,
  `Repository: ${repositoryLabel}`,
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
