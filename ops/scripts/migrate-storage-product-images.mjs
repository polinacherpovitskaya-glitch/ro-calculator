// One-shot migration for legacy product image URLs.
//
// Moves Supabase Storage product-images objects into Selectel Object Storage and
// replaces URLs in warehouse_items.photo_url, order_items.item_data, and
// product_templates.data with selectel://bucket/key references.
//
// Required environment:
//   DATABASE_URL
//   S3_ENDPOINT
//   S3_BUCKET_PRODUCT_IMAGES
//   S3_ACCESS_KEY
//   S3_SECRET_KEY
//
// Required only when rows with legacy Supabase product image URLs exist:
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

const BUCKET = requireEnv('S3_BUCKET_PRODUCT_IMAGES');
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
const migrated = new Map();
let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'));
  }
  return supabase;
}

function isSupabaseProductImageUrl(value) {
  return typeof value === 'string' && value.includes('/storage/v1/object/') && value.includes('/product-images/');
}

function productImageKey(value) {
  if (!isSupabaseProductImageUrl(value)) return null;
  const path = value.split('?')[0];
  const match = path.match(/\/product-images\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function safeKey(key) {
  return String(key || '').replace(/^\/+/, '').replace(/\.\.+/g, '.');
}

async function migrateUrl(originalUrl) {
  const sbKey = productImageKey(originalUrl);
  if (!sbKey) return null;
  if (migrated.has(originalUrl)) return migrated.get(originalUrl);

  const newKey = `product-images/${safeKey(sbKey)}`;
  const selectelUrl = `selectel://${BUCKET}/${newKey}`;
  const { data, error } = await getSupabase().storage.from('product-images').download(sbKey);
  if (error) throw new Error(`Download failed for ${sbKey}: ${error.message || error}`);
  const body = Buffer.from(await data.arrayBuffer());
  await uploadObject(newKey, body, data.type || 'application/octet-stream', BUCKET);
  migrated.set(originalUrl, selectelUrl);
  return selectelUrl;
}

async function migrateJson(value) {
  if (isSupabaseProductImageUrl(value)) {
    return { value: await migrateUrl(value), changed: true };
  }
  if (!value || typeof value !== 'object') return { value, changed: false };
  if (Array.isArray(value)) {
    let changed = false;
    const next = [];
    for (const entry of value) {
      const migratedEntry = await migrateJson(entry);
      next.push(migratedEntry.value);
      changed = changed || migratedEntry.changed;
    }
    return { value: next, changed };
  }

  let changed = false;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const migratedEntry = await migrateJson(entry);
    next[key] = migratedEntry.value;
    changed = changed || migratedEntry.changed;
  }
  return { value: next, changed };
}

async function migrateWarehouseItems() {
  const { rows } = await pool.query(
    `SELECT id, photo_url
       FROM warehouse_items
      WHERE photo_url LIKE '%/storage/v1/object/%/product-images/%'
      ORDER BY id`
  );
  for (const row of rows) {
    const newUrl = await migrateUrl(row.photo_url);
    if (!newUrl) continue;
    await pool.query(`UPDATE warehouse_items SET photo_url = $1, updated_at = NOW() WHERE id = $2`, [newUrl, row.id]);
    console.log(`warehouse_items#${row.id} -> ${newUrl}`);
  }
  return rows.length;
}

async function migrateOrderItems() {
  const { rows } = await pool.query(
    `SELECT id, item_data
       FROM order_items
      WHERE item_data::text LIKE '%/storage/v1/object/%/product-images/%'
      ORDER BY id`
  );
  let changed = 0;
  for (const row of rows) {
    const next = await migrateJson(row.item_data || {});
    if (!next.changed) continue;
    await pool.query(`UPDATE order_items SET item_data = $1, updated_at = NOW() WHERE id = $2`, [next.value, row.id]);
    changed += 1;
    console.log(`order_items#${row.id}`);
  }
  return changed;
}

async function migrateProductTemplates() {
  const { rows } = await pool.query(
    `SELECT id, data
       FROM product_templates
      WHERE data::text LIKE '%/storage/v1/object/%/product-images/%'
      ORDER BY id`
  );
  let changed = 0;
  for (const row of rows) {
    const next = await migrateJson(row.data || {});
    if (!next.changed) continue;
    await pool.query(`UPDATE product_templates SET data = $1, updated_at = NOW() WHERE id = $2`, [next.value, row.id]);
    changed += 1;
    console.log(`product_templates#${row.id}`);
  }
  return changed;
}

async function main() {
  const warehouse = await migrateWarehouseItems();
  const orderItems = await migrateOrderItems();
  const templates = await migrateProductTemplates();
  console.log(`Product images migration complete. warehouse_items=${warehouse}, order_items=${orderItems}, product_templates=${templates}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
