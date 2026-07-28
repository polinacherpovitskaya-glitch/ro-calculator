import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  platformDelete,
  platformQuery,
  platformSelectOne,
  platformUpsert,
} from '../scripts/platform-compat-client.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'yandex-writeback-smoke');
fs.mkdirSync(outputDir, { recursive: true });

const marker = [
  'yandex-writeback',
  process.env.GITHUB_RUN_ID || 'local',
  Date.now(),
  Math.random().toString(36).slice(2),
].join('-');
const now = new Date().toISOString();
const smokeKey = process.env.RO_YANDEX_WRITEBACK_KEY || 'ro_yandex_writeback_smoke_json';
const timeEntryId = Date.now();
const cleanup = [];

async function verifyHealth() {
  const apiUrl = String(process.env.OPS_API_URL || 'https://api.recycleobject.ru').replace(/\/+$/, '');
  const response = await fetch(`${apiUrl}/api/health`, {
    headers: { Accept: 'application/json' },
  });
  const body = await response.text();
  assert.ok(response.ok, `Yandex API health failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  const payload = JSON.parse(body);
  assert.ok(
    payload.ok === true || payload.status === 'ok',
    `Yandex API health is not green: ${body.slice(0, 300)}`,
  );
  return payload;
}

async function verifySettingsWrite() {
  const value = JSON.stringify({
    ok: true,
    source: 'yandex-platform-writeback-smoke',
    marker,
    written_at: now,
  });
  await platformUpsert('settings', {
    key: smokeKey,
    value,
    updated_at: now,
  }, { onConflict: 'key' });
  cleanup.push(() => platformDelete('settings', [
    { op: 'eq', column: 'key', value: smokeKey },
  ]));

  const row = await platformSelectOne('settings', {
    columns: 'key,value,updated_at',
    filters: [{ op: 'eq', column: 'key', value: smokeKey }],
  });
  assert.equal(row?.key, smokeKey);
  assert.equal(JSON.parse(row?.value || '{}').marker, marker);
  return { key: row.key, updated_at: row.updated_at };
}

async function verifyTimeEntryWrite() {
  const description = `[meta]${JSON.stringify({
    stage: 'other',
    stage_label: 'Yandex write-back smoke',
    project: 'RO_SMOKE',
    marker,
  })}[/meta] Automated Yandex platform write-back check`;
  const row = {
    id: timeEntryId,
    employee_id: null,
    employee_name: 'RO_SMOKE',
    date: '2000-01-01',
    hours: 0.5,
    task_description: description,
    order_id: null,
    notes: 'yandex_writeback_smoke',
    created_at: now,
    updated_at: now,
  };
  await platformQuery('time_entries', {
    action: 'insert',
    values: row,
    columns: '*',
    returning: true,
  });
  cleanup.push(() => platformDelete('time_entries', [
    { op: 'eq', column: 'id', value: timeEntryId },
  ]));

  const stored = await platformSelectOne('time_entries', {
    columns: '*',
    filters: [{ op: 'eq', column: 'id', value: timeEntryId }],
  });
  assert.equal(Number(stored?.id), timeEntryId);
  assert.equal(stored?.employee_name, 'RO_SMOKE');
  assert.equal(Number(stored?.hours), 0.5);
  assert.match(String(stored?.task_description || ''), new RegExp(marker));
  return {
    id: stored.id,
    date: stored.date,
    hours: Number(stored.hours),
  };
}

async function cleanupRows() {
  const failures = [];
  for (const remove of cleanup.reverse()) {
    try {
      await remove();
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }
  if (failures.length) throw new Error(`Yandex write-back cleanup failed: ${failures.join('; ')}`);
}

async function run() {
  assert.ok(process.env.OPS_BOT_TOKEN, 'OPS_BOT_TOKEN is required');
  const health = await verifyHealth();
  let settings;
  let timeEntry;
  let failure = null;
  try {
    settings = await verifySettingsWrite();
    timeEntry = await verifyTimeEntryWrite();
  } catch (error) {
    failure = error;
  }

  try {
    await cleanupRows();
  } catch (cleanupError) {
    if (!failure) failure = cleanupError;
    else failure.message += `; ${cleanupError.message}`;
  }
  if (failure) throw failure;

  const report = {
    ok: true,
    marker,
    api: process.env.OPS_API_URL || 'https://api.recycleobject.ru',
    health,
    settings,
    timeEntry,
    cleanup: 'verified',
  };
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  fs.writeFileSync(path.join(outputDir, 'failure.txt'), `${error?.stack || error}\n`);
  console.error(error);
  process.exit(1);
});
