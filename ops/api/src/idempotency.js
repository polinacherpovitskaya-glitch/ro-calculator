import { getPool } from './db.js';

const PENDING_RESPONSE_STATUS = 102;
const REPLAY_WAIT_MS = 10000;
const REPLAY_POLL_MS = 50;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function conflictResponse(res) {
  return res.status(409).json({
    error: { code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'Idempotency-Key уже использован для другого запроса' },
  });
}

function replayResponse(res, cached) {
  return res.status(cached.response_status).type('application/json').send(cached.response_body);
}

async function waitForReplay(pool, key, req, res) {
  const deadline = Date.now() + REPLAY_WAIT_MS;
  while (Date.now() < deadline) {
    const existing = await pool.query(
      `SELECT method, path, response_status, response_body
         FROM idempotency_keys
        WHERE key = $1`,
      [key],
    );
    const cached = existing.rows[0];
    if (!cached) return null;
    if (cached.method !== req.method || cached.path !== req.path) {
      return conflictResponse(res);
    }
    if (cached.response_status !== PENDING_RESPONSE_STATUS) {
      return replayResponse(res, cached);
    }
    await wait(REPLAY_POLL_MS);
  }

  return res.status(503).json({
    error: {
      code: 'IDEMPOTENCY_IN_PROGRESS',
      message: 'Предыдущий запрос с этим Idempotency-Key ещё выполняется',
    },
  });
}

export async function withIdempotency(req, res, handler) {
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!key) {
    return res.status(400).json({
      error: { code: 'NO_IDEMPOTENCY_KEY', message: 'Заголовок Idempotency-Key обязателен' },
    });
  }

  const pool = getPool();
  const claimed = await pool.query(
    `INSERT INTO idempotency_keys (key, user_id, method, path, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO NOTHING
     RETURNING key`,
    [key, req.user?.id || null, req.method, req.path, PENDING_RESPONSE_STATUS, ''],
  );

  if (claimed.rowCount === 0) {
    const replay = await waitForReplay(pool, key, req, res);
    if (replay) return replay;
    return withIdempotency(req, res, handler);
  }

  const originalJson = res.json.bind(res);
  let captured = null;
  res.json = (body) => {
    captured = {
      status: res.statusCode || 200,
      raw: body,
      body: JSON.stringify(body),
    };
    return res;
  };

  try {
    await handler(req, res);

    if (captured && captured.status < 500) {
      await pool.query(
        `UPDATE idempotency_keys
            SET response_status = $2,
                response_body = $3
          WHERE key = $1`,
        [key, captured.status, captured.body],
      );
    } else {
      await pool.query(
        `DELETE FROM idempotency_keys
          WHERE key = $1
            AND response_status = $2`,
        [key, PENDING_RESPONSE_STATUS],
      );
    }

    res.json = originalJson;
    if (captured && !res.headersSent) {
      return originalJson(captured.raw);
    }
  } catch (err) {
    res.json = originalJson;
    await pool.query(
      `DELETE FROM idempotency_keys
        WHERE key = $1
          AND response_status = $2`,
      [key, PENDING_RESPONSE_STATUS],
    );
    throw err;
  }
}
