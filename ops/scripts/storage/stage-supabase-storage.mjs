#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function requireArgument(name, index) {
  const value = process.argv[index];
  if (!value) {
    throw new Error(`Usage: stage-supabase-storage.mjs <manifest.ndjson> <source-root> <target-root>`);
  }
  return path.resolve(value);
}

function safePath(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes storage root: ${parts.join('/')}`);
  }
  return resolved;
}

async function sha256(file) {
  const content = await fs.readFile(file);
  return crypto.createHash('sha256').update(content).digest('hex');
}

const manifestFile = requireArgument('manifest', 2);
const sourceRoot = requireArgument('source-root', 3);
const targetRoot = requireArgument('target-root', 4);
const lines = (await fs.readFile(manifestFile, 'utf8'))
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const staged = [];
const seenKeys = new Set();

for (const line of lines) {
  const object = JSON.parse(line);
  const bucket = String(object.bucket || '');
  const name = String(object.name || '');
  const version = String(object.version || '');
  const expectedSize = Number(object.size);

  if (!bucket || !name || !version || !Number.isSafeInteger(expectedSize) || expectedSize < 0) {
    throw new Error(`Invalid storage manifest row: ${line}`);
  }

  const key = `${bucket}/${name}`;
  if (seenKeys.has(key)) {
    throw new Error(`Duplicate storage object key: ${key}`);
  }
  seenKeys.add(key);

  const source = safePath(sourceRoot, 'stub', 'stub', bucket, name, version);
  const target = safePath(targetRoot, bucket, name);
  const stats = await fs.stat(source);
  if (!stats.isFile() || stats.size !== expectedSize) {
    throw new Error(`Storage size mismatch for ${key}: expected ${expectedSize}, got ${stats.size}`);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  staged.push({
    key,
    size: stats.size,
    sha256: await sha256(target),
    contentType: object.mimetype || 'application/octet-stream',
  });
}

staged.sort((left, right) => left.key.localeCompare(right.key));
await fs.writeFile(
  path.join(targetRoot, 'migration-manifest.json'),
  `${JSON.stringify(
    {
      objectCount: staged.length,
      totalBytes: staged.reduce((total, object) => total + object.size, 0),
      objects: staged,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify({
    objectCount: staged.length,
    totalBytes: staged.reduce((total, object) => total + object.size, 0),
  }),
);
