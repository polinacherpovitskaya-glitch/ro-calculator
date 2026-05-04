#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';
const API_BASE = `${SUPABASE_URL}/rest/v1`;
const PAGE_SIZE = 500;
const UPSERT_BATCH = 250;
const DRY_RUN = process.argv.includes('--dry-run');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

function safeDate(value, fallback = '') {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 10) : fallback;
}

function financeLegacyTxKey(row = {}, prefix = 'finance') {
  const explicit = String(row.legacy_tx_key || row.tx_key || row.external_id || row.transaction_id || row.id || '').trim();
  if (explicit) return explicit;
  const accountId = String(row.accountId || row.account_id || row.external_account_id || '').trim();
  const date = safeDate(row.date || row.occurred_on || row.booked_at || '');
  const amount = Number(row.amount || row.amount_rub || 0) || 0;
  const description = String(row.description || row.note || '').trim().slice(0, 120);
  return [prefix, accountId, date, amount.toFixed(2), description].join(':');
}

function normalizeCategoryGroup(group = '') {
  const normalized = String(group || '').trim().toLowerCase();
  if (normalized === 'income') return 'income';
  if (normalized === 'direct') return 'direct';
  if (normalized === 'payroll') return 'payroll';
  if (normalized === 'taxes' || normalized === 'tax') return 'tax';
  if (normalized === 'investment' || normalized === 'asset') return 'asset';
  if (normalized === 'finance' || normalized === 'transfer') return 'transfer';
  if (normalized === 'charity') return 'charity';
  if (['commercial', 'overhead', 'opex'].includes(normalized)) return 'opex';
  return 'other';
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: headers(options.headers),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${path}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function loadAll(table, query = 'select=*', order = '&order=id.asc') {
  const rows = [];
  let offset = 0;
  while (true) {
    const pagination = `&limit=${PAGE_SIZE}&offset=${offset}`;
    const batch = await rest(`/${table}?${query}${order}${pagination}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function getSettingJson(key) {
  const rows = await rest(`/settings?key=eq.${encodeURIComponent(key)}&select=value`);
  const value = rows?.[0]?.value;
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function upsertRows(table, rows, onConflict = 'id', batchSize = UPSERT_BATCH) {
  if (!rows.length) return 0;
  if (DRY_RUN) return rows.length;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize).map(row => {
      if (onConflict === 'id') return row;
      const next = { ...row };
      delete next.id;
      return next;
    });
    await rest(`/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    total += chunk.length;
  }
  return total;
}

async function patchRowsById(table, rows) {
  if (!rows.length) return 0;
  if (DRY_RUN) return rows.length;
  let total = 0;
  for (const row of rows) {
    const id = row.id;
    const payload = { ...row };
    delete payload.id;
    await rest(`/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    total += 1;
  }
  return total;
}

function mapSources(workspace) {
  const list = Array.isArray(workspace?.sources) ? workspace.sources : [];
  return list
    .map(item => ({
      slug: String(item.id || item.slug || '').trim(),
      source_type: String(item.kind || item.type || 'internal').includes('bank') ? 'bank' : (String(item.kind || item.type || '') === 'legacy_import' ? 'legacy_import' : 'internal'),
      provider: String(item.id || item.slug || 'app').trim() || 'app',
      name: String(item.name || item.id || 'Источник').trim(),
      is_active: String(item.status || '').trim().toLowerCase() !== 'archived',
      settings_json: { original: item },
    }))
    .filter(item => item.slug);
}

function mapCategories(workspace) {
  const list = Array.isArray(workspace?.categories) ? workspace.categories : [];
  return list
    .map(item => ({
      legacy_id: String(item.id || '').trim(),
      code: String(item.mapping || '').trim() || null,
      name: String(item.name || '').trim() || 'Статья',
      category_group: normalizeCategoryGroup(item.group),
      bucket: String(item.bucket || 'general').trim() || 'general',
      color: String(item.color || '').trim(),
      is_system: !!item.is_system,
      is_active: item.active !== false,
      sort_order: Number(item.sort_order || 0) || 0,
      metadata_json: {
        source_id: String(item.source_id || '').trim(),
        original: item,
      },
    }))
    .filter(item => item.legacy_id);
}

function mapDirections(workspace) {
  const list = Array.isArray(workspace?.projects) ? workspace.projects : [];
  return list
    .map(item => ({
      legacy_id: String(item.id || '').trim(),
      code: String(item.code || '').trim() || null,
      name: String(item.name || '').trim() || 'Направление',
      level_num: Number(item.level_num || 1) || 1,
      is_active: item.active !== false,
      sort_order: Number(item.sort_order || 0) || 0,
      metadata_json: {
        project_type: String(item.type || '').trim(),
        original: item,
      },
    }))
    .filter(item => item.legacy_id);
}

function mapCounterparties(workspace) {
  const list = Array.isArray(workspace?.counterparties) ? workspace.counterparties : [];
  return list
    .map(item => ({
      legacy_id: String(item.id || '').trim(),
      name: String(item.name || '').trim() || 'Контрагент',
      legal_name: String(item.legal_name || '').trim(),
      counterparty_type: 'company',
      inn: String(item.inn || '').trim(),
      kpp: String(item.kpp || '').trim(),
      ogrn: String(item.ogrn || '').trim(),
      country_code: String(item.country_code || '').trim(),
      notes: String(item.note || '').trim(),
      metadata_json: {
        role: String(item.role || '').trim(),
        match_hint: String(item.match_hint || '').trim(),
        default_project_id: String(item.default_project_id || '').trim(),
        default_category_id: String(item.default_category_id || '').trim(),
        original: item,
      },
    }))
    .filter(item => item.legacy_id);
}

function buildLookup({ sources, accounts, categories, directions, counterparties, bankAccounts, financeTransactions }) {
  const sourceBySlug = new Map();
  const accountByLegacyId = new Map();
  const accountByExternal = new Map();
  const categoryByLegacyId = new Map();
  const directionByLegacyId = new Map();
  const counterpartyByLegacyId = new Map();
  const counterpartyByInn = new Map();
  const counterpartyByName = new Map();
  const bankAccountByProviderExternal = new Map();
  const financeTxByLegacyKey = new Map();
  const financeTxByExternalId = new Map();

  for (const row of sources) {
    const slug = String(row.slug || '').trim();
    if (slug) sourceBySlug.set(slug, row);
  }
  for (const row of accounts) {
    const legacyId = String(row.legacy_id || '').trim();
    const external = String(row.external_account_id || row.account_number || '').trim();
    const externalDigits = digitsOnly(external);
    if (legacyId) accountByLegacyId.set(legacyId, row);
    if (external) accountByExternal.set(external, row);
    if (externalDigits) accountByExternal.set(externalDigits, row);
  }
  for (const row of categories) {
    const legacyId = String(row.legacy_id || '').trim();
    if (legacyId) categoryByLegacyId.set(legacyId, row);
  }
  for (const row of directions) {
    const legacyId = String(row.legacy_id || '').trim();
    if (legacyId) directionByLegacyId.set(legacyId, row);
  }
  for (const row of counterparties) {
    const legacyId = String(row.legacy_id || '').trim();
    const inn = String(row.inn || '').trim();
    const name = normalizeText(row.name || '');
    const legal = normalizeText(row.legal_name || '');
    const metadata = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
    const matchHint = normalizeText(metadata.match_hint || '');
    if (legacyId) counterpartyByLegacyId.set(legacyId, row);
    if (inn) counterpartyByInn.set(inn, row);
    if (name) counterpartyByName.set(name, row);
    if (legal) counterpartyByName.set(legal, row);
    if (matchHint) counterpartyByName.set(matchHint, row);
  }
  for (const row of bankAccounts) {
    const provider = String(row.provider || 'tochka').trim() || 'tochka';
    const external = String(row.external_id || row.account_number || '').trim();
    const externalDigits = digitsOnly(external);
    if (external) bankAccountByProviderExternal.set(`${provider}::${external}`, row);
    if (externalDigits) bankAccountByProviderExternal.set(`${provider}::${externalDigits}`, row);
  }
  for (const row of financeTransactions) {
    const legacyKey = String(row.legacy_tx_key || '').trim();
    const externalId = String(row.external_transaction_id || '').trim();
    if (legacyKey) financeTxByLegacyKey.set(legacyKey, row);
    if (externalId) financeTxByExternalId.set(externalId, row);
  }

  return {
    sourceBySlug,
    accountByLegacyId,
    accountByExternal,
    categoryByLegacyId,
    directionByLegacyId,
    counterpartyByLegacyId,
    counterpartyByInn,
    counterpartyByName,
    bankAccountByProviderExternal,
    financeTxByLegacyKey,
    financeTxByExternalId,
  };
}

function sourceIdFor(lookup, slug) {
  return lookup.sourceBySlug.get(String(slug || '').trim())?.id ?? null;
}

function accountIdFor(lookup, row = {}) {
  const legacyId = String(row.legacy_account_id || row.account_id || row.accountId || '').trim();
  if (legacyId && lookup.accountByLegacyId.has(legacyId)) return lookup.accountByLegacyId.get(legacyId).id;
  const external = String(row.external_account_id || row.account_number || row.accountId || row.bankNumber || '').trim();
  const externalDigits = digitsOnly(external);
  if (external && lookup.accountByExternal.has(external)) return lookup.accountByExternal.get(external).id;
  if (externalDigits && lookup.accountByExternal.has(externalDigits)) return lookup.accountByExternal.get(externalDigits).id;
  return null;
}

function categoryIdFor(lookup, row = {}) {
  const legacyId = String(row.legacy_category_id || row.category_id || row.categoryId || '').trim();
  return legacyId && lookup.categoryByLegacyId.has(legacyId) ? lookup.categoryByLegacyId.get(legacyId).id : null;
}

function directionIdFor(lookup, row = {}) {
  const legacyId = String(row.legacy_direction_id || row.direction_id || row.directionId || row.project_id || '').trim();
  return legacyId && lookup.directionByLegacyId.has(legacyId) ? lookup.directionByLegacyId.get(legacyId).id : null;
}

function counterpartyIdFor(lookup, row = {}) {
  const legacyId = String(row.legacy_counterparty_id || row.counterparty_id || row.counterpartyId || '').trim();
  if (legacyId && lookup.counterpartyByLegacyId.has(legacyId)) return lookup.counterpartyByLegacyId.get(legacyId).id;
  const inn = String(row.counterparty_inn || row.counterpartyInn || row.inn || '').trim();
  if (inn && lookup.counterpartyByInn.has(inn)) return lookup.counterpartyByInn.get(inn).id;
  const normalized = normalizeText(row.counterparty_name || row.counterpartyName || '');
  if (normalized && lookup.counterpartyByName.has(normalized)) return lookup.counterpartyByName.get(normalized).id;
  return null;
}

function financeTxIdFor(lookup, row = {}, prefix = 'finance') {
  const externalId = String(row.external_id || row.external_transaction_id || row.transaction_id || '').trim();
  if (externalId && lookup.financeTxByExternalId.has(externalId)) return lookup.financeTxByExternalId.get(externalId).id;
  const legacyKey = financeLegacyTxKey(row, prefix);
  return lookup.financeTxByLegacyKey.get(legacyKey)?.id ?? null;
}

function bankAccountIdFor(lookup, provider, row = {}) {
  const providerSlug = String(provider || row.provider || 'tochka').trim() || 'tochka';
  const external = String(row.external_account_id || row.accountId || row.account_id || row.account_number || '').trim();
  const externalDigits = digitsOnly(external);
  if (external && lookup.bankAccountByProviderExternal.has(`${providerSlug}::${external}`)) {
    return lookup.bankAccountByProviderExternal.get(`${providerSlug}::${external}`).id;
  }
  if (externalDigits && lookup.bankAccountByProviderExternal.has(`${providerSlug}::${externalDigits}`)) {
    return lookup.bankAccountByProviderExternal.get(`${providerSlug}::${externalDigits}`).id;
  }
  return null;
}

function loadDefaultFinanceWorkspace() {
  const financePath = path.join(__dirname, '..', 'js', 'finance.js');
  const code = fs.readFileSync(financePath, 'utf8');
  const context = {
    console,
    Math,
    Date,
    JSON,
    Intl,
    App: {
      settings: {
        company_bank_name: 'ООО "Банк Точка"',
        company_bank_account: '40802810902500136756',
      },
      toast() {},
    },
    formatRub(value) {
      const num = Number(value) || 0;
      return `${num.toLocaleString('ru-RU')} ₽`;
    },
  };
  context.window = context;
  const vmContext = vm.createContext(context);
  vm.runInContext(code, vmContext, { filename: 'js/finance.js' });
  return vm.runInContext('Finance._defaultWorkspace(App.settings)', vmContext);
}

async function main() {
  const storedWorkspace = await getSettingJson('finance_workspace_json');
  if (!storedWorkspace || typeof storedWorkspace !== 'object') {
    throw new Error('finance_workspace_json not found');
  }
  const defaultWorkspace = loadDefaultFinanceWorkspace();
  const workspace = {
    ...defaultWorkspace,
    ...storedWorkspace,
    sources: Array.isArray(storedWorkspace.sources) && storedWorkspace.sources.length ? storedWorkspace.sources : defaultWorkspace.sources,
    categories: Array.isArray(storedWorkspace.categories) && storedWorkspace.categories.length ? storedWorkspace.categories : defaultWorkspace.categories,
    projects: Array.isArray(storedWorkspace.projects) && storedWorkspace.projects.length ? storedWorkspace.projects : defaultWorkspace.projects,
    counterparties: Array.isArray(storedWorkspace.counterparties) && storedWorkspace.counterparties.length ? storedWorkspace.counterparties : defaultWorkspace.counterparties,
  };

  const sourcesPayload = mapSources(workspace);
  const categoriesPayload = mapCategories(workspace);
  const directionsPayload = mapDirections(workspace);
  const counterpartiesPayload = mapCounterparties(workspace);

  const seededCounts = {
    sources: await upsertRows('finance_sources', sourcesPayload, 'slug'),
    categories: await upsertRows('finance_categories', categoriesPayload, 'legacy_id'),
    directions: await upsertRows('finance_directions', directionsPayload, 'legacy_id'),
    counterparties: await upsertRows('finance_counterparties', counterpartiesPayload, 'legacy_id'),
  };

  const [sources, accounts, categories, directions, counterparties, bankAccounts, financeTransactions, financeRules, bankTransactions, legacyTransactions] = await Promise.all([
    loadAll('finance_sources', 'select=id,slug'),
    loadAll('finance_accounts', 'select=id,legacy_id,source_id,account_kind,currency_code,name,owner_name,external_account_id,account_number,bank_name,bank_bic,is_hidden,is_active,sort_order,metadata_json,created_at,updated_at'),
    loadAll('finance_categories', 'select=id,legacy_id'),
    loadAll('finance_directions', 'select=id,legacy_id'),
    loadAll('finance_counterparties', 'select=id,legacy_id,inn,name,legal_name,metadata_json'),
    loadAll('bank_accounts', 'select=id,provider,external_id,account_number'),
    loadAll('finance_transactions', 'select=id,legacy_tx_key,source_id,account_id,counterparty_id,category_id,direction_id,order_id,employee_id,linked_order_label,linked_project_ref,transaction_type,review_status,confidence,amount,currency_code,amount_rub,occurred_on,booked_at,description,note,route,external_transaction_id,external_reference,imported_from,raw_json,metadata_json,created_at,updated_at'),
    loadAll('finance_rules', 'select=id,legacy_id,target_category_id,target_direction_id,target_counterparty_id,metadata_json'),
    loadAll('bank_transactions', 'select=id,provider,sync_run_id,bank_account_id,finance_transaction_id,external_id,external_account_id,direction,amount,currency_code,booked_at,occurred_on,description,counterparty_name,counterparty_inn,raw_json,created_at,updated_at'),
    loadAll('legacy_finance_transactions', 'select=id,import_run_id,finance_transaction_id,legacy_account_id,legacy_transaction_id,occurred_on,amount,currency_code,description,source_label,raw_json'),
  ]);

  const lookup = buildLookup({
    sources,
    accounts,
    categories,
    directions,
    counterparties,
    bankAccounts,
    financeTransactions,
  });

  const accountUpdates = accounts
    .map(row => {
      const metadata = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
      const sourceSlug = String(metadata.source_slug || '').trim();
      const sourceId = sourceIdFor(lookup, sourceSlug);
      if (!sourceId || String(row.source_id || '') === String(sourceId)) return null;
      return { ...row, source_id: sourceId };
    })
    .filter(Boolean);

  const ruleUpdates = financeRules
    .map(row => {
      const metadata = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
      const target_category_id = categoryIdFor(lookup, { legacy_category_id: metadata.legacy_category_id });
      const target_direction_id = directionIdFor(lookup, { legacy_direction_id: metadata.legacy_direction_id });
      const target_counterparty_id = counterpartyIdFor(lookup, {
        legacy_counterparty_id: metadata.legacy_counterparty_id,
        counterparty_name: metadata.counterparty_name,
      });
      if (
        String(row.target_category_id || '') === String(target_category_id || '')
        && String(row.target_direction_id || '') === String(target_direction_id || '')
        && String(row.target_counterparty_id || '') === String(target_counterparty_id || '')
      ) {
        return null;
      }
      return {
        id: row.id,
        target_category_id,
        target_direction_id,
        target_counterparty_id,
      };
    })
    .filter(Boolean);

  const financeTxUpdates = financeTransactions
    .map(row => {
      const metadata = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
      const raw = row.raw_json && typeof row.raw_json === 'object' ? row.raw_json : (metadata.original && typeof metadata.original === 'object' ? metadata.original : {});
      const next = {
        ...row,
        source_id: sourceIdFor(lookup, String(metadata.source_slug || row.source_slug || '').trim() || (
          String(row.imported_from || '').trim() === 'tochka_snapshot'
            ? 'tochka_api'
            : (String(row.imported_from || '').trim() === 'fintablo_snapshot' ? 'legacy_fintablo' : '')
        )),
        account_id: accountIdFor(lookup, {
          legacy_account_id: metadata.legacy_account_id || raw.accountId || raw.account_id,
          external_account_id: raw.external_account_id || raw.accountId || raw.account_number,
          account_number: raw.account_number || raw.accountNumber,
          accountId: raw.accountId,
          bankNumber: raw.bankNumber,
        }),
        category_id: categoryIdFor(lookup, {
          legacy_category_id: metadata.legacy_category_id || raw.category_id || raw.categoryId,
        }),
        direction_id: directionIdFor(lookup, {
          legacy_direction_id: metadata.legacy_direction_id || raw.direction_id || raw.directionId || raw.project_id,
        }),
        counterparty_id: counterpartyIdFor(lookup, {
          legacy_counterparty_id: metadata.legacy_counterparty_id || raw.counterparty_id || raw.counterpartyId,
          counterparty_name: raw.counterpartyName || raw.counterparty_name,
          counterparty_inn: raw.counterpartyInn || raw.counterparty_inn,
        }),
      };
      if (
        String(row.source_id || '') === String(next.source_id || '')
        && String(row.account_id || '') === String(next.account_id || '')
        && String(row.category_id || '') === String(next.category_id || '')
        && String(row.direction_id || '') === String(next.direction_id || '')
        && String(row.counterparty_id || '') === String(next.counterparty_id || '')
      ) {
        return null;
      }
      return next;
    })
    .filter(Boolean);

  const bankTxUpdates = bankTransactions
    .map(row => {
      const raw = row.raw_json && typeof row.raw_json === 'object' ? row.raw_json : {};
      const bank_account_id = bankAccountIdFor(lookup, row.provider, {
        external_account_id: row.external_account_id || raw.accountId || raw.account_id || raw.account_number,
      });
      const finance_transaction_id = financeTxIdFor(lookup, raw, row.provider || 'tochka');
      if (
        String(row.bank_account_id || '') === String(bank_account_id || '')
        && String(row.finance_transaction_id || '') === String(finance_transaction_id || '')
      ) {
        return null;
      }
      return {
        ...row,
        bank_account_id,
        finance_transaction_id,
      };
    })
    .filter(Boolean);

  const legacyTxUpdates = legacyTransactions
    .map(row => {
      const raw = row.raw_json && typeof row.raw_json === 'object' ? row.raw_json : {};
      const finance_transaction_id = financeTxIdFor(lookup, raw, 'fintablo');
      if (String(row.finance_transaction_id || '') === String(finance_transaction_id || '')) return null;
      return {
        ...row,
        finance_transaction_id,
      };
    })
    .filter(Boolean);

  const updateCounts = {
    accounts: await patchRowsById('finance_accounts', accountUpdates),
    rules: await patchRowsById('finance_rules', ruleUpdates),
    financeTransactions: await upsertRows('finance_transactions', financeTxUpdates, 'legacy_tx_key', 100),
    bankTransactions: await upsertRows('bank_transactions', bankTxUpdates, 'provider,external_id', 100),
    legacyTransactions: await upsertRows('legacy_finance_transactions', legacyTxUpdates, 'import_run_id,legacy_transaction_id'),
  };

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    seededCounts,
    loadedCounts: {
      sources: sources.length,
      accounts: accounts.length,
      categories: categories.length,
      directions: directions.length,
      counterparties: counterparties.length,
      bankAccounts: bankAccounts.length,
      financeTransactions: financeTransactions.length,
      financeRules: financeRules.length,
      bankTransactions: bankTransactions.length,
      legacyTransactions: legacyTransactions.length,
    },
    updateCounts,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
