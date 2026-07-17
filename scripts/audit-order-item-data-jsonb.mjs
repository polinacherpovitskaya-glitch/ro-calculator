#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PAGE_SIZE = 1000;

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function extractRuntimeConfig(rootDir) {
  const sourcePath = path.join(rootDir, 'js', 'supabase.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const url = source.match(/const SUPABASE_URL = '([^']+)'/);
  const anonKey = source.match(/const SUPABASE_ANON_KEY = '([^']+)'/);
  return {
    url: process.env.SUPABASE_URL || url?.[1] || '',
    anonKey: process.env.SUPABASE_ANON_KEY || anonKey?.[1] || '',
  };
}

export function classifyItemData(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return 'object';
  if (typeof value !== 'string' || !value.trim()) return 'missing';

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return 'objectText';
    if (typeof parsed === 'string') {
      try {
        const decoded = JSON.parse(parsed);
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) return 'doubleEncodedObject';
      } catch (_) { /* report below */ }
    }
    return 'arrayOrScalar';
  } catch (_) {
    return 'invalid';
  }
}

export function buildItemDataReport(rows = []) {
  const counts = {
    object: 0,
    objectText: 0,
    doubleEncodedObject: 0,
    arrayOrScalar: 0,
    missing: 0,
    invalid: 0,
  };
  const unsafeSamples = [];

  for (const row of rows || []) {
    const kind = classifyItemData(row?.item_data);
    counts[kind] += 1;
    if (!['object', 'objectText'].includes(kind) && unsafeSamples.length < 20) {
      unsafeSamples.push({ id: row?.id ?? null, order_id: row?.order_id ?? null, kind });
    }
  }

  const unsafeRows = counts.doubleEncodedObject + counts.arrayOrScalar + counts.missing + counts.invalid;
  return {
    schemaVersion: 1,
    totalRows: (rows || []).length,
    counts,
    unsafeRows,
    safe: unsafeRows === 0 && (rows || []).length > 0,
    unsafeSamples,
  };
}

async function fetchOrderItems(url, anonKey) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/order_items?select=id,order_id,item_data&order=id.asc`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        range: `${offset}-${offset + PAGE_SIZE - 1}`,
        'range-unit': 'items',
      },
    });
    if (!response.ok) throw new Error(`order_items request failed: HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('order_items response is not an array');
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const inputPath = readFlag(argv, '--input');
  const outputPath = readFlag(argv, '--out');
  let rows;
  let source;

  if (inputPath) {
    const loaded = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
    rows = Array.isArray(loaded) ? loaded : loaded.rows;
    if (!Array.isArray(rows)) throw new Error('--input must contain an array or { rows: [] }');
    source = 'file';
  } else {
    const { url, anonKey } = extractRuntimeConfig(process.cwd());
    if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
    rows = await fetchOrderItems(url, anonKey);
    source = new URL(url).host;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source,
    ...buildItemDataReport(rows),
  };
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, rendered);
  }
  process.stdout.write(rendered);
  if (!report.safe) process.exitCode = 1;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    console.error(`order_items JSONB preflight failed: ${error.message}`);
    process.exitCode = 1;
  });
}
