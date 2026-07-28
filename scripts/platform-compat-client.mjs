import crypto from 'node:crypto';

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function platformApiConfig(options = {}) {
  return {
    apiUrl: required(options.apiUrl || process.env.OPS_API_URL || 'https://api.recycleobject.ru', 'OPS_API_URL')
      .replace(/\/+$/, ''),
    token: required(options.token || process.env.OPS_BOT_TOKEN, 'OPS_BOT_TOKEN'),
  };
}

export async function platformQuery(table, body = {}, options = {}) {
  const config = platformApiConfig(options);
  const attempts = Math.max(1, Number(options.attempts) || 3);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 30000);
  const action = String(body.action || 'select');
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.apiUrl}/api/compat/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(action === 'select' ? {} : { 'Idempotency-Key': crypto.randomUUID() }),
        },
        body: JSON.stringify({ table, action, ...body }),
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok || payload?.error) {
        const message = payload?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Platform API ${table}/${action}: ${message}`);
      }
      return payload?.data ?? null;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 300 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error(`Platform API ${table}/${action} is unavailable`);
}

export async function platformSelectAll(table, options = {}) {
  const pageSize = Math.max(1, Number(options.pageSize) || 1000);
  const rows = [];
  for (let page = 0; page < 10000; page += 1) {
    const from = page * pageSize;
    const chunk = await platformQuery(table, {
      action: 'select',
      columns: options.columns || '*',
      filters: options.filters || [],
      orders: options.orders || [],
      range: { from, to: from + pageSize - 1 },
    }, options);
    if (!Array.isArray(chunk)) return chunk;
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error(`Platform API pagination limit exceeded for ${table}`);
}

export async function platformSelectOne(table, options = {}) {
  return platformQuery(table, {
    action: 'select',
    columns: options.columns || '*',
    filters: options.filters || [],
    orders: options.orders || [],
    limit: 1,
    cardinality: 'maybeSingle',
  }, options);
}

export async function platformUpsert(table, values, options = {}) {
  return platformQuery(table, {
    action: 'upsert',
    values,
    columns: options.columns || '*',
    onConflict: options.onConflict || '',
    returning: options.returning !== false,
  }, options);
}

export async function platformDelete(table, filters, options = {}) {
  return platformQuery(table, {
    action: 'delete',
    filters: filters || [],
    columns: options.columns || '*',
    returning: options.returning === true,
  }, options);
}
