const pg = require('pg');

const { Pool } = pg;
let pool;

function getPool() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required');
    }
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 1000,
            allowExitOnIdle: true,
        });
    }
    return pool;
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

module.exports = { getPool, closePool };
