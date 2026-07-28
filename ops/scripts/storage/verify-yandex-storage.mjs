#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function requireArgument(index) {
  const value = process.argv[index];
  if (!value) {
    throw new Error(
      'Usage: verify-yandex-storage.mjs <migration-manifest.json> <download-root>',
    );
  }
  return path.resolve(value);
}

function safePath(root, key) {
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes download root: ${key}`);
  }
  return resolved;
}

async function sha256(file) {
  const content = await fs.readFile(file);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function listFiles(root, directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, current)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, current).split(path.sep).join('/'));
    }
  }
  return files;
}

const manifestFile = requireArgument(2);
const downloadRoot = requireArgument(3);
const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
let totalBytes = 0;

for (const object of manifest.objects) {
  const file = safePath(downloadRoot, object.key);
  const stats = await fs.stat(file);
  if (!stats.isFile() || stats.size !== object.size) {
    throw new Error(
      `Downloaded size mismatch for ${object.key}: expected ${object.size}, got ${stats.size}`,
    );
  }
  const actualSha256 = await sha256(file);
  if (actualSha256 !== object.sha256) {
    throw new Error(`Downloaded checksum mismatch for ${object.key}`);
  }
  totalBytes += stats.size;
}

if (manifest.objectCount !== manifest.objects.length || manifest.totalBytes !== totalBytes) {
  throw new Error('Downloaded storage totals do not match the migration manifest');
}

const expectedKeys = manifest.objects.map((object) => object.key).sort();
const downloadedKeys = (await listFiles(downloadRoot)).sort();
if (
  expectedKeys.length !== downloadedKeys.length ||
  expectedKeys.some((key, index) => key !== downloadedKeys[index])
) {
  throw new Error('Downloaded storage keys do not exactly match the migration manifest');
}

console.log(JSON.stringify({ verified: true, objectCount: manifest.objectCount, totalBytes }));
