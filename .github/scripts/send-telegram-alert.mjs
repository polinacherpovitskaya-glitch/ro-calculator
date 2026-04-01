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

if (status === 'success') {
  if (!githubToken || !repository) {
    console.log('telegram recovery skipped: missing GitHub token or repository');
    process.exit(0);
  }

  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    console.log(`telegram recovery skipped: invalid repository ${repository}`);
    process.exit(0);
  }

  const openIssues = await githubRequest(`/repos/${owner}/${repo}/issues?state=open&per_page=100`);
  const currentIssue = (openIssues || []).find((issue) => !issue.pull_request && issue.title === issueTitle) || null;
  if (!currentIssue) {
    console.log('telegram recovery skipped: no open smoke issue to resolve');
    process.exit(0);
  }
}

const statusLabel = status === 'success' ? 'RECOVERED' : 'FAILED';

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
