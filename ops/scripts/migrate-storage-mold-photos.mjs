// One-shot migration for legacy mold photo URLs.
//
// Moves Supabase Storage mold-photos objects into Selectel Object Storage and
// replaces URLs in molds.photo_url with selectel://bucket/key references.
//
// Required environment:
//   DATABASE_URL
//   S3_ENDPOINT
//   S3_BUCKET_MOLD_PHOTOS
//   S3_ACCESS_KEY
//   S3_SECRET_KEY
//
// Required only when a legacy Supabase URL is not directly downloadable:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { uploadObject } from '../api/src/s3.js';

const { Pool } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const BUCKET = requireEnv('S3_BUCKET_MOLD_PHOTOS');
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
const migrated = new Map();
let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'));
  }
  return supabase;
}

function isSupabaseMoldPhotoUrl(value) {
  return typeof value === 'string' && value.includes('/storage/v1/object/') && value.includes('/mold-photos/');
}

function moldPhotoKey(value) {
  if (!isSupabaseMoldPhotoUrl(value)) return null;
  const path = value.split('?')[0];
  const match = path.match(/\/mold-photos\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function safeKey(key) {
  return String(key || '').replace(/^\/+/, '').replace(/\.\.+/g, '.');
}

async function downloadMoldPhoto(originalUrl, sbKey) {
  if (/^https?:\/\//.test(originalUrl)) {
    const res = await fetch(originalUrl);
    if (res.ok) {
      return {
        body: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || 'application/octet-stream',
      };
    }
  }

  const { data, error } = await getSupabase().storage.from('mold-photos').download(sbKey);
  if (error) throw new Error(`Download failed for ${sbKey}: ${error.message || error}`);
  return {
    body: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || 'application/octet-stream',
  };
}

async function migrateUrl(originalUrl) {
  const sbKey = moldPhotoKey(originalUrl);
  if (!sbKey) return null;
  if (migrated.has(originalUrl)) return migrated.get(originalUrl);

  const newKey = `mold-photos/${safeKey(sbKey)}`;
  const selectelUrl = `selectel://${BUCKET}/${newKey}`;
  const object = await downloadMoldPhoto(originalUrl, sbKey);
  await uploadObject(newKey, object.body, object.contentType, BUCKET);
  migrated.set(originalUrl, selectelUrl);
  return selectelUrl;
}

async function migrateMolds() {
  const { rows } = await pool.query(
    `SELECT id, photo_url
       FROM molds
      WHERE photo_url LIKE '%/storage/v1/object/%/mold-photos/%'
      ORDER BY id`
  );
  for (const row of rows) {
    const newUrl = await migrateUrl(row.photo_url);
    if (!newUrl) continue;
    await pool.query(`UPDATE molds SET photo_url = $1, updated_at = NOW() WHERE id = $2`, [newUrl, row.id]);
    console.log(`molds#${row.id} -> ${newUrl}`);
  }
  return rows.length;
}

async function main() {
  const molds = await migrateMolds();
  console.log(`Mold photos migration complete. molds=${molds}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
