import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const [key, ...parts] = raw.slice(2).split('=');
    args[key] = parts.length > 0 ? parts.join('=') : '1';
  }
  return args;
}

function loadEnvFile(filePath) {
  const values = {};
  if (!filePath) return values;
  const source = fs.readFileSync(path.resolve(filePath), 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role || '';
  } catch {
    return '';
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

function stableRows(rows) {
  return rows
    .map((row) => stableJson(row))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function ensurePrivateDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(dirPath, 0o700);
}

function containedPath(root, relativePath) {
  const normalizedRoot = path.resolve(root);
  const absolutePath = path.resolve(normalizedRoot, relativePath);
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside export root: ${relativePath}`);
  }
  return absolutePath;
}

function safePathSegment(value) {
  const encoded = encodeURIComponent(String(value));
  if (encoded === '.') return '%2E';
  if (encoded === '..') return '%2E%2E';
  return encoded || '%00';
}

function storageRelativePath(bucketName, objectName) {
  const objectSegments = String(objectName).split('/').map(safePathSegment);
  return path.posix.join('storage', safePathSegment(bucketName), ...objectSegments);
}

function writeFileWithHash(root, relativePath, content, records) {
  const absolutePath = containedPath(root, relativePath);
  ensurePrivateDir(path.dirname(absolutePath));
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  fs.writeFileSync(absolutePath, buffer, { mode: 0o600 });
  fs.chmodSync(absolutePath, 0o600);
  const record = { path: relativePath, bytes: buffer.length, sha256: sha256(buffer) };
  records.push(record);
  return record;
}

function encodeObjectPath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

async function exportProject({ baseUrl, serviceRoleKey, outDir, fetchImpl = fetch }) {
  const normalizedUrl = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(normalizedUrl)) throw new Error('A valid Supabase URL is required');
  if (jwtRole(serviceRoleKey) !== 'service_role') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY with role=service_role is required');
  }
  const projectRef = new URL(normalizedUrl).hostname.split('.')[0];
  const outputRoot = path.resolve(outDir);
  ensurePrivateDir(outputRoot);
  const fileRecords = [];
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };

  async function request(pathname, options = {}) {
    const response = await fetchImpl(`${normalizedUrl}${pathname}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${options.method || 'GET'} ${pathname} failed: HTTP ${response.status} ${body.slice(0, 300)}`);
    }
    return response;
  }

  const openApiResponse = await request('/rest/v1/', {
    headers: { accept: 'application/openapi+json' },
  });
  const openApi = await openApiResponse.json();
  writeFileWithHash(outputRoot, 'schema/openapi.json', `${JSON.stringify(stableJson(openApi), null, 2)}\n`, fileRecords);
  const tableNames = Object.keys(openApi.definitions || {}).sort();
  if (tableNames.length === 0) throw new Error('Supabase OpenAPI schema did not expose any tables');

  const tables = [];
  for (const tableName of tableNames) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const response = await request(`/rest/v1/${encodeURIComponent(tableName)}?select=*`, {
        headers: { range: `${offset}-${offset + 999}`, 'range-unit': 'items' },
      });
      const chunk = await response.json();
      if (!Array.isArray(chunk)) throw new Error(`${tableName}: expected an array response`);
      rows.push(...chunk);
      if (chunk.length < 1000) break;
    }
    const canonicalRows = stableRows(rows);
    const record = writeFileWithHash(
      outputRoot,
      `tables/${tableName}.json`,
      `${JSON.stringify(canonicalRows, null, 2)}\n`,
      fileRecords,
    );
    tables.push({ name: tableName, rowCount: canonicalRows.length, ...record });
    console.log(`table ${tableName}: ${canonicalRows.length}`);
  }

  const authUsers = [];
  for (let page = 1; ; page += 1) {
    const response = await request(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const payload = await response.json();
    const users = Array.isArray(payload.users) ? payload.users : [];
    authUsers.push(...users);
    if (users.length < 1000) break;
  }
  const canonicalUsers = stableRows(authUsers);
  const authRecord = writeFileWithHash(
    outputRoot,
    'auth/users.json',
    `${JSON.stringify(canonicalUsers, null, 2)}\n`,
    fileRecords,
  );
  console.log(`auth users: ${canonicalUsers.length}`);

  const bucketResponse = await request('/storage/v1/bucket');
  const buckets = await bucketResponse.json();
  if (!Array.isArray(buckets)) throw new Error('Storage bucket API did not return an array');
  const storage = [];

  async function listFolder(bucketName, prefix = '') {
    const objects = [];
    for (let offset = 0; ; offset += 1000) {
      const response = await request(`/storage/v1/object/list/${encodeURIComponent(bucketName)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error(`${bucketName}/${prefix}: storage list must be an array`);
      for (const entry of entries) {
        const name = String(entry.name || '');
        if (!name) continue;
        const fullName = prefix ? `${prefix}/${name}` : name;
        if (!entry.id && !entry.metadata) {
          objects.push(...await listFolder(bucketName, fullName));
        } else {
          objects.push(fullName);
        }
      }
      if (entries.length < 1000) break;
    }
    return objects;
  }

  for (const bucket of [...buckets].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const bucketName = String(bucket.name || bucket.id || '');
    if (!bucketName) continue;
    const objectNames = [...new Set(await listFolder(bucketName))].sort();
    const objectRecords = [];
    for (const objectName of objectNames) {
      const response = await request(
        `/storage/v1/object/authenticated/${encodeURIComponent(bucketName)}/${encodeObjectPath(objectName)}`,
      );
      const buffer = Buffer.from(await response.arrayBuffer());
      const record = writeFileWithHash(
        outputRoot,
        storageRelativePath(bucketName, objectName),
        buffer,
        fileRecords,
      );
      objectRecords.push({ name: objectName, ...record });
    }
    storage.push({
      name: bucketName,
      public: Boolean(bucket.public),
      objectCount: objectRecords.length,
      totalBytes: objectRecords.reduce((sum, item) => sum + item.bytes, 0),
      objects: objectRecords,
    });
    console.log(`bucket ${bucketName}: ${objectRecords.length} objects`);
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    exportKind: 'supabase-application-logical-export',
    projectRef,
    sourceHost: new URL(normalizedUrl).hostname,
    warnings: [
      'This export preserves exposed table rows, Auth users and Storage bytes.',
      'Database roles, extensions, triggers, functions, RLS policies and unexposed schemas still require a pg_dump.',
    ],
    tables,
    auth: { userCount: canonicalUsers.length, ...authRecord },
    storage,
    summary: {
      tableCount: tables.length,
      rowCount: tables.reduce((sum, table) => sum + table.rowCount, 0),
      authUserCount: canonicalUsers.length,
      bucketCount: storage.length,
      objectCount: storage.reduce((sum, bucket) => sum + bucket.objectCount, 0),
      objectBytes: storage.reduce((sum, bucket) => sum + bucket.totalBytes, 0),
    },
  };
  const manifestRecord = writeFileWithHash(
    outputRoot,
    'manifest.json',
    `${JSON.stringify(manifest, null, 2)}\n`,
    fileRecords,
  );
  const checksumLines = fileRecords
    .filter((record) => record.path !== 'SHA256SUMS')
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((record) => `${record.sha256}  ${record.path}`)
    .join('\n');
  fs.writeFileSync(path.join(outputRoot, 'SHA256SUMS'), `${checksumLines}\n`, { mode: 0o600 });
  fs.chmodSync(path.join(outputRoot, 'SHA256SUMS'), 0o600);
  return { outputRoot, manifest, manifestRecord };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const fileEnv = loadEnvFile(args['env-file']);
  const urlEnvName = args['url-env'] || 'SUPABASE_URL';
  const keyEnvName = args['key-env'] || 'SUPABASE_SERVICE_ROLE_KEY';
  const baseUrl = process.env[urlEnvName] || fileEnv[urlEnvName];
  const serviceRoleKey = process.env[keyEnvName] || fileEnv[keyEnvName];
  const outDir = args['out-dir'] || process.env.PRESERVATION_OUT_DIR;
  if (!outDir) throw new Error('--out-dir is required');
  const result = await exportProject({ baseUrl, serviceRoleKey, outDir });
  console.log(JSON.stringify({ output: result.outputRoot, summary: result.manifest.summary }, null, 2));
}

export { containedPath, exportProject, loadEnvFile, stableRows, storageRelativePath };

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
