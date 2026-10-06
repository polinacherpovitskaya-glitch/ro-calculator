// План и факт по деньгам для страницы «Бонусы».
//
// План: три уровня (base / medium / aspiration) по кварталам из Google-таблицы
// владельца (публичный CSV-экспорт). Факт: «Поступления» из Финтабло по
// направлениям Recycle Object (корпоративные заказы, интернет-магазин,
// воркшопы) и Маркетплейсы (Озон), квартал закрывается 5-го числа. Так же
// считает квартал коммерческий директор. Используется и маршрутом
// POST /api/bonuses/sync/run (кнопка на странице), и воркфлоу
// scripts/bonuses-plan-fact-sync.mjs (по расписанию).

import { QUARTER_SHIFT_DAYS } from './calc.js';

const FINTABLO_BASE_URL = 'https://api.fintablo.ru/v1';
export const DEFAULT_SHEET_ID = '1dnhNPr-iHW82c7gsBKr9lLyF9tzKyb509nDawj5xmow';
// Несколько направлений через запятую (так же читается FINTABLO_DIRECTION).
export const DEFAULT_DIRECTION_NAME = 'Recycle Object, Маркетплейсы';
// Статьи поступлений, которые не выручка: возвраты банка за подписки и т.п.
export const EXCLUDED_CATEGORY_NAMES = ['Прочие поступл. от фин. операций'];
// Поднаправление проектов без собственного производства. Их деньги входят в
// деньги компании, но не в денежный уровень ставки за часы.
export const DEFAULT_OUTSOURCE_DIRECTION_NAME = 'Подряд';
// Разделы ОПиУ, которые не считаются расходами проекта: налоги считаются
// отдельно долей от оплаты, дивиденды и премии идут ниже прибыли.
const NON_PROJECT_PNL_TYPES = new Set(['outcome-under-ebitda', 'income-under-ebitda', 'under-profit']);
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

// Квартал по деньгам закрывается 5-го числа, как у часов (calc.js):
// III квартал это 6 июля – 5 октября.
export const MONEY_QUARTER_SHIFT_DAYS = QUARTER_SHIFT_DAYS;

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

function asIdSet(values) {
  return new Set([...(values || [])].map((v) => String(v)));
}

// Разнесённая операция приходит из списка с частями внутри `subs`: у частей
// своя статья, направление и сделка, поэтому считаем части, а не родителя.
export function expandSubs(transactions) {
  const out = [];
  for (const t of transactions || []) {
    const subs = Array.isArray(t?.subs) ? t.subs : [];
    if (!subs.length) {
      out.push(t);
      continue;
    }
    for (const sub of subs) out.push({ ...sub, date: t.date, group: t.group, isPlan: t.isPlan, parentId: t.id });
  }
  return out;
}

// Поступления (group = income) направлений по кварталам. Родительские операции,
// разнесённые на части (parentId у детей), не считаются второй раз. Статьи из
// excludedCategoryIds (не выручка) пропускаются; excludedDirectionIds и
// excludedDealIds убирают подрядные проекты из денег производства.
export function sumIncomeByQuarter(transactions, directionIds, {
  excludedCategoryIds = new Set(), excludedDirectionIds = new Set(), excludedDealIds = new Set(),
} = {}) {
  const wanted = directionIds instanceof Set ? directionIds : new Set([String(directionIds)]);
  const excluded = asIdSet(excludedCategoryIds);
  const skipDirections = asIdSet(excludedDirectionIds);
  const skipDeals = asIdSet(excludedDealIds);
  const rows = expandSubs(transactions);
  const parents = new Set(rows.filter((t) => isRealParent(t?.parentId)).map((t) => String(t.parentId).trim()));
  const sums = {};
  for (const t of rows) {
    if (String(t?.group || '').trim() !== 'income') continue;
    if (t?.isPlan) continue;
    if (!wanted.has(String(t?.directionId ?? '').trim())) continue;
    if (excluded.has(String(t?.categoryId ?? '').trim())) continue;
    if (skipDirections.has(String(t?.directionId ?? '').trim())) continue;
    if (skipDeals.has(String(t?.dealId ?? '').trim())) continue;
    if (parents.has(String(t?.id || '').trim())) continue;
    const period = quarterOfDate(parseFintabloDate(t?.date));
    if (!period) continue;
    sums[period] = (sums[period] || 0) + Math.abs(Number(t?.value || 0));
  }
  for (const key of Object.keys(sums)) sums[key] = Math.round(sums[key] * 100) / 100;
  return sums;
}

// Подрядные проекты: сделки направления «Подряд». По каждой: сумма сделки,
// сколько клиент заплатил, прямые расходы (всё, что привязано к сделке, кроме
// налогового раздела и распределения прибыли) и квартал закрытия (квартал
// последней оплаты, когда оплачено полностью).
export function outsourcedProjects({ transactions, deals, categories, directionIds }) {
  const dirs = asIdSet(directionIds);
  const skipCategories = new Set((categories || [])
    .filter((c) => NON_PROJECT_PNL_TYPES.has(String(c?.pnlType || '')))
    .map((c) => String(c.id)));
  const projects = new Map();
  for (const deal of deals || []) {
    if (!dirs.has(String(deal?.directionId ?? ''))) continue;
    projects.set(String(deal.id), {
      dealId: deal.id, name: String(deal.name || '').trim(), amount: Math.abs(Number(deal.amount || 0)),
      received: 0, costs: 0, lastPaymentDate: null,
    });
  }
  for (const t of expandSubs(transactions)) {
    if (t?.isPlan) continue;
    const project = projects.get(String(t?.dealId ?? ''));
    if (!project) continue;
    const value = Math.abs(Number(t?.value || 0));
    const group = String(t?.group || '').trim();
    if (group === 'income') {
      project.received += value;
      const date = parseFintabloDate(t?.date);
      if (date && (!project.lastPaymentDate || date > project.lastPaymentDate)) project.lastPaymentDate = date;
    } else if (group === 'outcome' && !skipCategories.has(String(t?.categoryId ?? ''))) {
      project.costs += value;
    }
  }
  const round2 = (v) => Math.round(v * 100) / 100;
  return [...projects.values()].map((p) => {
    const received = round2(p.received);
    const closed = p.amount > 0 && received >= p.amount - 1;
    return { ...p, received, costs: round2(p.costs), closed, closedPeriod: closed ? quarterOfDate(p.lastPaymentDate) : null };
  });
}

// Закрытые проекты идут в квартал закрытия, открытые показываются в текущем.
export function outsourcedByPeriod(projects, currentPeriod, periods = []) {
  const out = Object.fromEntries([...new Set([...periods, currentPeriod].filter(Boolean))].map((p) => [p, []]));
  for (const project of projects || []) {
    const period = project.closed ? project.closedPeriod : currentPeriod;
    if (!period) continue;
    (out[period] ||= []).push(project);
  }
  return out;
}

export function buildPayload({ targetsByPeriod, factsByPeriod, productionByPeriod = {}, outsourcedByPeriod: outsourced = {}, note }) {
  const periods = {};
  for (const [period, thresholds] of Object.entries(targetsByPeriod || {})) {
    periods[period] = { ...(periods[period] || {}), targets: { cash_in: thresholds } };
  }
  for (const [period, value] of Object.entries(factsByPeriod || {})) {
    periods[period] = { ...(periods[period] || {}), fact: { value, source: 'fintablo', note } };
  }
  for (const [period, value] of Object.entries(productionByPeriod || {})) {
    periods[period] = { ...(periods[period] || {}), factProduction: { value, source: 'fintablo', note } };
  }
  for (const [period, projects] of Object.entries(outsourced || {})) {
    periods[period] = { ...(periods[period] || {}), outsourced: { projects } };
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

export function splitNames(raw) {
  return String(raw || '').split(',').map((name) => name.trim()).filter(Boolean);
}

function findByName(items, name) {
  const wanted = String(name).trim().toLowerCase();
  return items.find((d) => String(d?.name || '').trim().toLowerCase() === wanted)
    || items.find((d) => String(d?.name || '').trim().toLowerCase().includes(wanted));
}

// Не выручка: статьи из списка по имени и все поступления раздела «ниже
// EBITDA» (вклады собственника, проценты по вкладам, возврат налогового резерва).
export function excludedCategoryIds(categories, names = EXCLUDED_CATEGORY_NAMES) {
  const wanted = new Set(names.map((name) => String(name).trim().toLowerCase()));
  return new Set(categories
    .filter((c) => wanted.has(String(c?.name || '').trim().toLowerCase()) || String(c?.pnlType || '') === 'income-under-ebitda')
    .map((c) => String(c.id)));
}

export async function fetchFacts({
  token, directionName = DEFAULT_DIRECTION_NAME, outsourceDirectionName = DEFAULT_OUTSOURCE_DIRECTION_NAME, year, today,
}) {
  const [directions, categories, deals] = await Promise.all([
    loadPaged(token, '/direction', {}),
    loadPaged(token, '/category', {}),
    loadPaged(token, '/deal', {}),
  ]);
  const roots = splitNames(directionName).map((name) => {
    const direction = findByName(directions, name);
    if (!direction) {
      throw new Error(`Направление «${name}» не найдено в Финтабло. Есть: ${directions.map((d) => d?.name).join(', ')}`);
    }
    return direction;
  });
  const transactions = await loadPaged(token, '/transaction', {
    isPlan: 0,
    dateFrom: toFintabloDate(moneyQuarterWindow(`${year}-Q1`).from),
    dateTo: toFintabloDate(today),
  });
  const ids = new Set(roots.flatMap((root) => [...directionTreeIds(directions, root.id)]));
  const names = directions.filter((d) => ids.has(String(d.id))).map((d) => d.name);
  const skipped = excludedCategoryIds(categories);
  const outsourceRoot = outsourceDirectionName ? findByName(directions, outsourceDirectionName) : null;
  const outsourceIds = outsourceRoot ? directionTreeIds(directions, outsourceRoot.id) : new Set();
  const outsourceDealIds = new Set(deals.filter((d) => outsourceIds.has(String(d?.directionId ?? ''))).map((d) => String(d.id)));
  return {
    directionId: roots.map((d) => d.id).join(','), directionName: roots.map((d) => d.name).join(' + '),
    directionIds: [...ids], directionNames: names,
    sums: sumIncomeByQuarter(transactions, ids, { excludedCategoryIds: skipped }),
    productionSums: sumIncomeByQuarter(transactions, ids, {
      excludedCategoryIds: skipped, excludedDirectionIds: outsourceIds, excludedDealIds: outsourceDealIds,
    }),
    outsourced: outsourcedProjects({ transactions, deals, categories, directionIds: outsourceIds }),
    outsourceDirectionName: outsourceRoot?.name || null,
    count: transactions.length,
  };
}

// Полный прогон: план из таблицы + факт из Финтабло → payload для записи.
export async function runMoneySync({ token, year, today, sheetId, gid, directionName, log = () => {} }) {
  const targetsByPeriod = await fetchPlan({ sheetId, gid, year });
  let factsByPeriod = {};
  let productionByPeriod = {};
  let outsourced = {};
  let note = '';
  let facts = null;
  if (token) {
    facts = await fetchFacts({ token, directionName, year, today });
    factsByPeriod = facts.sums;
    const periods = Object.keys(facts.sums);
    productionByPeriod = Object.fromEntries(periods.map((p) => [p, facts.productionSums[p] || 0]));
    const current = quarterOfDate(today);
    outsourced = outsourcedByPeriod(facts.outsourced, String(current || '').startsWith(String(year)) ? current : null, periods);
    note = `Финтабло, поступления «${facts.directionName}» без прочих фин. поступлений, квартал до ${MONEY_QUARTER_SHIFT_DAYS}-го числа, синк ${today}`;
    log(`FinTablo: ${facts.count} операций с начала года, направления ${facts.directionName} (#${facts.directionId}) с поднаправлениями: ${facts.directionNames.join(', ')}`);
    log(`Факт по кварталам: ${JSON.stringify(facts.sums)}`);
    log(`Без подряда («${facts.outsourceDirectionName || 'нет направления'}»): ${JSON.stringify(facts.productionSums)}`);
    log(`Подрядные проекты: ${facts.outsourced.map((p) => `${p.name} ${p.received}/${p.amount}${p.closed ? ` закрыт ${p.closedPeriod}` : ''}`).join('; ') || 'нет'}`);
  } else {
    log('FINTABLO_API_KEY не задан: факт не синкается, только план');
  }
  return { payload: buildPayload({ targetsByPeriod, factsByPeriod, productionByPeriod, outsourcedByPeriod: outsourced, note }), facts, targetsByPeriod };
}
