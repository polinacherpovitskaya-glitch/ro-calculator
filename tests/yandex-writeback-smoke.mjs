import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'yandex-writeback-smoke');
fs.mkdirSync(outputDir, { recursive: true });

const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');

function extractConst(name) {
  const match = supabaseSource.match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`));
  return match ? match[1] : '';
}

const supabaseUrl = (process.env.SUPABASE_URL || extractConst('SUPABASE_URL')).replace(/\/+$/, '');
const proxyUrl = (process.env.RO_YANDEX_PROXY_URL || extractConst('YANDEX_SUPABASE_PROXY_URL')).replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || extractConst('SUPABASE_ANON_KEY');
const smokeKey = process.env.RO_YANDEX_WRITEBACK_KEY || 'ro_yandex_writeback_smoke_json';
const marker = [
  'yandex-writeback',
  process.env.GITHUB_RUN_ID || 'local',
  Date.now(),
  Math.random().toString(36).slice(2),
].join('-');
const now = new Date().toISOString();
const smokeValue = {
  ok: true,
  source: 'yandex-writeback-smoke',
  marker,
  written_at: now,
};

function assertConfigured() {
  assert.ok(supabaseUrl, 'SUPABASE_URL is required');
  assert.ok(proxyUrl, 'RO_YANDEX_PROXY_URL / YANDEX_SUPABASE_PROXY_URL is required');
  assert.ok(anonKey, 'SUPABASE_ANON_KEY is required');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`Expected JSON from ${url}, got HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
  }
  return { response, json, text };
}

function authHeaders(extra = {}) {
  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    ...extra,
  };
}

function parseStoredValue(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function writeViaYandexProxy() {
  const row = {
    key: smokeKey,
    value: JSON.stringify(smokeValue),
    updated_at: now,
  };
  const { response, json, text } = await fetchJson(`${proxyUrl}/rest/v1/settings?on_conflict=key`, {
    method: 'POST',
    headers: authHeaders({
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
      origin: 'https://calc2.recycleobject.ru',
    }),
    body: JSON.stringify([row]),
  });
  assert.ok(
    response.ok,
    `Yandex proxy write failed with HTTP ${response.status}: ${text.slice(0, 500)}`,
  );
  assert.ok(Array.isArray(json) && json.length === 1, `Expected one written row from proxy, got ${JSON.stringify(json)}`);
  assert.equal(json[0].key, smokeKey);
  assert.equal(parseStoredValue(json[0].value)?.marker, marker);
  return json[0];
}

async function readDirectFromSupabase() {
  const url = `${supabaseUrl}/rest/v1/settings?select=key,value,updated_at&key=eq.${encodeURIComponent(smokeKey)}&limit=1`;
  const { response, json, text } = await fetchJson(url, {
    headers: authHeaders({
      accept: 'application/json',
    }),
  });
  assert.ok(response.ok, `Direct Supabase read failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  assert.ok(Array.isArray(json) && json.length === 1, `Expected one direct Supabase row, got ${JSON.stringify(json)}`);
  assert.equal(json[0].key, smokeKey);
  assert.equal(parseStoredValue(json[0].value)?.marker, marker);
  return json[0];
}

async function readBackViaYandexProxy() {
  const url = `${proxyUrl}/rest/v1/settings?select=key,value,updated_at&key=eq.${encodeURIComponent(smokeKey)}&limit=1`;
  const { response, json, text } = await fetchJson(url, {
    headers: authHeaders({
      accept: 'application/json',
      origin: 'https://calc2.recycleobject.ru',
    }),
  });
  assert.ok(response.ok, `Yandex proxy readback failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  assert.ok(Array.isArray(json) && json.length === 1, `Expected one proxy readback row, got ${JSON.stringify(json)}`);
  assert.equal(parseStoredValue(json[0].value)?.marker, marker);
  return json[0];
}

async function main() {
  assertConfigured();
  const writtenViaProxy = await writeViaYandexProxy();
  const readViaSupabase = await readDirectFromSupabase();
  const readViaProxy = await readBackViaYandexProxy();

  const result = {
    ok: true,
    smokeKey,
    marker,
    proxyUrl,
    supabaseUrl,
    writtenViaProxy,
    readViaSupabase,
    readViaProxy,
  };
  fs.writeFileSync(path.join(outputDir, 'state.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    ok: true,
    smokeKey,
    marker,
    proxyHost: new URL(proxyUrl).host,
    supabaseHost: new URL(supabaseUrl).host,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
