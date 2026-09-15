import { getPool } from '../db.js';
import { DEFAULT_LADDER, DEFAULT_QUALITY_WEIGHTS } from './calc.js';

const SCHEME_COLUMNS = 'id, employee_id, kind, period_type, rates_json, quality_json, ladder_json, is_active, created_at, updated_at';

function normalizeScheme(row) {
  return row ? { ...row, employee_id: Number(row.employee_id) } : null;
}

export async function listSchemes(client = getPool()) {
  const { rows } = await client.query(`SELECT ${SCHEME_COLUMNS} FROM bonus_schemes WHERE is_active ORDER BY id`);
  return rows.map(normalizeScheme);
}

export async function getSchemeById(id, client = getPool()) {
  const { rows } = await client.query(`SELECT ${SCHEME_COLUMNS} FROM bonus_schemes WHERE id = $1`, [id]);
  return normalizeScheme(rows[0]);
}

export async function upsertScheme(employeeId, payload, client = getPool()) {
  const kind = payload.kind === 'commercial' ? 'commercial' : 'production';
  const rates = { rate: Number(payload.rate) || 0 };
  const quality = { weights: { ...DEFAULT_QUALITY_WEIGHTS, ...(payload.quality_weights || {}) } };
  const ladder = payload.ladder_json && typeof payload.ladder_json === 'object' ? payload.ladder_json : DEFAULT_LADDER;
  const existing = await client.query(`SELECT id FROM bonus_schemes WHERE employee_id = $1 AND is_active`, [employeeId]);
  if (existing.rows[0]) {
    const { rows } = await client.query(
      `UPDATE bonus_schemes SET kind = $2, rates_json = $3::jsonb, quality_json = $4::jsonb, ladder_json = $5::jsonb, updated_at = now()
        WHERE id = $1 RETURNING ${SCHEME_COLUMNS}`,
      [existing.rows[0].id, kind, JSON.stringify(rates), JSON.stringify(quality), JSON.stringify(ladder)],
    );
    return normalizeScheme(rows[0]);
  }
  const { rows } = await client.query(
    `INSERT INTO bonus_schemes (employee_id, kind, rates_json, quality_json, ladder_json)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb) RETURNING ${SCHEME_COLUMNS}`,
    [employeeId, kind, JSON.stringify(rates), JSON.stringify(quality), JSON.stringify(ladder)],
  );
  return normalizeScheme(rows[0]);
}

function targetsFromRows(rows) {
  const targets = {};
  for (const row of rows) {
    targets[row.metric_key] = { min: Number(row.min_value), target: Number(row.target_value), max: Number(row.max_value) };
  }
  return Object.keys(targets).length ? targets : null;
}

export async function getTargets(schemeId, period, client = getPool()) {
  const { rows } = await client.query(
    `SELECT metric_key, min_value, target_value, max_value FROM bonus_period_targets WHERE scheme_id = $1 AND period = $2`,
    [schemeId, period],
  );
  return targetsFromRows(rows);
}

export async function upsertTargets(schemeId, period, targets, client = getPool()) {
  for (const [key, value] of Object.entries(targets)) {
    await client.query(
      `INSERT INTO bonus_period_targets (scheme_id, period, metric_key, min_value, target_value, max_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (scheme_id, period, metric_key)
       DO UPDATE SET min_value = EXCLUDED.min_value, target_value = EXCLUDED.target_value, max_value = EXCLUDED.max_value, updated_at = now()`,
      [schemeId, period, key, Number(value.min), Number(value.target), Number(value.max)],
    );
  }
  return getTargets(schemeId, period, client);
}

export async function listStockApprovals(period, client = getPool()) {
  const { rows } = await client.query(`SELECT order_id FROM bonus_stock_approvals WHERE period = $1`, [period]);
  return new Set(rows.map((row) => String(row.order_id)));
}

export async function setStockApproval(period, orderId, approved, by, client = getPool()) {
  if (approved) {
    await client.query(
      `INSERT INTO bonus_stock_approvals (period, order_id, approved_by) VALUES ($1, $2, $3)
       ON CONFLICT (period, order_id) DO NOTHING`,
      [period, orderId, by],
    );
  } else {
    await client.query(`DELETE FROM bonus_stock_approvals WHERE period = $1 AND order_id = $2`, [period, orderId]);
  }
}

const RESULT_COLUMNS = 'id, scheme_id, period, status, computed_json, amount_computed, amount_final, adjustments_json, closed_at, closed_by, paid_at';

export async function getResult(schemeId, period, client = getPool()) {
  const { rows } = await client.query(`SELECT ${RESULT_COLUMNS} FROM bonus_period_results WHERE scheme_id = $1 AND period = $2`, [schemeId, period]);
  return rows[0] || null;
}

export async function listResults(schemeId, client = getPool()) {
  const { rows } = await client.query(`SELECT ${RESULT_COLUMNS} FROM bonus_period_results WHERE scheme_id = $1 ORDER BY period`, [schemeId]);
  return rows;
}

export async function saveResult(row, client = getPool()) {
  const { rows } = await client.query(
    `INSERT INTO bonus_period_results (scheme_id, period, status, computed_json, amount_computed, amount_final, adjustments_json, closed_at, closed_by, paid_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10)
     ON CONFLICT (scheme_id, period) DO UPDATE SET
       status = EXCLUDED.status, computed_json = EXCLUDED.computed_json, amount_computed = EXCLUDED.amount_computed,
       amount_final = EXCLUDED.amount_final, adjustments_json = EXCLUDED.adjustments_json,
       closed_at = EXCLUDED.closed_at, closed_by = EXCLUDED.closed_by, paid_at = EXCLUDED.paid_at
     RETURNING ${RESULT_COLUMNS}`,
    [row.scheme_id, row.period, row.status, JSON.stringify(row.computed_json || {}), row.amount_computed, row.amount_final,
      JSON.stringify(row.adjustments_json || []), row.closed_at || null, row.closed_by || '', row.paid_at || null],
  );
  return rows[0];
}

export async function getTeamTargets(team, period, client = getPool()) {
  const { rows } = await client.query(
    `SELECT metric_key, min_value, target_value, max_value FROM bonus_team_targets WHERE team = $1 AND period = $2`,
    [team, period],
  );
  return targetsFromRows(rows);
}

export async function upsertTeamTargets(team, period, targets, client = getPool()) {
  for (const [key, value] of Object.entries(targets)) {
    await client.query(
      `INSERT INTO bonus_team_targets (team, period, metric_key, min_value, target_value, max_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (team, period, metric_key)
       DO UPDATE SET min_value = EXCLUDED.min_value, target_value = EXCLUDED.target_value, max_value = EXCLUDED.max_value, updated_at = now()`,
      [team, period, key, Number(value.min), Number(value.target), Number(value.max)],
    );
  }
  return getTeamTargets(team, period, client);
}

export async function getTeamFacts(team, period, client = getPool()) {
  const { rows } = await client.query(
    `SELECT metric_key, value, source, note, updated_by, updated_at FROM bonus_team_facts WHERE team = $1 AND period = $2`,
    [team, period],
  );
  const facts = {};
  for (const row of rows) {
    facts[row.metric_key] = { value: Number(row.value), source: row.source, note: row.note, updated_by: row.updated_by, updated_at: row.updated_at };
  }
  return facts;
}

export async function setTeamFact(team, period, metricKey, { value, source = 'manual', note = '' }, by, client = getPool()) {
  await client.query(
    `INSERT INTO bonus_team_facts (team, period, metric_key, value, source, note, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (team, period, metric_key)
     DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [team, period, metricKey, Number(value), source, String(note || ''), by],
  );
  return getTeamFacts(team, period, client);
}
