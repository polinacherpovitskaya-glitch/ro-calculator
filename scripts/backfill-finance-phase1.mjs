import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const supabaseJs = fs.readFileSync(path.join(ROOT, 'js', 'supabase.js'), 'utf8');
const urlMatch = supabaseJs.match(/const SUPABASE_URL = '([^']+)'/);
const keyMatch = supabaseJs.match(/const SUPABASE_ANON_KEY = '([^']+)'/);

if (!urlMatch || !keyMatch) {
  throw new Error('Could not extract SUPABASE_URL / SUPABASE_ANON_KEY from js/supabase.js');
}

const SUPABASE_URL = process.env.SUPABASE_URL || urlMatch[1];
const SUPABASE_KEY = process.env.SUPABASE_KEY || keyMatch[1];
const CHUNK_SIZE = Number(process.env.FINANCE_BACKFILL_CHUNK_SIZE || 250);

const SETTINGS_KEYS = {
  workspace: 'finance_workspace_json',
  tochka: 'tochka_snapshot_json',
  fintablo: 'fintablo_snapshot_json',
};

function nowIso() {
  return new Date().toISOString();
}

function safeDate(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw.slice(0, 10);
}

function extractWindowDate(windowValue, index) {
  if (Array.isArray(windowValue)) return safeDate(windowValue[index] || '');
  if (windowValue && typeof windowValue === 'object') {
    if (index === 0) return safeDate(windowValue.from || windowValue.start || '');
    return safeDate(windowValue.to || windowValue.end || '');
  }
  return '';
}

function normalizeSourceType(kind = '') {
  const normalized = String(kind || '').trim().toLowerCase();
  if (normalized.includes('bank')) return 'bank';
  if (normalized.includes('legacy')) return 'legacy_import';
  if (normalized === 'manual') return 'manual';
  return 'internal';
}

function inferSourceProvider(source = {}) {
  const slug = String(source?.id || source?.slug || '').trim().toLowerCase();
  if (slug.includes('tochka')) return 'tochka';
  if (slug.includes('fintablo') || slug.includes('orders_fintablo')) return 'fintablo';
  if (slug.includes('cash')) return 'manual_cash';
  return slug || 'app';
}

function normalizeAccountKind(kind = '') {
  const normalized = String(kind || '').trim().toLowerCase();
  if (normalized === 'bank') return 'bank';
  if (normalized === 'cash') return 'cash';
  if (normalized === 'card') return 'card';
  if (normalized === 'fund' || normalized === 'reserve') return 'fund';
  if (normalized === 'tax') return 'tax';
  if (normalized === 'crypto') return 'crypto';
  return 'other';
}

function normalizeTransactionType(kind = '', row = {}) {
  const normalized = String(kind || row.kind || row.transaction_type || '').trim().toLowerCase();
  if (['income', 'expense', 'transfer', 'payroll', 'asset', 'tax', 'charity', 'adjustment'].includes(normalized)) {
    return normalized;
  }
  const direction = String(row.direction || '').trim().toLowerCase();
  if (direction === 'in' || direction === 'income') return 'income';
  if (direction === 'out' || direction === 'expense') return 'expense';
  return 'expense';
}

function normalizeReviewStatus(value = '', row = {}) {
  const normalized = String(value || row.review_status || row.route || '').trim().toLowerCase();
  if (['confirmed', 'ignored', 'hidden', 'draft', 'review'].includes(normalized)) return normalized;
  if (normalized === 'auto' || normalized === 'manual') return 'confirmed';
  return 'review';
}

function financeLegacyTxKey(row = {}, prefix = 'finance') {
  const explicit = String(row.legacy_tx_key || row.tx_key || row.external_id || row.transactionId || row.transaction_id || row.id || '').trim();
  if (explicit) return explicit;
  const accountId = String(row.accountId || row.account_id || row.external_account_id || '').trim();
  const date = safeDate(row.date || row.occurred_on || row.booked_at || '');
  const amount = Number(row.amount || row.amount_rub || 0) || 0;
  const description = String(row.description || row.note || '').trim().slice(0, 120);
  return [prefix, accountId, date, amount.toFixed(2), description].join(':');
}

function mapSnapshotAccountToFinanceAccountRow(account = {}, sourceSlug = '') {
  const legacyId = String(account.id || account.accountId || account.account_id || account.external_id || account.account_number || '').trim();
  const displayName = String(account.displayName || account.accountLabel || account.name || legacyId || 'Счет').trim();
  return {
    legacy_id: legacyId,
    source_slug: sourceSlug || String(account.source_id || '').trim(),
    account_kind: 'bank',
    currency_code: String(account.currency || 'RUB').trim() || 'RUB',
    name: displayName,
    owner_name: String(account.owner || account.ownerName || '').trim(),
    external_account_id: String(account.external_id || account.accountId || account.account_id || '').trim(),
    account_number: String(account.accountNumber || account.account_number || account.external_ref || account.number || '').trim(),
    bank_name: String(account.bank_name || 'Точка').trim(),
    bank_bic: String(account.bank_bic || '').trim(),
    is_hidden: !!account.hidden || !!account.hideInTotal,
    is_active: account.status !== 'archived' && account.status !== 'deleted' && account.archived !== true,
    sort_order: Number(account.sort_order || 0) || 0,
    metadata_json: { original: account },
  };
}

function mapWorkspaceAccountToFinanceAccountRow(account = {}) {
  return {
    legacy_id: String(account.id || '').trim(),
    source_slug: String(account.source_id || '').trim(),
    account_kind: normalizeAccountKind(account.type),
    currency_code: String(account.currency || 'RUB').trim() || 'RUB',
    name: String(account.name || '').trim() || 'Счет',
    owner_name: String(account.owner || '').trim(),
    external_account_id: String(account.external_ref || account.external_account_id || '').trim(),
    account_number: String(account.account_number || '').trim(),
    bank_name: String(account.bank_name || '').trim(),
    bank_bic: String(account.bank_bic || '').trim(),
    is_hidden: account.show_in_money === false || !!account.legacy_hide_in_total,
    is_active: String(account.status || '').trim().toLowerCase() !== 'archived',
    sort_order: Number(account.sort_order || 0) || 0,
    metadata_json: { original: account },
  };
}

function mapRawTransactionToFinanceRow(row = {}, defaults = {}) {
  const amount = Number(row.amount || row.amount_rub || 0) || 0;
  const occurredOn = safeDate(row.date || row.occurred_on || row.booked_at || '', safeDate(defaults.occurred_on || ''));
  return {
    legacy_tx_key: financeLegacyTxKey(row, defaults.prefix || 'finance'),
    source_slug: String(defaults.source_slug || row.source_id || '').trim(),
    legacy_account_id: String(row.accountId || row.account_id || row.external_account_id || row.moneybagId || '').trim(),
    legacy_category_id: String(row.categoryId || row.category_id || '').trim(),
    legacy_direction_id: String(row.directionId || row.direction_id || row.project_id || '').trim(),
    legacy_counterparty_id: String(row.counterparty_id || row.partnerId || '').trim(),
    transaction_type: normalizeTransactionType(defaults.transaction_type || row.transaction_type || row.kind, row),
    review_status: normalizeReviewStatus(defaults.review_status || row.review_status || row.route, row),
    confidence: Number(defaults.confidence ?? row.confidence ?? 0) || 0,
    amount,
    currency_code: String(row.currency || row.currency_code || defaults.currency_code || 'RUB').trim() || 'RUB',
    amount_rub: Number(row.amount_rub || amount) || amount,
    occurred_on: occurredOn || safeDate(nowIso()),
    booked_at: row.booked_at || row.bookedAt || null,
    description: String(row.description || '').trim(),
    note: String(row.note || '').trim(),
    route: String(row.route || '').trim(),
    external_transaction_id: String(row.external_id || row.transactionId || row.transaction_id || '').trim(),
    external_reference: String(row.reference || row.external_reference || row.documentNumber || '').trim(),
    linked_order_label: String(row.project_label || row.linked_order_label || row.dealId || '').trim(),
    linked_project_ref: String(row.project_id || row.linked_project_ref || row.dealId || '').trim(),
    imported_from: String(defaults.imported_from || row.imported_from || '').trim(),
    metadata_json: {
      ...((defaults.metadata_json && typeof defaults.metadata_json === 'object') ? defaults.metadata_json : {}),
      original: row,
    },
    raw_json: row,
  };
}

function mapRecurringTransactionToFinanceRuleRow(rule = {}) {
  const amount = Number(rule.amount || 0) || 0;
  const kind = normalizeTransactionType(rule.kind, rule);
  const legacyId = String(rule.id || '').trim();
  const sourceSlug = String(rule.source_slug || 'manual_finance').trim() || 'manual_finance';
  return {
    legacy_id: legacyId,
    rule_kind: 'recurring',
    name: String(rule.name || rule.description || legacyId || 'Recurring rule').trim(),
    description: String(rule.description || '').trim(),
    match_text: '',
    match_account_legacy_id: String(rule.account_id || rule.match_account_legacy_id || '').trim(),
    match_amount: amount || null,
    match_amount_sign: kind === 'income' ? 'income' : (kind === 'expense' ? 'expense' : ''),
    target_transaction_type: kind,
    target_note: String(rule.note || '').trim(),
    auto_apply: rule.auto_apply !== undefined ? !!rule.auto_apply : !!rule.active,
    priority: Number(rule.priority || 50) || 50,
    is_active: rule.active !== false,
    metadata_json: {
      source_slug: sourceSlug,
      cadence: String(rule.cadence || '').trim(),
      start_date: safeDate(rule.start_date || ''),
      day_of_month: Number(rule.day_of_month || 0) || null,
      legacy_category_id: String(rule.category_id || '').trim(),
      legacy_direction_id: String(rule.project_id || '').trim(),
      counterparty_name: String(rule.counterparty_name || '').trim(),
      original: rule,
    },
  };
}

async function fetchJson(pathname, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathname} failed ${res.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }
  return { data: parsed, headers: res.headers };
}

async function readSetting(key) {
  const q = `("${key}")`;
  const { data } = await fetchJson(`/rest/v1/settings?select=key,value,updated_at&key=in.${encodeURIComponent(q)}`);
  if (!Array.isArray(data) || !data[0]) return null;
  const row = data[0];
  try {
    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  } catch {
    return row.value;
  }
}

async function getSourceMap() {
  const { data } = await fetchJson('/rest/v1/finance_sources?select=id,slug');
  return new Map((Array.isArray(data) ? data : []).map(row => [row.slug, row.id]));
}

async function tableCount(table) {
  const { headers } = await fetchJson(`/rest/v1/${table}?select=*`, {
    headers: {
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const range = headers.get('content-range') || '*/0';
  const count = Number(String(range).split('/')[1] || 0) || 0;
  return count;
}

function dedupeBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()];
}

async function upsertRows(table, rows, onConflict, chunkSize = CHUNK_SIZE) {
  const payload = Array.isArray(rows) ? rows.filter(Boolean) : [];
  let affected = 0;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    await fetchJson(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      body: chunk,
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });
    affected += chunk.length;
    process.stdout.write(`upsert ${table}: ${Math.min(i + chunk.length, payload.length)}/${payload.length}\r`);
  }
  if (payload.length) process.stdout.write('\n');
  return affected;
}

async function findExistingBankSyncRun(run) {
  const params = new URLSearchParams({
    select: 'id',
    provider: `eq.${run.provider}`,
    imported_accounts_count: `eq.${String(run.imported_accounts_count || 0)}`,
    imported_transactions_count: `eq.${String(run.imported_transactions_count || 0)}`,
    order: 'id.asc',
    limit: '1',
  });
  if (run.date_from) params.set('date_from', `eq.${run.date_from}`);
  if (run.date_to) params.set('date_to', `eq.${run.date_to}`);
  const { data } = await fetchJson(`/rest/v1/bank_sync_runs?${params.toString()}`);
  return Array.isArray(data) && data[0] ? data[0].id : null;
}

async function ensureBankSyncRun(run) {
  const existingId = await findExistingBankSyncRun(run);
  if (existingId) return existingId;
  const payload = { ...run };
  delete payload.id;
  const { data } = await fetchJson('/rest/v1/bank_sync_runs', {
    method: 'POST',
    body: payload,
    headers: {
      Prefer: 'return=representation',
    },
  });
  return Array.isArray(data) && data[0] ? data[0].id : null;
}

async function findExistingLegacyImportRun(run) {
  const params = new URLSearchParams({
    select: 'id',
    source_system: `eq.${run.source_system}`,
    source_reference: `eq.${run.source_reference || ''}`,
    rows_count: `eq.${String(run.rows_count || 0)}`,
    order: 'id.asc',
    limit: '1',
  });
  if (run.date_from) params.set('date_from', `eq.${run.date_from}`);
  if (run.date_to) params.set('date_to', `eq.${run.date_to}`);
  const { data } = await fetchJson(`/rest/v1/legacy_finance_import_runs?${params.toString()}`);
  return Array.isArray(data) && data[0] ? data[0].id : null;
}

async function ensureLegacyImportRun(run) {
  const existingId = await findExistingLegacyImportRun(run);
  if (existingId) return existingId;
  const payload = { ...run };
  delete payload.id;
  const { data } = await fetchJson('/rest/v1/legacy_finance_import_runs', {
    method: 'POST',
    body: payload,
    headers: {
      Prefer: 'return=representation',
    },
  });
  return Array.isArray(data) && data[0] ? data[0].id : null;
}

function buildFinanceAccounts({ workspace, tochka, fintablo, sourceMap }) {
  const rows = [];
  for (const item of Array.isArray(workspace?.accounts) ? workspace.accounts : []) {
    const mapped = mapWorkspaceAccountToFinanceAccountRow(item);
    rows.push({
      legacy_id: mapped.legacy_id,
      source_id: sourceMap.get(mapped.source_slug) || null,
      account_kind: mapped.account_kind,
      currency_code: mapped.currency_code,
      name: mapped.name,
      owner_name: mapped.owner_name,
      external_account_id: mapped.external_account_id,
      account_number: mapped.account_number,
      bank_name: mapped.bank_name,
      bank_bic: mapped.bank_bic,
      is_hidden: mapped.is_hidden,
      is_active: mapped.is_active,
      sort_order: mapped.sort_order,
      metadata_json: mapped.metadata_json,
      updated_at: nowIso(),
    });
  }
  for (const item of Array.isArray(tochka?.accounts) ? tochka.accounts : []) {
    const mapped = mapSnapshotAccountToFinanceAccountRow(item, 'tochka_api');
    rows.push({
      legacy_id: mapped.legacy_id,
      source_id: sourceMap.get('tochka_api') || null,
      account_kind: mapped.account_kind,
      currency_code: mapped.currency_code,
      name: mapped.name,
      owner_name: mapped.owner_name,
      external_account_id: mapped.external_account_id,
      account_number: mapped.account_number,
      bank_name: mapped.bank_name,
      bank_bic: mapped.bank_bic,
      is_hidden: mapped.is_hidden,
      is_active: mapped.is_active,
      sort_order: mapped.sort_order,
      metadata_json: mapped.metadata_json,
      updated_at: nowIso(),
    });
  }
  for (const item of Array.isArray(fintablo?.accounts) ? fintablo.accounts : []) {
    const mapped = mapSnapshotAccountToFinanceAccountRow(item, 'legacy_fintablo');
    rows.push({
      legacy_id: mapped.legacy_id,
      source_id: sourceMap.get('legacy_fintablo') || null,
      account_kind: normalizeAccountKind(item.type),
      currency_code: mapped.currency_code,
      name: mapped.name,
      owner_name: mapped.owner_name,
      external_account_id: mapped.external_account_id,
      account_number: mapped.account_number,
      bank_name: mapped.bank_name,
      bank_bic: mapped.bank_bic,
      is_hidden: mapped.is_hidden,
      is_active: mapped.is_active,
      sort_order: mapped.sort_order,
      metadata_json: mapped.metadata_json,
      updated_at: nowIso(),
    });
  }
  return dedupeBy(rows, row => row.legacy_id);
}

function buildFinanceRules(workspace = {}) {
  return dedupeBy((Array.isArray(workspace.recurringTransactions) ? workspace.recurringTransactions : []).map(item => {
    const mapped = mapRecurringTransactionToFinanceRuleRow(item);
    return {
      legacy_id: mapped.legacy_id,
      rule_kind: mapped.rule_kind,
      name: mapped.name,
      description: mapped.description,
      match_text: mapped.match_text,
      match_account_legacy_id: mapped.match_account_legacy_id,
      match_amount: mapped.match_amount,
      match_amount_sign: mapped.match_amount_sign,
      target_transaction_type: mapped.target_transaction_type,
      target_category_id: null,
      target_direction_id: null,
      target_counterparty_id: null,
      target_note: mapped.target_note,
      auto_apply: mapped.auto_apply,
      priority: mapped.priority,
      is_active: mapped.is_active,
      metadata_json: mapped.metadata_json,
      updated_at: nowIso(),
    };
  }), row => row.legacy_id);
}

function buildFinanceTransactions(snapshot, defaults) {
  return dedupeBy((Array.isArray(snapshot?.transactions) ? snapshot.transactions : []).map(item => {
    const mapped = mapRawTransactionToFinanceRow(item, defaults);
    return {
      legacy_tx_key: mapped.legacy_tx_key,
      source_id: defaults.source_id || null,
      account_id: null,
      counterparty_id: null,
      category_id: null,
      direction_id: null,
      order_id: Number(item.order_id || 0) || null,
      employee_id: Number(item.employee_id || 0) || null,
      linked_order_label: mapped.linked_order_label,
      linked_project_ref: mapped.linked_project_ref,
      transaction_type: mapped.transaction_type,
      review_status: mapped.review_status,
      confidence: mapped.confidence,
      amount: mapped.amount,
      currency_code: mapped.currency_code,
      amount_rub: mapped.amount_rub,
      occurred_on: mapped.occurred_on,
      booked_at: mapped.booked_at,
      description: mapped.description,
      note: mapped.note,
      route: mapped.route,
      external_transaction_id: mapped.external_transaction_id,
      external_reference: mapped.external_reference,
      imported_from: mapped.imported_from,
      raw_json: mapped.raw_json,
      metadata_json: {
        legacy_account_id: mapped.legacy_account_id,
        legacy_category_id: mapped.legacy_category_id,
        legacy_direction_id: mapped.legacy_direction_id,
        legacy_counterparty_id: mapped.legacy_counterparty_id,
        ...mapped.metadata_json,
      },
      updated_at: nowIso(),
    };
  }), row => row.legacy_tx_key);
}

function buildBankAccounts(snapshot, syncRunId) {
  return dedupeBy((Array.isArray(snapshot?.accounts) ? snapshot.accounts : []).map(item => ({
    provider: 'tochka',
    sync_run_id: syncRunId,
    external_id: String(item.accountId || item.account_number || '').trim(),
    account_number: String(item.accountNumber || item.account_number || item.accountId || '').trim(),
    display_name: String(item.displayName || item.accountLabel || item.name || '').trim() || 'Счет',
    owner_name: String(item.ownerName || item.owner || '').trim(),
    currency_code: String(item.currency || 'RUB').trim() || 'RUB',
    bank_name: String(item.bank_name || item.bankName || 'Точка').trim(),
    bank_bic: String(item.bank_bic || item.bic || '').trim(),
    status: String(item.status || '').trim(),
    opened_at: safeDate(item.opened_at || item.openedAt || '') || null,
    closed_at: safeDate(item.closed_at || item.closedAt || '') || null,
    last_balance: Number(item.currentBalance || item.balance || item.last_balance || 0) || null,
    raw_json: item,
    last_seen_at: nowIso(),
  })), row => `${row.provider}:${row.external_id}`);
}

function buildBankTransactions(snapshot, syncRunId) {
  return dedupeBy((Array.isArray(snapshot?.transactions) ? snapshot.transactions : []).map(item => ({
    provider: 'tochka',
    sync_run_id: syncRunId,
    bank_account_id: null,
    finance_transaction_id: null,
    external_id: String(item.transactionId || item.external_id || financeLegacyTxKey(item, 'tochka-bank')).trim(),
    external_account_id: String(item.accountId || item.account_id || '').trim(),
    direction: String(item.direction === 'in' ? 'income' : (item.direction === 'out' ? 'expense' : String(item.direction || '').trim().toLowerCase())).trim(),
    amount: Number(item.amount || 0) || 0,
    currency_code: String(item.currency || 'RUB').trim() || 'RUB',
    booked_at: item.booked_at || null,
    occurred_on: safeDate(item.date || item.occurred_on || ''),
    description: String(item.description || '').trim(),
    counterparty_name: String(item.counterpartyName || item.counterparty_name || '').trim(),
    counterparty_inn: String(item.counterpartyInn || item.counterparty_inn || '').trim(),
    raw_json: item,
    updated_at: nowIso(),
  })), row => `${row.provider}:${row.external_id}`);
}

function buildLegacyTransactions(snapshot, importRunId) {
  return dedupeBy((Array.isArray(snapshot?.transactions) ? snapshot.transactions : []).map(item => ({
    import_run_id: importRunId,
    finance_transaction_id: null,
    legacy_account_id: String(item.accountId || item.account_id || '').trim(),
    legacy_transaction_id: String(item.transactionId || item.transaction_id || item.legacyTransactionId || financeLegacyTxKey(item, 'fintablo-legacy')).trim(),
    occurred_on: safeDate(item.date || item.occurred_on || ''),
    amount: Number(item.amount || 0) || 0,
    currency_code: String(item.currency || 'RUB').trim() || 'RUB',
    description: String(item.description || '').trim(),
    source_label: String(item.source || item.source_label || 'FinTablo').trim(),
    raw_json: item,
  })), row => `${row.import_run_id}:${row.legacy_transaction_id}`);
}

async function main() {
  const [workspace, tochka, fintablo] = await Promise.all([
    readSetting(SETTINGS_KEYS.workspace),
    readSetting(SETTINGS_KEYS.tochka),
    readSetting(SETTINGS_KEYS.fintablo),
  ]);

  const sourceMap = await getSourceMap();
  console.log('finance source map', Object.fromEntries(sourceMap));

  const before = {
    finance_accounts: await tableCount('finance_accounts'),
    finance_rules: await tableCount('finance_rules'),
    finance_transactions: await tableCount('finance_transactions'),
    bank_sync_runs: await tableCount('bank_sync_runs'),
    bank_accounts: await tableCount('bank_accounts'),
    bank_transactions: await tableCount('bank_transactions'),
    legacy_finance_import_runs: await tableCount('legacy_finance_import_runs'),
    legacy_finance_transactions: await tableCount('legacy_finance_transactions'),
  };
  console.log('before', before);

  const financeAccounts = buildFinanceAccounts({ workspace, tochka, fintablo, sourceMap });
  const financeRules = buildFinanceRules(workspace || {});

  const tochkaRunId = Number(new Date(tochka?.synced_at || Date.now()).getTime()) || Date.now();
  const legacyRunId = (Number(new Date(fintablo?.synced_at || Date.now()).getTime()) || Date.now()) + 1;

  const financeTransactionsTochka = buildFinanceTransactions(tochka, {
    prefix: 'tochka',
    source_slug: 'tochka_api',
    source_id: sourceMap.get('tochka_api') || null,
    imported_from: 'tochka_snapshot',
  });
  const financeTransactionsFintablo = buildFinanceTransactions(fintablo, {
    prefix: 'fintablo',
    source_slug: 'legacy_fintablo',
    source_id: sourceMap.get('legacy_fintablo') || null,
    imported_from: 'fintablo_snapshot',
  });
  const financeTransactions = dedupeBy(
    financeTransactionsTochka.concat(financeTransactionsFintablo),
    row => row.legacy_tx_key,
  );

  const bankAccounts = buildBankAccounts(tochka, tochkaRunId);
  const bankTransactions = buildBankTransactions(tochka, tochkaRunId);
  const legacyTransactions = buildLegacyTransactions(fintablo, legacyRunId);

  if (before.finance_accounts < financeAccounts.length) {
    await upsertRows('finance_accounts', financeAccounts, 'legacy_id');
  } else {
    console.log(`skip finance_accounts: ${before.finance_accounts}/${financeAccounts.length}`);
  }
  if (before.finance_rules < financeRules.length) {
    await upsertRows('finance_rules', financeRules, 'legacy_id');
  } else {
    console.log(`skip finance_rules: ${before.finance_rules}/${financeRules.length}`);
  }
  if (before.finance_transactions < financeTransactions.length) {
    await upsertRows('finance_transactions', financeTransactions, 'legacy_tx_key');
  } else {
    console.log(`skip finance_transactions: ${before.finance_transactions}/${financeTransactions.length}`);
  }

  const bankSyncRun = {
    provider: 'tochka',
    status: 'success',
    date_from: extractWindowDate(tochka?.window, 0) || safeDate(tochka?.range?.[0] || '') || null,
    date_to: extractWindowDate(tochka?.window, 1) || safeDate(tochka?.range?.[1] || '') || null,
    started_at: tochka?.synced_at || nowIso(),
    finished_at: tochka?.synced_at || nowIso(),
    imported_accounts_count: Number(Array.isArray(tochka?.accounts) ? tochka.accounts.length : 0),
    imported_transactions_count: Number(Array.isArray(tochka?.transactions) ? tochka.transactions.length : 0),
    request_json: { window: tochka?.window || tochka?.range || null },
    response_json: { stats: tochka?.stats || null, statementMeta: tochka?.statementMeta || null },
    error_text: '',
  };
  const resolvedBankSyncRunId = await ensureBankSyncRun(bankSyncRun);
  await upsertRows('bank_accounts', bankAccounts.map(row => ({ ...row, sync_run_id: resolvedBankSyncRunId })), 'provider,external_id');
  await upsertRows('bank_transactions', bankTransactions.map(row => ({ ...row, sync_run_id: resolvedBankSyncRunId })), 'provider,external_id');

  const legacyImportRun = {
    source_system: 'fintablo',
    imported_at: fintablo?.synced_at || nowIso(),
    date_from: extractWindowDate(fintablo?.window, 0) || safeDate(fintablo?.range?.[0] || '') || null,
    date_to: extractWindowDate(fintablo?.window, 1) || safeDate(fintablo?.range?.[1] || '') || null,
    rows_count: Number(Array.isArray(fintablo?.transactions) ? fintablo.transactions.length : 0),
    source_reference: 'fintablo_snapshot_json',
    payload_json: { stats: fintablo?.stats || null },
    notes: 'Backfilled from settings JSON snapshot',
  };
  const resolvedLegacyRunId = await ensureLegacyImportRun(legacyImportRun);

  await upsertRows('legacy_finance_transactions', legacyTransactions.map(row => ({ ...row, import_run_id: resolvedLegacyRunId })), 'import_run_id,legacy_transaction_id');

  const after = {
    finance_accounts: await tableCount('finance_accounts'),
    finance_rules: await tableCount('finance_rules'),
    finance_transactions: await tableCount('finance_transactions'),
    bank_sync_runs: await tableCount('bank_sync_runs'),
    bank_accounts: await tableCount('bank_accounts'),
    bank_transactions: await tableCount('bank_transactions'),
    legacy_finance_import_runs: await tableCount('legacy_finance_import_runs'),
    legacy_finance_transactions: await tableCount('legacy_finance_transactions'),
  };

  console.log('after', after);
  console.log('done');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
