#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const phase = String(process.argv[2] || '').trim();
const sourceUrl = String(process.env.SOURCE_SUPABASE_URL || '').replace(/\/+$/, '');
const targetUrl = String(process.env.TARGET_SUPABASE_URL || '').replace(/\/+$/, '');
const workDir = path.resolve(process.env.RO_CUTOVER_DIR || 'output/supabase-cutover');
const pageSize = Math.max(1, Math.min(1000, Number(process.env.RO_CUTOVER_PAGE_SIZE || 1000)));

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readSecret(fileEnv, valueEnv) {
  const file = process.env[fileEnv];
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return String(process.env[valueEnv] || '').trim();
}

const sourceKey = readSecret('SOURCE_SERVICE_KEY_FILE', 'SOURCE_SERVICE_KEY');
const targetKey = readSecret('TARGET_SERVICE_KEY_FILE', 'TARGET_SERVICE_KEY');

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
  );
}

function canonicalRows(rows) {
  return rows
    .map(row => JSON.stringify(canonicalize(row)))
    .sort()
    .join('\n');
}

function hashRows(rows) {
  return crypto.createHash('sha256').update(canonicalRows(rows)).digest('hex');
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function apiHeaders(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function apiRequest(baseUrl, key, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: apiHeaders(key, options.headers || {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method || 'GET'} ${pathname}: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return response;
}

async function loadDefinitions(baseUrl, key) {
  const response = await apiRequest(baseUrl, key, '/rest/v1/');
  const openApi = await response.json();
  return openApi.definitions || {};
}

async function fetchAllRows(baseUrl, key, table, orderColumn = '') {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const order = orderColumn ? `&order=${encodeURIComponent(orderColumn)}.asc` : '';
    const response = await apiRequest(
      baseUrl,
      key,
      `/rest/v1/${encodeURIComponent(table)}?select=*${order}`,
      { headers: { range: `${offset}-${offset + pageSize - 1}`, 'range-unit': 'items' } },
    );
    const chunk = await response.json();
    if (!Array.isArray(chunk)) throw new Error(`${table}: expected an array`);
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function encodeObjectPath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

async function listBuckets(baseUrl, key) {
  const response = await apiRequest(baseUrl, key, '/storage/v1/bucket');
  const buckets = await response.json();
  return Array.isArray(buckets) ? buckets : [];
}

async function listObjectsAtPrefix(baseUrl, key, bucketId, prefix = '') {
  const objects = [];
  for (let offset = 0; ; offset += pageSize) {
    const response = await apiRequest(
      baseUrl,
      key,
      `/storage/v1/object/list/${encodeURIComponent(bucketId)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prefix,
          limit: pageSize,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      },
    );
    const chunk = await response.json();
    if (!Array.isArray(chunk)) throw new Error(`${bucketId}/${prefix}: expected an array`);
    objects.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return objects;
}

async function listObjects(baseUrl, key, bucketId) {
  const files = [];
  const pending = [''];
  const visited = new Set();
  while (pending.length) {
    const prefix = pending.pop();
    if (visited.has(prefix)) continue;
    visited.add(prefix);
    const entries = await listObjectsAtPrefix(baseUrl, key, bucketId, prefix);
    for (const entry of entries) {
      const objectPath = `${prefix}${entry.name}`;
      const isFolder = !entry.id && !entry.metadata;
      if (isFolder) pending.push(`${objectPath}/`);
      else files.push({ ...entry, name: objectPath });
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function downloadObject(baseUrl, key, bucketId, objectName) {
  const response = await apiRequest(
    baseUrl,
    key,
    `/storage/v1/object/${encodeURIComponent(bucketId)}/${encodeObjectPath(objectName)}`,
  );
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

async function exportSnapshot() {
  requireValue(sourceUrl, 'SOURCE_SUPABASE_URL');
  requireValue(sourceKey, 'SOURCE_SERVICE_KEY or SOURCE_SERVICE_KEY_FILE');
  const tablesOnly = process.env.RO_CUTOVER_TABLES_ONLY === '1';
  const tableDir = path.join(workDir, 'tables');
  const objectDir = path.join(workDir, 'storage');
  fs.mkdirSync(tableDir, { recursive: true, mode: 0o700 });
  if (!tablesOnly) fs.mkdirSync(objectDir, { recursive: true, mode: 0o700 });

  const definitions = await loadDefinitions(sourceUrl, sourceKey);
  const tableNames = Object.keys(definitions).sort();
  const previousManifestPath = path.join(workDir, 'manifest.json');
  const previousManifest = tablesOnly && fs.existsSync(previousManifestPath)
    ? JSON.parse(fs.readFileSync(previousManifestPath, 'utf8'))
    : null;
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceHost: new URL(sourceUrl).host,
    tables: {},
    storage: previousManifest?.storage || { buckets: {} },
  };

  for (const table of tableNames) {
    process.stdout.write(`table ${table}... `);
    const orderColumn = definitions[table]?.properties?.id ? 'id' : '';
    const rows = await fetchAllRows(sourceUrl, sourceKey, table, orderColumn);
    const canonical = rows.sort((a, b) => (
      JSON.stringify(canonicalize(a)).localeCompare(JSON.stringify(canonicalize(b)))
    ));
    const filename = `${table}.json`;
    fs.writeFileSync(path.join(tableDir, filename), `${JSON.stringify(canonical)}\n`, { mode: 0o600 });
    manifest.tables[table] = {
      count: canonical.length,
      sha256: hashRows(canonical),
      columns: Object.keys(definitions[table]?.properties || {}).sort(),
      file: `tables/${filename}`,
    };
    process.stdout.write(`${canonical.length}\n`);
  }

  if (!tablesOnly) {
    const buckets = await listBuckets(sourceUrl, sourceKey);
    for (const bucket of buckets.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const bucketId = String(bucket.id);
      const entries = await listObjects(sourceUrl, sourceKey, bucketId);
      const bucketManifest = {
        id: bucketId,
        name: bucket.name || bucketId,
        public: Boolean(bucket.public),
        fileSizeLimit: bucket.file_size_limit ?? null,
        allowedMimeTypes: bucket.allowed_mime_types ?? null,
        objects: {},
      };
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        process.stdout.write(`storage ${bucketId} ${index + 1}/${entries.length} ${entry.name}\n`);
        const downloaded = await downloadObject(sourceUrl, sourceKey, bucketId, entry.name);
        const relative = path.join('storage', bucketId, ...entry.name.split('/'));
        const destination = path.join(workDir, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
        fs.writeFileSync(destination, downloaded.bytes, { mode: 0o600 });
        bucketManifest.objects[entry.name] = {
          size: downloaded.bytes.length,
          sha256: hashBuffer(downloaded.bytes),
          contentType: downloaded.contentType,
          file: relative,
        };
      }
      manifest.storage.buckets[bucketId] = bucketManifest;
    }
  }

  manifest.summary = {
    tables: tableNames.length,
    rows: Object.values(manifest.tables).reduce((sum, table) => sum + table.count, 0),
    buckets: Object.keys(manifest.storage.buckets).length,
    objects: Object.values(manifest.storage.buckets)
      .reduce((sum, bucket) => sum + Object.keys(bucket.objects).length, 0),
  };
  fs.writeFileSync(
    path.join(workDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(JSON.stringify(manifest.summary));
}

function buildSql() {
  const manifestPath = path.join(workDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tableNames = Object.keys(manifest.tables).sort();
  const statements = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    "SET LOCAL lock_timeout = '15s';",
    'SET LOCAL session_replication_role = replica;',
    `TRUNCATE ${tableNames.map(table => `public.${quoteIdentifier(table)}`).join(', ')} RESTART IDENTITY CASCADE;`,
  ];

  for (const table of tableNames) {
    const entry = manifest.tables[table];
    if (!entry.count) continue;
    const rows = fs.readFileSync(path.join(workDir, entry.file), 'utf8').trim();
    const columns = entry.columns;
    const columnList = columns.map(quoteIdentifier).join(', ');
    const tag = `ro_${crypto.createHash('sha256').update(table).digest('hex').slice(0, 12)}`;
    if (rows.includes(`$${tag}$`)) throw new Error(`${table}: unsafe SQL dollar tag collision`);
    statements.push(
      `INSERT INTO public.${quoteIdentifier(table)} (${columnList}) OVERRIDING SYSTEM VALUE`,
      `SELECT ${columnList}`,
      `FROM jsonb_populate_recordset(NULL::public.${quoteIdentifier(table)}, $${tag}$${rows}$${tag}$::jsonb);`,
    );
  }

  statements.push(
    'SET LOCAL session_replication_role = origin;',
    `DO $ro_sequences$
DECLARE item record;
DECLARE max_value bigint;
BEGIN
  FOR item IN
    SELECT table_schema, table_name, column_name,
           pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS sequence_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  LOOP
    IF item.sequence_name IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', item.column_name, item.table_schema, item.table_name)
        INTO max_value;
      PERFORM setval(item.sequence_name, GREATEST(max_value, 1), max_value > 0);
    END IF;
  END LOOP;
END
$ro_sequences$;`,
    'COMMIT;',
  );

  const output = path.join(workDir, 'restore-public.sql');
  fs.writeFileSync(output, `${statements.join('\n')}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ output, tables: tableNames.length }));
}

async function createBucketIfMissing(bucket) {
  const buckets = await listBuckets(targetUrl, targetKey);
  if (buckets.some(candidate => String(candidate.id) === bucket.id)) return;
  await apiRequest(targetUrl, targetKey, '/storage/v1/bucket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      file_size_limit: bucket.fileSizeLimit,
      allowed_mime_types: bucket.allowedMimeTypes,
    }),
  });
}

async function removeObjects(bucketId, objectNames) {
  for (let index = 0; index < objectNames.length; index += 100) {
    const prefixes = objectNames.slice(index, index + 100);
    await apiRequest(targetUrl, targetKey, `/storage/v1/object/${encodeURIComponent(bucketId)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes }),
    });
  }
}

async function syncStorage() {
  requireValue(targetUrl, 'TARGET_SUPABASE_URL');
  requireValue(targetKey, 'TARGET_SERVICE_KEY or TARGET_SERVICE_KEY_FILE');
  const manifest = JSON.parse(fs.readFileSync(path.join(workDir, 'manifest.json'), 'utf8'));
  for (const bucket of Object.values(manifest.storage.buckets)) {
    await createBucketIfMissing(bucket);
    const sourceNames = Object.keys(bucket.objects).sort();
    const targetNames = (await listObjects(targetUrl, targetKey, bucket.id)).map(object => object.name);
    const stale = targetNames.filter(name => !bucket.objects[name]);
    if (stale.length && process.env.RO_ALLOW_STORAGE_DELETE !== '1') {
      throw new Error(`${bucket.id}: ${stale.length} stale target objects; set RO_ALLOW_STORAGE_DELETE=1`);
    }
    if (stale.length) {
      process.stdout.write(`storage ${bucket.id}: deleting ${stale.length} stale objects\n`);
      await removeObjects(bucket.id, stale);
    }
    for (let index = 0; index < sourceNames.length; index += 1) {
      const objectName = sourceNames[index];
      const object = bucket.objects[objectName];
      process.stdout.write(`storage ${bucket.id} ${index + 1}/${sourceNames.length} ${objectName}\n`);
      const bytes = fs.readFileSync(path.join(workDir, object.file));
      await apiRequest(
        targetUrl,
        targetKey,
        `/storage/v1/object/${encodeURIComponent(bucket.id)}/${encodeObjectPath(objectName)}`,
        {
          method: 'POST',
          headers: { 'content-type': object.contentType, 'x-upsert': 'true' },
          body: bytes,
        },
      );
    }
  }
}

async function verify() {
  requireValue(targetUrl, 'TARGET_SUPABASE_URL');
  requireValue(targetKey, 'TARGET_SERVICE_KEY or TARGET_SERVICE_KEY_FILE');
  const manifest = JSON.parse(fs.readFileSync(path.join(workDir, 'manifest.json'), 'utf8'));
  const targetDefinitions = await loadDefinitions(targetUrl, targetKey);
  const tableMismatches = [];
  for (const [table, expected] of Object.entries(manifest.tables)) {
    process.stdout.write(`verify table ${table}... `);
    const orderColumn = targetDefinitions[table]?.properties?.id ? 'id' : '';
    const rows = await fetchAllRows(targetUrl, targetKey, table, orderColumn);
    const actual = { count: rows.length, sha256: hashRows(rows) };
    if (actual.count !== expected.count || actual.sha256 !== expected.sha256) {
      tableMismatches.push({ table, expected: { count: expected.count, sha256: expected.sha256 }, actual });
      process.stdout.write('MISMATCH\n');
    } else {
      process.stdout.write(`${actual.count}\n`);
    }
  }

  const storageMismatches = [];
  for (const bucket of Object.values(manifest.storage.buckets)) {
    const targetObjects = await listObjects(targetUrl, targetKey, bucket.id);
    const targetMap = new Map(targetObjects.map(object => [object.name, object]));
    const expectedObjects = Object.entries(bucket.objects);
    let verifiedObjects = 0;
    await mapWithConcurrency(expectedObjects, 8, async ([objectName, expected]) => {
      const actual = targetMap.get(objectName);
      if (!actual) {
        storageMismatches.push({ bucket: bucket.id, object: objectName, error: 'missing' });
        return;
      }
      const downloaded = await downloadObject(targetUrl, targetKey, bucket.id, objectName);
      const actualHash = hashBuffer(downloaded.bytes);
      if (downloaded.bytes.length !== expected.size || actualHash !== expected.sha256) {
        storageMismatches.push({
          bucket: bucket.id,
          object: objectName,
          expected: { size: expected.size, sha256: expected.sha256 },
          actual: { size: downloaded.bytes.length, sha256: actualHash },
        });
      }
      verifiedObjects += 1;
      if (verifiedObjects % 25 === 0 || verifiedObjects === expectedObjects.length) {
        process.stdout.write(`verify storage ${bucket.id} ${verifiedObjects}/${expectedObjects.length}\n`);
      }
    });
    for (const objectName of targetMap.keys()) {
      if (!bucket.objects[objectName]) {
        storageMismatches.push({ bucket: bucket.id, object: objectName, error: 'extra' });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tableMismatches,
    storageMismatches,
    ok: tableMismatches.length === 0 && storageMismatches.length === 0,
  };
  fs.writeFileSync(
    path.join(workDir, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(JSON.stringify({
    ok: report.ok,
    tableMismatches: tableMismatches.length,
    storageMismatches: storageMismatches.length,
  }));
  if (!report.ok) process.exitCode = 2;
}

async function mapWithConcurrency(items, concurrency, handler) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await handler(items[index], index);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  ));
}

const handlers = {
  export: exportSnapshot,
  'build-sql': buildSql,
  'sync-storage': syncStorage,
  verify,
};

if (!handlers[phase]) {
  console.error('Usage: node scripts/sync-supabase-cutover.mjs <export|build-sql|sync-storage|verify>');
  process.exitCode = 1;
} else {
  await handlers[phase]();
}
