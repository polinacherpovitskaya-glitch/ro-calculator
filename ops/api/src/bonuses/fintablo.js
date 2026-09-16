// План и факт по деньгам для страницы «Бонусы».
//
// План: три уровня (base / medium / aspiration) по кварталам из Google-таблицы
// владельца (публичный CSV-экспорт). Факт: «Поступления» по направлению
// Recycle Object (с поднаправлениями) из Финтабло, квартал со сдвигом на
// неделю. Используется и маршрутом POST /api/bonuses/sync/run (кнопка на
// странице), и воркфлоу scripts/bonuses-plan-fact-sync.mjs (по расписанию).

const FINTABLO_BASE_URL = 'https://api.fintablo.ru/v1';
export const DEFAULT_SHEET_ID = '1dnhNPr-iHW82c7gsBKr9lLyF9tzKyb509nDawj5xmow';
export const DEFAULT_DIRECTION_NAME = 'Recycle Object';
const TIER_LABELS = {
  base: ['base', 'crisis/base', 'crisis', 'min'],
  medium: ['medium', 'mid', 'target'],
  aspiration: ['aspiration', 'max'],
};

export function parseMoney(raw) {
  const cleaned = String(raw ?? '')
    .replace(/^[^\d-]+/, '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') { quoted = false; } else { field += ch; }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function tierOfLabel(label) {
  const key = String(label || '').trim().toLowerCase();
  if (!key) return null;
  for (const [tier, aliases] of Object.entries(TIER_LABELS)) {
    if (aliases.some((alias) => key === alias || key.endsWith(`/${alias}`))) return tier;
  }
  return null;
}

// Ищет блок года (строка, где первая ячейка = год) и читает строки base / medium /
// aspiration: четыре квартала в первых четырёх ячейках, метка в последней непустой.
export function parsePlanCsv(csvText, year) {
  const rows = parseCsv(csvText);
  const start = rows.findIndex((r) => String(r[0] || '').trim() === String(year));
  if (start < 0) return null;
  const tiers = {};
  for (let i = start + 1; i < rows.length; i += 1) {
    const cells = rows[i].map((c) => String(c || '').trim());
    if (cells.every((c) => !c)) {
      if (Object.keys(tiers).length) break;
      continue;
    }
    if (/^\d{4}$/.test(cells[0]) && cells.slice(1).every((c) => !c)) break;
    const label = [...cells].reverse().find((c) => c);
    const tier = tierOfLabel(label);
    if (!tier) continue;
    const quarters = cells.slice(0, 4).map(parseMoney);
    if (quarters.some((v) => v > 0)) tiers[tier] = quarters;
  }
  return tiers.base && tiers.medium && tiers.aspiration ? tiers : null;
}

// base не выше medium, aspiration не ниже medium (в таблице бывают опечатки).
export function tiersToPeriods(year, tiers) {
  const out = {};
  for (let q = 0; q < 4; q += 1) {
    const target = tiers.medium[q];
    if (!(target > 0)) continue;
    out[`${year}-Q${q + 1}`] = {
      min: Math.min(tiers.base[q] || target, target),
      target,
      max: Math.max(tiers.aspiration[q] || target, target),
    };
  }
  return out;
}

// Квартал по деньгам считается со сдвигом на неделю: деньги приходят не в срок,
// поэтому III квартал это 8 июля – 7 октября. Сдвиг только для денег, часы
// производства остаются по календарному кварталу.
export const MONEY_QUARTER_SHIFT_DAYS = 7;

export function quarterOfDate(ymd, shiftDays = MONEY_QUARTER_SHIFT_DAYS) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - shiftDays);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function moneyQuarterWindow(period, shiftDays = MONEY_QUARTER_SHIFT_DAYS) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(period || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const from = new Date(Date.UTC(year, (q - 1) * 3, 1 + shiftDays));
  const to = new Date(Date.UTC(year, q * 3, shiftDays));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function parseFintabloDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
}

// Направление и все его поднаправления (в отчёте Финтабло они сворачиваются в
// колонку родителя, а операции привязаны к листьям).
export function directionTreeIds(directions, rootId) {
  const ids = new Set([String(rootId)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of directions) {
      const parent = String(d?.parentId ?? '');
      const id = String(d?.id ?? '');
      if (id && !ids.has(id) && ids.has(parent)) { ids.add(id); grew = true; }
    }
  }
  return ids;
}

function isRealParent(value) {
  const s = String(value ?? '').trim();
  return s !== '' && s !== '0' && s !== 'null';
}

// Поступления (group = income) направления по кварталам. Родительские операции,
// разнесённые на части (parentId у детей), не считаются второй раз.
export function sumIncomeByQuarter(transactions, directionIds) {
  const wanted = directionIds instanceof Set ? directionIds : new Set([String(directionIds)]);
  const parents = new Set(transactions.filter((t) => isRealParent(t?.parentId)).map((t) => String(t.parentId).trim()));
  const sums = {};
  for (const t of transactions) {
    if (String(t?.group || '').trim() !== 'income') continue;
    if (t?.isPlan) continue;
    if (!wanted.has(String(t?.directionId ?? '').trim())) continue;
    if (parents.has(String(t?.id || '').trim())) continue;
    const period = quarterOfDate(parseFintabloDate(t?.date));
    if (!period) continue;
    sums[period] = (sums[period] || 0) + Math.abs(Number(t?.value || 0));
  }
  for (const key of Object.keys(sums)) sums[key] = Math.round(sums[key] * 100) / 100;
  return sums;
}

export function buildPayload({ targetsByPeriod, factsByPeriod, note }) {
  const periods = {};
  for (const [period, thresholds] of Object.entries(targetsByPeriod || {})) {
    periods[period] = { ...(periods[period] || {}), targets: { cash_in: thresholds } };
  }
  for (const [period, value] of Object.entries(factsByPeriod || {})) {
    periods[period] = { ...(periods[period] || {}), fact: { value, source: 'fintablo', note } };
  }
  return { periods };
}

async function fintabloGet(token, pathname, params = {}) {
  const url = new URL(`${FINTABLO_BASE_URL}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FinTablo GET ${pathname} -> ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function loadPaged(token, pathname, params = {}, pageSize = 500) {
  const all = [];
  let page = 1;
  while (true) {
    const response = await fintabloGet(token, pathname, { ...params, page, pageSize });
    const items = Array.isArray(response?.items) ? response.items : (Array.isArray(response) ? response : []);
    all.push(...items);
    if (items.length < pageSize) break;
    page += 1;
  }
  return all;
}

function toFintabloDate(ymd) {
  return `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;
}

export async function fetchPlan({ sheetId = DEFAULT_SHEET_ID, gid = '0', year }) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Sheet export -> ${response.status}`);
  const csv = await response.text();
  const tiers = parsePlanCsv(csv, year);
  if (!tiers) throw new Error(`План на ${year} не найден в таблице (нужны строки base / medium / aspiration под строкой «${year}»)`);
  return tiersToPeriods(year, tiers);
}

export async function fetchFacts({ token, directionName = DEFAULT_DIRECTION_NAME, year, today }) {
  const directions = await loadPaged(token, '/direction', {});
  const wanted = String(directionName).trim().toLowerCase();
  const direction = directions.find((d) => String(d?.name || '').trim().toLowerCase() === wanted)
    || directions.find((d) => String(d?.name || '').trim().toLowerCase().includes(wanted));
  if (!direction) {
    throw new Error(`Направление «${directionName}» не найдено в Финтабло. Есть: ${directions.map((d) => d?.name).join(', ')}`);
  }
  const transactions = await loadPaged(token, '/transaction', {
    isPlan: 0,
    dateFrom: toFintabloDate(moneyQuarterWindow(`${year}-Q1`).from),
    dateTo: toFintabloDate(today),
  });
  const ids = directionTreeIds(directions, direction.id);
  const names = directions.filter((d) => ids.has(String(d.id))).map((d) => d.name);
  return {
    directionId: direction.id, directionName: direction.name, directionIds: [...ids], directionNames: names,
    sums: sumIncomeByQuarter(transactions, ids), count: transactions.length,
  };
}

// Полный прогон: план из таблицы + факт из Финтабло → payload для записи.
export async function runMoneySync({ token, year, today, sheetId, gid, directionName, log = () => {} }) {
  const targetsByPeriod = await fetchPlan({ sheetId, gid, year });
  let factsByPeriod = {};
  let note = '';
  let facts = null;
  if (token) {
    facts = await fetchFacts({ token, directionName, year, today });
    factsByPeriod = facts.sums;
    note = `Финтабло, поступления «${facts.directionName}», квартал со сдвигом +7 дней, синк ${today}`;
    log(`FinTablo: ${facts.count} операций с начала года, направление ${facts.directionName} (#${facts.directionId}) с поднаправлениями: ${facts.directionNames.join(', ')}`);
    log(`Факт по кварталам: ${JSON.stringify(facts.sums)}`);
  } else {
    log('FINTABLO_API_KEY не задан: факт не синкается, только план');
  }
  return { payload: buildPayload({ targetsByPeriod, factsByPeriod, note }), facts, targetsByPeriod };
}
