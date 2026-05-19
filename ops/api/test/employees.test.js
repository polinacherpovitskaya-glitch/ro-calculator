import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function createEmployeeAndUser() {
  const pool = getPool();
  const suffix = crypto.randomUUID();
  const employeeRes = await pool.query(
    `INSERT INTO employees (id, name, email, role, is_active)
     VALUES ($1, $2, $3, 'operations', TRUE)
     RETURNING id, email`,
    [Math.floor(Math.random() * 1000000000), `Employee ${suffix}`, `employee-${suffix}@x.test`]
  );
  const employee = employeeRes.rows[0];
  const passwordHash = await hashPassword('testpass1234');
  await pool.query(
    `INSERT INTO auth_users (email, password_hash, employee_id, role, must_change_password)
     VALUES ($1, $2, $3, 'user', FALSE)`,
    [employee.email, passwordHash, employee.id]
  );

  return employee;
}

async function login(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}

test('GET /api/employees without cookie returns 401', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/employees`);
  assert.equal(res.status, 401);
});

test('GET /api/employees with cookie returns active employees', async (t) => {
  const employee = await createEmployeeAndUser();
  const port = await startServer(t);
  const cookie = await login(port, employee.email);

  const res = await fetch(`http://127.0.0.1:${port}/api/employees`, {
    headers: { cookie },
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.employees));
  assert.ok(body.employees.some((row) => row.id === employee.id));
  assert.ok(body.employees.every((row) => row.is_active === true));
});
