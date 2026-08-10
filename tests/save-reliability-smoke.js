const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const platformSource = fs.readFileSync(path.join(root, 'js', 'platform-client.js'), 'utf8');
const statusEvents = [];

function testSetTimeout(callback, delay, ...args) {
  const timer = setTimeout(callback, delay, ...args);
  if (delay > 100 && typeof timer.unref === 'function') timer.unref();
  return timer;
}

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const windowObject = {
  location: { protocol: 'https:', origin: 'https://calc2.recycleobject.ru' },
  addEventListener() {},
  dispatchEvent(event) {
    statusEvents.push({ type: event.type, detail: event.detail });
    return true;
  },
};

const context = vm.createContext({
  console,
  window: windowObject,
  CustomEvent: TestCustomEvent,
  setTimeout: testSetTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval() {},
  localStorage: {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  },
});

vm.runInContext(supabaseSource, context, { filename: 'js/supabase.js' });

async function runInContext(source) {
  return vm.runInContext(`(async () => { ${source} })()`, context);
}

async function main() {
  await runInContext(`
    const result = await _withRemoteTimeout('write', 'transient recovered', async () => ({
      data: { ok: true },
      error: null,
    }));
    if (!result.data.ok) throw new Error('expected successful retry result');
  `);
  assert.equal(windowObject.__roSharedDatabaseProblem, undefined);
  assert.equal(statusEvents.length, 0, 'a recovered transient failure must not flash the shared DB banner');

  await runInContext(`
    await _withRemoteTimeout('write', 'persistent failure', async () => ({
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Failed to fetch', status: 0 },
    }));
  `);
  assert.match(String(windowObject.__roSharedDatabaseProblem), /Failed to fetch/);
  assert.equal(statusEvents.at(-1).detail.ok, false);

  await runInContext(`
    await _withRemoteTimeout('write', 'recovery success', async () => ({ data: null, error: null }));
  `);
  assert.equal(windowObject.__roSharedDatabaseProblem, undefined);
  assert.equal(statusEvents.at(-1).detail.ok, true, 'the next confirmed request must clear the banner');

  await runInContext(`
    await _withRemoteTimeout('write', 'persistent gateway failure', async () => ({
      data: null,
      error: { code: 'TEMPORARY', message: 'service unavailable', status: 503 },
    }));
  `);
  assert.match(String(windowObject.__roSharedDatabaseProblem), /service unavailable/);
  assert.equal(statusEvents.at(-1).detail.ok, false, 'an exhausted 503 retry must show the banner');

  await runInContext(`
    await _withRemoteTimeout('write', 'gateway recovery', async () => ({ data: null, error: null }));
  `);
  assert.equal(windowObject.__roSharedDatabaseProblem, undefined);

  windowObject.__RO_REMOTE_WRITE_TIMEOUT_MS = 5;
  await assert.rejects(
    runInContext(`
      await _withRemoteTimeout('write', 'hung save', () => new Promise(() => {}));
    `),
    error => error?.code === 'timeout' && error?.operation === 'hung save',
  );
  assert.match(String(windowObject.__roSharedDatabaseProblem), /timeout \(hung save/);
  assert.equal(statusEvents.at(-1).detail.ok, false);

  await runInContext(`
    await _withRemoteTimeout('write', 'post-timeout recovery', async () => ({ data: null, error: null }));
  `);
  assert.equal(windowObject.__roSharedDatabaseProblem, undefined);

  assert.match(appSource, /безопасно переподключаемся/);
  assert.match(appSource, /Последнее сохранение пока не подтверждено/);
  assert.doesNotMatch(appSource, /Последнее действие могло сохраниться частично/);

  const dataLayerWrites = [...supabaseSource.matchAll(
    /^async function (?:save|update|delete|create)[A-Za-z0-9_]*/gm,
  )];
  assert.ok(dataLayerWrites.length >= 75, 'the audit must continue covering the complete data-layer write surface');
  assert.match(platformSource, /mutation\s*\? await postMutationJson/);
  assert.match(platformSource, /async upload[\s\S]*await postMutation\(/);
  assert.match(platformSource, /async remove[\s\S]*await postMutationJson\(/);

  console.log(`All-save reliability smoke passed (${dataLayerWrites.length} data-layer write functions)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
