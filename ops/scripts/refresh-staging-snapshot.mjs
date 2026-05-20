// Refresh staging data from Supabase without touching auth/session tables.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   DATABASE_URL

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(opsRoot, 'db', 'migrations');

const KEEP = new Set(['app_meta', 'employees', 'auth_users', 'auth_sessions', 'idempotency_keys']);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
let poolEnded = false;

async function dropRefreshTables() {
  const { rows } = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  for (const { tablename } of rows) {
    if (KEEP.has(tablename)) continue;
    console.log(`DROP TABLE ${tablename} CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
  }
}

async function applyMigrations() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    console.log(`Applying ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
  }
}

function runRefreshScript(name) {
  console.log(`Running refresh/${name}.mjs`);
  execFileSync(process.execPath, [path.join(opsRoot, 'scripts', 'refresh', `${name}.mjs`)], {
    cwd: opsRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

async function main() {
  console.log('=== Refreshing staging snapshot ===');
  await dropRefreshTables();

  console.log('=== Applying migrations ===');
  await applyMigrations();
  await pool.end();
  poolEnded = true;

  console.log('=== Running refresh scripts ===');
  for (const script of [
    '01-employees',
    '07-orders',
    '02-warehouse',
    '03-shipments-china',
    '04-molds-blanks',
    '05-bugs',
    '06-production',
    '08-work-management',
  ]) {
    runRefreshScript(script);
  }

  console.log('=== Refresh complete ===');
}

main().catch(async (error) => {
  console.error(error);
  if (!poolEnded) {
    await pool.end();
  }
  process.exit(1);
});
