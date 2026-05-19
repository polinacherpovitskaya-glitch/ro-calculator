import { getPool } from './db.js';

export async function withIdempotency(req, res, handler) {
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!key) {
    return res.status(400).json({
      error: { code: 'NO_IDEMPOTENCY_KEY', message: 'Заголовок Idempotency-Key обязателен' },
    });
  }

  const pool = getPool();
  const existing = await pool.query(
    `SELECT method, path, response_status, response_body
       FROM idempotency_keys
      WHERE key = $1`,
    [key]
  );

  if (existing.rows[0]) {
    const cached = existing.rows[0];
    if (cached.method !== req.method || cached.path !== req.path) {
      return res.status(409).json({
        error: { code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'Idempotency-Key уже использован для другого запроса' },
      });
    }

    return res.status(cached.response_status).type('application/json').send(cached.response_body);
  }

  const originalJson = res.json.bind(res);
  let captured = null;
  res.json = (body) => {
    captured = {
      status: res.statusCode || 200,
      body: JSON.stringify(body),
    };
    return originalJson(body);
  };

  await handler(req, res);

  if (captured && captured.status < 500) {
    await pool.query(
      `INSERT INTO idempotency_keys (key, user_id, method, path, response_status, response_body)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO NOTHING`,
      [key, req.user?.id || null, req.method, req.path, captured.status, captured.body]
    );
  }
}
