// Create or reset auth users for active employees with emails.
// Prints CSV to stdout: email,name,temp_password
//
// Usage:
//   DATABASE_URL=postgres://... node ops/scripts/issue-temp-passwords.mjs > /tmp/temp-passwords.csv

import crypto from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../api/src/auth/argon.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function generatePassword() {
  return crypto.randomBytes(8).toString('hex');
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, email, name FROM employees WHERE is_active = TRUE AND email IS NOT NULL ORDER BY name`
  );

  console.error(`Found ${rows.length} active employees with emails`);
  console.log('email,name,temp_password');

  for (const employee of rows) {
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO auth_users (email, password_hash, employee_id, role, must_change_password)
       VALUES ($1, $2, $3, 'user', TRUE)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         employee_id = EXCLUDED.employee_id,
         must_change_password = TRUE`,
      [employee.email.toLowerCase(), passwordHash, employee.id]
    );

    console.log([employee.email, employee.name, password].map(csvCell).join(','));
  }

  console.error('Done. Share the CSV through a protected channel.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
