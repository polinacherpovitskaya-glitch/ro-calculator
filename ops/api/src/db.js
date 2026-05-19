import pg from 'pg';

const { Pool } = pg;

let currentConnectionString = null;
let pool = null;

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  if (!pool || currentConnectionString !== connectionString) {
    if (pool) {
      void pool.end();
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 1000,
      allowExitOnIdle: true,
    });
    currentConnectionString = connectionString;
  }

  return pool;
}

export async function pingDatabase() {
  const activePool = getPool();
  const start = Date.now();
  const result = await activePool.query("SELECT 'pong' AS pong");
  const latencyMs = Date.now() - start;

  return {
    ok: result.rows[0]?.pong === 'pong',
    latency_ms: latencyMs,
  };
}
