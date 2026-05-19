// One-shot migration for legacy bug attachment bytes.
//
// Moves attachment files from legacy Supabase Storage/public data URLs into
// Selectel Object Storage and replaces bug_attachments.storage_key with the
// new S3 object key.
//
// Required environment:
//   DATABASE_URL
//   S3_ENDPOINT
//   S3_BUCKET
//   S3_ACCESS_KEY
//   S3_SECRET_KEY
//
// Required for supabase:// keys:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { uploadObject } from '../api/src/s3.js';

const { Pool } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'));
  }
  return supabase;
}

function safeFilename(filename) {
  return String(filename || 'attachment').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'attachment';
}

function decodeDataUrl(value) {
  const match = String(value).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('Invalid data URL');
  const mimeType = match[1] || 'application/octet-stream';
  const body = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]));
  return { body, mimeType };
}

async function downloadAttachment(row) {
  if (row.storage_key.startsWith('supabase://')) {
    const key = row.storage_key.replace('supabase://', '');
    const { data, error } = await getSupabase().storage.from('bug-attachments').download(key);
    if (error) throw error;
    return { body: Buffer.from(await data.arrayBuffer()), mimeType: data.type || row.mime_type || 'application/octet-stream' };
  }

  if (row.storage_key.startsWith('data:')) {
    return decodeDataUrl(row.storage_key);
  }

  if (row.storage_key.startsWith('data-url://work_assets/')) {
    const assetId = row.storage_key.replace('data-url://work_assets/', '');
    const { data, error } = await getSupabase()
      .from('work_assets')
      .select('data_url,file_type')
      .eq('id', assetId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.data_url) throw new Error(`work_assets ${assetId} has no data_url`);
    const decoded = decodeDataUrl(data.data_url);
    return { body: decoded.body, mimeType: data.file_type || decoded.mimeType };
  }

  if (/^https?:/.test(row.storage_key)) {
    const response = await fetch(row.storage_key);
    if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${row.storage_key}`);
    return {
      body: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || row.mime_type || 'application/octet-stream',
    };
  }

  return null;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, bug_id, filename, mime_type, storage_key
      FROM bug_attachments
      WHERE storage_key LIKE 'supabase://%'
         OR storage_key LIKE 'data-url://work_assets/%'
         OR storage_key LIKE 'data:%'
         OR storage_key LIKE 'http://%'
         OR storage_key LIKE 'https://%'
      ORDER BY id`
  );
  console.log(`Migrating ${rows.length} bug attachments`);

  for (const row of rows) {
    try {
      const downloaded = await downloadAttachment(row);
      if (!downloaded) {
        console.log(`skip ${row.id}: unsupported key`);
        continue;
      }
      const newKey = `bug-attachments/${row.bug_id}/${row.id}-${safeFilename(row.filename)}`;
      await uploadObject(newKey, downloaded.body, downloaded.mimeType);
      await pool.query(`UPDATE bug_attachments SET storage_key = $1, mime_type = COALESCE(mime_type, $2) WHERE id = $3`, [
        newKey,
        downloaded.mimeType,
        row.id,
      ]);
      console.log(`${row.id} -> ${newKey}`);
    } catch (error) {
      console.error(`failed ${row.id}: ${error.message || error}`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
