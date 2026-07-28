import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { primaryKeyFor } from '../compat-schema.js';
import {
  mergeLegacyAccountSecrets,
  parseLegacyAccountsRow,
  sanitizeLegacyAccount,
} from '../auth/legacy.js';

const router = Router();
const AUTH_ACCOUNTS_KEY = 'auth_accounts_json';
const MUTATIONS = new Set(['insert', 'upsert', 'update', 'delete']);

class CompatError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function cloneRow(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}

function sourceId(row, primaryKey) {
  return primaryKey.map((column) => {
    const value = row?.[column];
    if (value === null || value === undefined || value === '') {
      throw new CompatError(400, '23502', `Поле ${column} обязательно для этой таблицы`);
    }
    return String(value);
  }).join('\u001f');
}

function equalValue(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left == null && right == null;
  }
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return String(left) === String(right);
}

function listValue(value) {
  if (Array.isArray(value)) return value;
  const raw = String(value ?? '').trim().replace(/^\(/, '').replace(/\)$/, '');
  if (!raw) return [];
  return raw.split(',').map((entry) => entry.trim().replace(/^["']|["']$/g, ''));
}

function containsValue(actual, expected) {
  if (Array.isArray(actual)) {
    return listValue(expected).every((item) => actual.some((candidate) => equalValue(candidate, item)));
  }
  if (actual && typeof actual === 'object' && expected && typeof expected === 'object') {
    return Object.entries(expected).every(([key, value]) => equalValue(actual[key], value));
  }
  return String(actual ?? '').includes(String(expected ?? ''));
}

function orderedCompare(left, right) {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'ru', { numeric: true });
}

function matchesFilter(row, filter) {
  const actual = row?.[filter.column];
  const expected = filter.value;
  switch (filter.op) {
    case 'eq': return equalValue(actual, expected);
    case 'neq': return !equalValue(actual, expected);
    case 'in': return listValue(expected).some((item) => equalValue(actual, item));
    case 'is': return expected === null ? actual == null : equalValue(actual, expected);
    case 'contains': return containsValue(actual, expected);
    case 'gt': return orderedCompare(actual, expected) > 0;
    case 'gte': return orderedCompare(actual, expected) >= 0;
    case 'lt': return orderedCompare(actual, expected) < 0;
    case 'lte': return orderedCompare(actual, expected) <= 0;
    case 'not':
      return !matchesFilter(row, { op: filter.operator, column: filter.column, value: expected });
    default:
      throw new CompatError(400, 'INVALID_FILTER', `Неподдерживаемый фильтр: ${filter.op}`);
  }
}

function filterRows(rows, filters = []) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

function orderRows(rows, orders = []) {
  if (!orders.length) return rows;
  return rows.slice().sort((left, right) => {
    for (const order of orders) {
      const compared = orderedCompare(left?.[order.column], right?.[order.column]);
      if (compared !== 0) return order.ascending === false ? -compared : compared;
    }
    return 0;
  });
}

function parseEmbeddedValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function projectRow(row, columns) {
  if (!columns || columns === '*') return cloneRow(row);
  const projected = {};
  for (const rawToken of String(columns).split(',')) {
    const token = rawToken.trim();
    if (!token) continue;
    const embedded = token.match(/^([^:]+):([A-Za-z0-9_]+)->([A-Za-z0-9_]+)$/);
    if (embedded) {
      const [, alias, source, field] = embedded;
      const parent = parseEmbeddedValue(row?.[source]);
      projected[alias.trim()] = parent && typeof parent === 'object' ? parent[field] ?? null : null;
      continue;
    }
    projected[token] = row?.[token] ?? null;
  }
  return projected;
}

function cardinalityResult(rows, cardinality) {
  if (!cardinality) return rows;
  if (rows.length === 1) return rows[0];
  if (cardinality === 'maybeSingle' && rows.length === 0) return null;
  throw new CompatError(406, 'PGRST116', `Ожидалась одна строка, получено: ${rows.length}`);
}

function paginateRows(rows, body) {
  if (body.range && Number.isInteger(body.range.from) && Number.isInteger(body.range.to)) {
    return rows.slice(body.range.from, body.range.to + 1);
  }
  if (Number.isInteger(body.limit) && body.limit >= 0) return rows.slice(0, body.limit);
  return rows;
}

function redactSettingsRows(table, rows) {
  if (table !== 'settings') return rows;
  return rows.map((row) => {
    if (row?.key !== AUTH_ACCOUNTS_KEY) return row;
    const accounts = parseLegacyAccountsRow(row)
      .map((account) => sanitizeLegacyAccount(account))
      .filter(Boolean);
    return { ...row, value: JSON.stringify(accounts) };
  });
}

async function readRows(client, table, lock = false) {
  const { rows } = await client.query(
    `SELECT data
       FROM compat_rows
      WHERE table_name = $1
      ORDER BY source_id${lock ? ' FOR UPDATE' : ''}`,
    [table],
  );
  return rows.map((row) => row.data);
}

function nextNumericId(rows) {
  let maximum = 0;
  for (const row of rows) {
    const value = Number(row?.id);
    if (Number.isSafeInteger(value) && value > maximum) maximum = value;
  }
  return maximum + 1;
}

function ensureGeneratedPrimaryKey(row, primaryKey, rows, counter) {
  if (primaryKey.length !== 1 || primaryKey[0] !== 'id' || row.id != null && row.id !== '') return counter;
  const next = counter || nextNumericId(rows);
  row.id = next;
  return next + 1;
}

async function writeRow(client, table, primaryKey, row, previousSourceId = null) {
  const id = sourceId(row, primaryKey);
  if (previousSourceId && previousSourceId !== id) {
    await client.query(
      `DELETE FROM compat_rows WHERE table_name = $1 AND source_id = $2`,
      [table, previousSourceId],
    );
  }
  await client.query(
    `INSERT INTO compat_rows (table_name, source_id, data, copied_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (table_name, source_id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = NOW()`,
    [table, id, row],
  );
}

function conflictColumns(body, primaryKey) {
  const explicit = String(body.onConflict || '')
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
  return explicit.length ? explicit : primaryKey;
}

function findConflict(rows, incoming, columns) {
  if (columns.some((column) => incoming?.[column] === null || incoming?.[column] === undefined || incoming?.[column] === '')) {
    return -1;
  }
  return rows.findIndex((row) => columns.every((column) => equalValue(row?.[column], incoming?.[column])));
}

async function protectAuthAccountMutation(req, rows, incomingRows) {
  const authPayloads = incomingRows.filter((row) => row?.key === AUTH_ACCOUNTS_KEY);
  if (!authPayloads.length) return incomingRows;
  if (req.user?.role !== 'admin') {
    throw new CompatError(403, 'FORBIDDEN', 'Изменять учётные записи может только администратор');
  }
  const currentRow = rows.find((row) => row?.key === AUTH_ACCOUNTS_KEY);
  const currentAccounts = parseLegacyAccountsRow(currentRow);
  return incomingRows.map((row) => {
    if (row?.key !== AUTH_ACCOUNTS_KEY) return row;
    let incomingAccounts = [];
    try {
      incomingAccounts = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    } catch {
      throw new CompatError(400, 'INVALID_AUTH_ACCOUNTS', 'Некорректный список учётных записей');
    }
    return {
      ...row,
      value: JSON.stringify(mergeLegacyAccountSecrets(incomingAccounts, currentAccounts)),
    };
  });
}

async function executeSelect(client, table, body) {
  let rows = await readRows(client, table);
  rows = filterRows(rows, body.filters);
  rows = orderRows(rows, body.orders);
  rows = paginateRows(rows, body);
  rows = redactSettingsRows(table, rows);
  const projected = rows.map((row) => projectRow(row, body.columns));
  return { data: cardinalityResult(projected, body.cardinality), error: null };
}

async function executeMutation(req, client, table, primaryKey, body) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`compat:${table}`]);
  const rows = await readRows(client, table, true);
  const matchedRows = filterRows(rows, body.filters);
  const returning = body.returning === true;
  let changed = [];

  if (body.action === 'delete') {
    if (table === 'settings' && matchedRows.some((row) => row?.key === AUTH_ACCOUNTS_KEY) && req.user?.role !== 'admin') {
      throw new CompatError(403, 'FORBIDDEN', 'Удалять учётные записи может только администратор');
    }
    for (const row of matchedRows) {
      await client.query(
        `DELETE FROM compat_rows WHERE table_name = $1 AND source_id = $2`,
        [table, sourceId(row, primaryKey)],
      );
    }
    changed = matchedRows;
  } else if (body.action === 'update') {
    const patch = body.values;
    if (!patch || Array.isArray(patch) || typeof patch !== 'object') {
      throw new CompatError(400, 'INVALID_PAYLOAD', 'Для update нужен объект');
    }
    const protectedRows = await protectAuthAccountMutation(
      req,
      rows,
      matchedRows.map((row) => ({ ...row, ...patch })),
    );
    for (let index = 0; index < matchedRows.length; index += 1) {
      const current = matchedRows[index];
      const next = protectedRows[index];
      await writeRow(client, table, primaryKey, next, sourceId(current, primaryKey));
      changed.push(next);
    }
  } else {
    const wasArray = Array.isArray(body.values);
    let incomingRows = (wasArray ? body.values : [body.values]).map((row) => cloneRow(row));
    if (incomingRows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new CompatError(400, 'INVALID_PAYLOAD', 'Для записи нужен объект или массив объектов');
    }
    incomingRows = await protectAuthAccountMutation(req, rows, incomingRows);
    const conflicts = conflictColumns(body, primaryKey);
    let generatedId = nextNumericId(rows);
    for (const incoming of incomingRows) {
      const conflictIndex = findConflict(rows, incoming, conflicts);
      if (body.action === 'insert' && conflictIndex >= 0) {
        throw new CompatError(409, '23505', 'Строка с таким ключом уже существует');
      }
      if (body.action === 'upsert' && conflictIndex >= 0) {
        const current = rows[conflictIndex];
        const next = { ...current, ...incoming };
        await writeRow(client, table, primaryKey, next, sourceId(current, primaryKey));
        rows[conflictIndex] = next;
        changed.push(next);
        continue;
      }
      generatedId = ensureGeneratedPrimaryKey(incoming, primaryKey, rows, generatedId);
      const id = sourceId(incoming, primaryKey);
      if (rows.some((row) => sourceId(row, primaryKey) === id)) {
        throw new CompatError(409, '23505', 'Строка с таким первичным ключом уже существует');
      }
      await writeRow(client, table, primaryKey, incoming);
      rows.push(incoming);
      changed.push(incoming);
    }
  }

  if (!returning) return { data: null, error: null };
  const safeRows = redactSettingsRows(table, changed);
  const projected = safeRows.map((row) => projectRow(row, body.columns));
  return { data: cardinalityResult(projected, body.cardinality), error: null };
}

router.post('/query', requireAuth, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const table = String(body.table || '');
  const primaryKey = primaryKeyFor(table);
  if (!primaryKey) {
    throw new CompatError(404, 'PGRST205', `Таблица ${table || 'не указана'} не разрешена`);
  }

  const action = String(body.action || 'select');
  if (action === 'select') {
    const result = await executeSelect(getPool(), table, body);
    return res.json(result);
  }
  if (!MUTATIONS.has(action)) {
    throw new CompatError(400, 'INVALID_ACTION', `Неподдерживаемая операция: ${action}`);
  }

  return withIdempotency(req, res, async () => {
    const result = await withTransaction((client) => executeMutation(req, client, table, primaryKey, body));
    res.json(result);
  });
}));

router.use((error, req, res, next) => {
  if (!(error instanceof CompatError)) return next(error);
  return res.status(error.status).json({
    error: { code: error.code, message: error.message },
  });
});

export default router;
