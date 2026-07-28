// Point every preserved Supabase Storage URL at the Yandex media API after the
// corresponding bytes have passed checksum verification in Object Storage.
//
// Required environment:
//   DATABASE_URL

import pg from 'pg';

const { Pool } = pg;
const API_BASE = String(process.env.PLATFORM_API_URL || 'https://api.recycleobject.ru').replace(/\/$/, '');
const STORAGE_URL = /https?:\/\/[^/\s"'<>]+\/storage\/v1\/object\/(?:public|sign)\/([^/\s"'<>]+)\/([^\s"'<>?]+)(?:\?[^\s"'<>]*)?/gi;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function rewriteJson(value) {
  const raw = JSON.stringify(value);
  let replacements = 0;
  const rewritten = raw.replace(STORAGE_URL, (match, bucket, objectPath) => {
    replacements += 1;
    const safeBucket = encodeURIComponent(decodeURIComponent(bucket));
    return `${API_BASE}/api/storage/public/${safeBucket}/${objectPath}`;
  });
  return {
    value: replacements ? JSON.parse(rewritten) : value,
    replacements,
  };
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
