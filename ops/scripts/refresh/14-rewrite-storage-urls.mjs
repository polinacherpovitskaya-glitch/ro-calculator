// Point every preserved Supabase Storage URL at the Yandex media API after the
// corresponding bytes have passed checksum verification in Object Storage.
//
// Required environment:
//   DATABASE_URL

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = String(process.env.PLATFORM_API_URL || 'https://api.recycleobject.ru').replace(/\/$/, '');
const STORAGE_URL = /https?:\/\/[^/\s"'<>]+\/storage\/v1\/object\/(?:public|sign)\/([^/\s"'<>]+)\/([^\s"'<>?]+)(?:\?[^\s"'<>]*)?/gi;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function rewriteText(value) {
  let replacements = 0;
  const rewritten = value.replace(STORAGE_URL, (match, bucket, objectPath) => {
    replacements += 1;
    let decodedBucket = bucket;
    try {
      decodedBucket = decodeURIComponent(bucket);
    } catch {
      // Keep malformed historical bucket text encoded instead of aborting the
      // whole migration.
    }
    const safeBucket = encodeURIComponent(decodedBucket);
    return `${API_BASE}/api/storage/public/${safeBucket}/${objectPath}`;
  });
  return { value: rewritten, replacements };
}

export function rewriteJson(value) {
  if (Array.isArray(value)) {
    let replacements = 0;
    const rewritten = value.map((entry) => {
      const result = rewriteJson(entry);
      replacements += result.replacements;
      return result.value;
    });
    return { value: replacements ? rewritten : value, replacements };
  }

  if (value && typeof value === 'object') {
    let replacements = 0;
    const rewritten = {};
    for (const [key, entry] of Object.entries(value)) {
      const result = rewriteJson(entry);
      replacements += result.replacements;
      rewritten[key] = result.value;
    }
    return { value: replacements ? rewritten : value, replacements };
  }

  if (typeof value !== 'string') return { value, replacements: 0 };

  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      const nested = rewriteJson(parsed);
      if (nested.replacements) {
        return {
          value: JSON.stringify(nested.value),
          replacements: nested.replacements,
        };
      }
    } catch {
      // It is an ordinary string that merely starts with a brace.
    }
  }

  return rewriteText(value);
}

async function main() {
  const { default: pg } = await import('pg');
  const { Pool } = pg;
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

  try {
    await pool.query('BEGIN');
    await rewriteTable(pool, 'compat_rows');
    await rewriteTable(pool, 'legacy_supabase_rows');
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  await main();
}

async function rewriteTable(pool, table) {
  const { rows } = await pool.query(
    `SELECT table_name, source_id, data
       FROM ${table}
      ORDER BY table_name, source_id`,
  );
  let changedRows = 0;
  let replacements = 0;
  for (const row of rows) {
    const rewritten = rewriteJson(row.data);
    if (!rewritten.replacements) continue;
    await pool.query(
      `UPDATE ${table}
          SET data = $1
        WHERE table_name = $2
          AND source_id = $3`,
      [rewritten.value, row.table_name, row.source_id],
    );
    changedRows += 1;
    replacements += rewritten.replacements;
  }
  console.log(`${table}: changed_rows=${changedRows} rewritten_urls=${replacements}`);
}
