const DEFAULT_ORIGINS = new Set([
  'https://calc.recycleobject.ru',
  'https://calc2.recycleobject.ru',
]);

function configuredOrigins() {
  const values = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...values]);
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (configuredOrigins().has(origin)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
}

export function calculatorCors(req, res, next) {
  const origin = req.get('Origin');
  if (isAllowedOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.vary('Origin');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}
