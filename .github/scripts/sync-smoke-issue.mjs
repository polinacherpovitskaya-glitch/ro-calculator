function firstNonEmpty(values) {
  return values.find((value) => typeof value === 'string' && value.trim() !== '') || '';
}

async function githubRequest(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
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

const token = firstNonEmpty([process.env.GITHUB_TOKEN]);
const repository = firstNonEmpty([process.env.GITHUB_REPOSITORY]);

if (!token || !repository) {
  console.log('smoke issue sync skipped: missing GitHub token or repository');
  process.exit(0);
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) {
  throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
}

const workflow = process.env.ALERT_WORKFLOW || 'Unknown workflow';
const scope = process.env.ALERT_SCOPE || 'No scope provided';
const status = String(process.env.ALERT_STATUS || '').toLowerCase();
const sourceWorkflow = process.env.ALERT_SOURCE_WORKFLOW || '';
const runUrl = process.env.ALERT_RUN_URL || '';
const refName = process.env.GITHUB_REF_NAME || 'unknown-ref';
const sha = process.env.GITHUB_SHA || 'unknown-sha';
const shortSha = sha.slice(0, 7);
const actor = process.env.GITHUB_ACTOR || 'unknown-actor';
const eventName = process.env.GITHUB_EVENT_NAME || 'unknown-event';
const timestamp = new Date().toISOString();
const title = `Smoke alert: ${workflow}`;

function buildFailureText() {
  const lines = [
    'Smoke monitor reported a failure.',
    '',
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

  lines.push(`Time (UTC): ${timestamp}`);
  return lines.join('\n');
}

function buildRecoveryText() {
  const lines = [
    'Smoke monitor recovered and is passing again.',
    '',
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

  lines.push(`Time (UTC): ${timestamp}`);
  return lines.join('\n');
}

const openIssues = await githubRequest(`/repos/${owner}/${repo}/issues?state=open&per_page=100`);
const currentIssue = (openIssues || []).find((issue) => !issue.pull_request && issue.title === title) || null;

if (status === 'failure') {
  const incidentText = buildFailureText();

  if (currentIssue) {
    await githubRequest(`/repos/${owner}/${repo}/issues/${currentIssue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: incidentText }),
    });
    console.log(`smoke issue updated: #${currentIssue.number}`);
  } else {
    const issue = await githubRequest(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body: incidentText,
      }),
    });
    console.log(`smoke issue created: #${issue.number}`);
  }
  process.exit(0);
}

if (status === 'success') {
  if (!currentIssue) {
    console.log('smoke issue sync skipped: no open issue to close');
    process.exit(0);
  }

  const recoveryText = buildRecoveryText();
  await githubRequest(`/repos/${owner}/${repo}/issues/${currentIssue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: recoveryText }),
  });
  await githubRequest(`/repos/${owner}/${repo}/issues/${currentIssue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
  console.log(`smoke issue closed: #${currentIssue.number}`);
  process.exit(0);
}

console.log(`smoke issue sync skipped: unsupported ALERT_STATUS="${status}"`);
