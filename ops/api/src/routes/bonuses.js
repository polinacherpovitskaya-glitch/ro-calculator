import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  periodBounds, suggestProductionTargets, computeProductionPeriod, computeYear, computeTeamStats,
  soldHoursForPeriod, achievement, DEFAULT_LADDER,
} from '../bonuses/calc.js';
import { loadLegacyBonusData, activeEmployees } from '../bonuses/legacy.js';
import * as store from '../bonuses/store.js';

const router = Router();
router.use(requireAuth);

// Синк плана (таблица) и факта (Финтабло) по деньгам отдела. Доступен боту
// синка и владельцу; остальные маршруты ниже только для admin.
router.post('/sync/team-money', requireRole('admin', 'bot'), asyncHandler(async (req, res) => {
  const periods = req.body?.periods;
  if (!periods || typeof periods !== 'object' || Array.isArray(periods)) return error(res, 400, 'INVALID_PAYLOAD', 'Нужен объект periods');
  for (const [period, entry] of Object.entries(periods)) {
    try {
      periodBounds(period);
    } catch {
      return error(res, 400, 'INVALID_PERIOD', `Период ${period} задаётся как 2026-Q3`);
    }
    if (entry?.targets && !validTargets(res, entry.targets, false)) return;
    if (entry?.fact) {
      const value = Number(entry.fact.value);
      if (!Number.isFinite(value) || value < 0) return error(res, 400, 'INVALID_FACT', `Факт ${period} должен быть числом не меньше нуля`);
      if (!['fintablo', 'manual'].includes(String(entry.fact.source || 'fintablo'))) return error(res, 400, 'INVALID_SOURCE', 'Источник факта: fintablo или manual');
    }
  }
  const written = { targets: [], facts: [] };
  for (const [period, entry] of Object.entries(periods)) {
    if (entry?.targets) {
      await store.upsertTeamTargets('commercial', period, entry.targets);
      written.targets.push(period);
    }
    if (entry?.fact) {
      await store.setTeamFact('commercial', period, 'cash_in', {
        value: Number(entry.fact.value), source: String(entry.fact.source || 'fintablo'), note: entry.fact.note,
      }, req.user.email);
      written.facts.push(period);
    }
  }
  res.json({ data: written });
}));

router.use(requireRole('admin'));

function error(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parsePeriod(res, raw) {
  try {
    periodBounds(raw);
    return String(raw);
  } catch {
    error(res, 400, 'INVALID_PERIOD', 'Период задаётся как 2026-Q3');
    return null;
  }
}

async function schemeOr404(res, id) {
  const scheme = await store.getSchemeById(Number(id));
  if (!scheme) {
    error(res, 404, 'NOT_FOUND', 'Схема не найдена');
    return null;
  }
  return scheme;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function validTargets(res, targets, requireOutput) {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    error(res, 400, 'INVALID_TARGETS', 'Нужен объект targets');
    return false;
  }
  if (requireOutput && !targets.output_hours) {
    error(res, 400, 'INVALID_TARGETS', 'Нужен объект targets с output_hours');
    return false;
  }
  for (const [key, value] of Object.entries(targets)) {
    const values = [value?.min, value?.target, value?.max].map(Number);
    if (values.some((v) => !Number.isFinite(v))) {
      error(res, 400, 'INVALID_TARGETS', `Пороги ${key} должны быть числами`);
      return false;
    }
  }
  return true;
}

async function loadTeamMoney(period) {
  const [targets, facts] = await Promise.all([store.getTeamTargets('commercial', period), store.getTeamFacts('commercial', period)]);
  const thresholds = targets?.cash_in || null;
  const fact = facts.cash_in ? facts.cash_in.value : null;
  return { targets, facts, teamMoney: thresholds && fact !== null ? { fact, thresholds } : null };
}

async function computeEntry(scheme, period, legacy, approvals, teamMoney) {
  const targets = await store.getTargets(scheme.id, period);
  const names = new Map(legacy.employees.map((e) => [String(e.id), String(e.name || '')]));
  const existing = await store.getResult(scheme.id, period);
  const suggestion = suggestProductionTargets({ period, settings: legacy.settings });
  const targetsDrift = !!(targets?.output_hours && Number(targets.output_hours.target) !== Number(suggestion.targets.output_hours.target));
  const common = {
    employeeName: names.get(String(scheme.employee_id)) || '',
    kind: scheme.kind,
    resultStatus: existing?.status || 'open',
    amountFinal: existing ? Number(existing.amount_final) : null,
    adjustments: existing?.adjustments_json || [],
    targetsDrift,
    hasTargets: !!targets,
  };
  if (existing && existing.status !== 'open') {
    return { ...existing.computed_json, ...common, status: existing.status };
  }
  const result = computeProductionPeriod({
    period, today: todayYmd(), status: 'open', scheme, targets, orders: legacy.orders,
    timeEntries: legacy.timeEntries, settings: legacy.settings, stockApprovals: approvals,
    soldHours: soldHoursForPeriod(legacy.orders, period), teamMoney, employees: legacy.employees,
  });
  return { ...result, ...common };
}

router.get('/employees', asyncHandler(async (req, res) => {
  const { employees } = await loadLegacyBonusData(getPool());
  res.json({ data: activeEmployees(employees) });
}));

router.get('/schemes', asyncHandler(async (req, res) => {
  const [schemes, { employees }] = await Promise.all([store.listSchemes(), loadLegacyBonusData(getPool())]);
  const names = new Map(employees.map((e) => [String(e.id), String(e.name || '')]));
  res.json({ data: schemes.map((s) => ({ ...s, employee_name: names.get(String(s.employee_id)) || '' })) });
}));

router.put('/schemes/:employeeId', asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) return error(res, 400, 'INVALID_EMPLOYEE', 'Нужен id сотрудника');
  const rate = Number(req.body?.rate);
  if (!Number.isFinite(rate) || rate < 0) return error(res, 400, 'INVALID_RATE', 'Ставка должна быть числом не меньше нуля');
  const scheme = await store.upsertScheme(employeeId, { ...req.body, rate });
  res.json({ data: scheme });
}));

router.get('/periods/:period/suggest/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const { settings } = await loadLegacyBonusData(getPool());
  res.json({ data: suggestProductionTargets({ period, settings }) });
}));

router.put('/periods/:period/targets/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const targets = req.body?.targets;
  if (!validTargets(res, targets, true)) return;
  res.json({ data: await store.upsertTargets(scheme.id, period, targets) });
}));

router.get('/periods/:period/team/commercial', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const { targets, facts } = await loadTeamMoney(period);
  res.json({ data: { targets, facts } });
}));

router.put('/periods/:period/team/commercial', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const targets = req.body?.targets;
  if (targets !== undefined && targets !== null) {
    if (!validTargets(res, targets, false)) return;
    await store.upsertTeamTargets('commercial', period, targets);
  }
  const facts = req.body?.facts;
  if (facts && typeof facts === 'object' && !Array.isArray(facts)) {
    for (const [key, fact] of Object.entries(facts)) {
      const value = Number(fact?.value);
      if (!Number.isFinite(value) || value < 0) return error(res, 400, 'INVALID_FACT', `Факт ${key} должен быть числом не меньше нуля`);
    }
    for (const [key, fact] of Object.entries(facts)) {
      await store.setTeamFact('commercial', period, key, { value: Number(fact.value), source: 'manual', note: fact?.note }, req.user.email);
    }
  }
  const saved = await loadTeamMoney(period);
  res.json({ data: { targets: saved.targets, facts: saved.facts } });
}));

router.get('/periods/:period', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const [schemes, legacy, approvals, team] = await Promise.all([
    store.listSchemes(), loadLegacyBonusData(getPool()), store.listStockApprovals(period), loadTeamMoney(period),
  ]);
  const entries = [];
  const history = [];
  for (const scheme of schemes.filter((s) => s.kind === 'production')) {
    entries.push(await computeEntry(scheme, period, legacy, approvals, team.teamMoney));
    for (const row of (await store.listResults(scheme.id)).filter((r) => r.status !== 'open')) {
      history.push({
        schemeId: scheme.id, period: row.period, status: row.status, amountComputed: Number(row.amount_computed),
        amountFinal: Number(row.amount_final), adjustments: row.adjustments_json, closedAt: row.closed_at, paidAt: row.paid_at,
      });
    }
  }
  const first = entries[0] || null;
  const tiers = first?.output?.thresholds ? { medium: first.output.thresholds.target, aspiration: first.output.thresholds.max } : null;
  const shopProductivity = first?.quality?.metrics?.find((m) => m.key === 'productivity')?.fact || 1;
  const people = computeTeamStats({
    period, today: todayYmd(), orders: legacy.orders, timeEntries: legacy.timeEntries, employees: legacy.employees,
    settings: legacy.settings, shopProductivity, tiers,
  });
  const cashAchievement = team.teamMoney ? achievement(team.teamMoney.fact, team.teamMoney.thresholds, 'higher', DEFAULT_LADDER) : null;
  res.json({
    data: {
      period, entries, history, people,
      soldHours: soldHoursForPeriod(legacy.orders, period),
      team: { commercial: { targets: team.targets, facts: team.facts, cashAchievement } },
    },
  });
}));

router.post('/periods/:period/stock-approvals', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const orderId = Number(req.body?.order_id);
  if (!Number.isInteger(orderId)) return error(res, 400, 'INVALID_ORDER', 'Нужен order_id');
  await store.setStockApproval(period, orderId, req.body?.approved === true, req.user.email);
  res.json({ data: { period, order_id: orderId, approved: req.body?.approved === true } });
}));

router.post('/periods/:period/close/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const targets = await store.getTargets(scheme.id, period);
  if (!targets) return error(res, 400, 'NO_TARGETS', 'Сначала сохраните цели квартала');
  const existing = await store.getResult(scheme.id, period);
  if (existing && existing.status !== 'open') return error(res, 409, 'ALREADY_CLOSED', 'Период уже закрыт');
  const [legacy, approvals, team] = await Promise.all([loadLegacyBonusData(getPool()), store.listStockApprovals(period), loadTeamMoney(period)]);
  const computed = computeProductionPeriod({
    period, today: todayYmd(), status: 'closed', scheme, targets, orders: legacy.orders,
    timeEntries: legacy.timeEntries, settings: legacy.settings, stockApprovals: approvals,
    soldHours: soldHoursForPeriod(legacy.orders, period), teamMoney: team.teamMoney, employees: legacy.employees,
  });
  const row = await store.saveResult({
    scheme_id: scheme.id, period, status: 'closed', computed_json: computed,
    amount_computed: computed.amountComputed, amount_final: computed.amountComputed,
    adjustments_json: [], closed_at: new Date().toISOString(), closed_by: req.user.email, paid_at: null,
  });
  res.json({ data: row });
}));

router.post('/periods/:period/adjust/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const amount = Number(req.body?.amount);
  const comment = String(req.body?.comment || '').trim();
  if (!Number.isFinite(amount) || amount < 0) return error(res, 400, 'INVALID_AMOUNT', 'Сумма должна быть числом не меньше нуля');
  if (!comment) return error(res, 400, 'COMMENT_REQUIRED', 'Корректировка без комментария не сохраняется');
  const existing = await store.getResult(scheme.id, period);
  if (!existing || existing.status === 'open') return error(res, 400, 'NOT_CLOSED', 'Сначала закройте период');
  const adjustments = [...(existing.adjustments_json || []), {
    at: new Date().toISOString(), by: req.user.email, from: Number(existing.amount_final), to: amount, comment,
  }];
  res.json({ data: await store.saveResult({ ...existing, amount_final: amount, adjustments_json: adjustments }) });
}));

router.post('/periods/:period/paid/:schemeId', asyncHandler(async (req, res) => {
  const period = parsePeriod(res, req.params.period);
  if (!period) return;
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const existing = await store.getResult(scheme.id, period);
  if (!existing || existing.status === 'open') return error(res, 400, 'NOT_CLOSED', 'Сначала закройте период');
  res.json({ data: await store.saveResult({ ...existing, status: 'paid', paid_at: new Date().toISOString() }) });
}));

async function yearEntries(year) {
  const [schemes, legacy] = await Promise.all([store.listSchemes(), loadLegacyBonusData(getPool())]);
  const names = new Map(legacy.employees.map((e) => [String(e.id), String(e.name || '')]));
  const out = [];
  for (const scheme of schemes.filter((s) => s.kind === 'production')) {
    const quarters = [];
    for (const q of [1, 2, 3, 4]) {
      const period = `${year}-Q${q}`;
      const [targets, approvals, team] = await Promise.all([
        store.getTargets(scheme.id, period), store.listStockApprovals(period), loadTeamMoney(period),
      ]);
      const entry = await computeEntry(scheme, period, legacy, approvals, team.teamMoney);
      quarters.push({
        period,
        thresholds: targets?.output_hours || null,
        fact: targets ? entry.output.fact : null,
        achievement: targets ? entry.output.achievement : null,
        resultStatus: entry.resultStatus,
      });
    }
    out.push({ schemeId: scheme.id, employeeName: names.get(String(scheme.employee_id)) || '', year: computeYear({ year, scheme, quarters }) });
  }
  return out;
}

router.get('/years/:year', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return error(res, 400, 'INVALID_YEAR', 'Нужен год');
  res.json({ data: await yearEntries(year) });
}));

router.post('/years/:year/close/:schemeId', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return error(res, 400, 'INVALID_YEAR', 'Нужен год');
  const scheme = await schemeOr404(res, req.params.schemeId);
  if (!scheme) return;
  const entry = (await yearEntries(year)).find((e) => e.schemeId === scheme.id);
  const period = `${year}-Y`;
  const existing = await store.getResult(scheme.id, period);
  if (existing && existing.status !== 'open') return error(res, 409, 'ALREADY_CLOSED', 'Год уже закрыт');
  const row = await store.saveResult({
    scheme_id: scheme.id, period, status: 'closed', computed_json: entry, amount_computed: entry.year.topUp,
    amount_final: entry.year.topUp, adjustments_json: [], closed_at: new Date().toISOString(), closed_by: req.user.email, paid_at: null,
  });
  res.json({ data: row });
}));

export default router;
