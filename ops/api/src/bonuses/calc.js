// Чистые функции расчёта бонусов. Без БД и без Express.
// Спека: docs/specs/2026-09-09-bonuses-production-manager.md

// Ниже base четверть ставки (что-то платится всегда), base половина, medium
// единица, aspiration полторы, выше aspiration рост продолжается тем же
// шагом до потолка cap.
export const DEFAULT_LADDER = { below_min: 0.25, min: 0.5, target: 1, max: 1.5, cap: 2 };

// Веса множителя качества. У срока и переделок планки «цель = максимум»:
// всё в срок и без брака даёт ровно 1,0, срывы снижают.
export const DEFAULT_QUALITY_WEIGHTS = { productivity: 0.5, on_time_share: 0.3, rework_share: 0.2 };

// Уровень квартала = max(A_output, 0.7 × A_output + 0.3 × A_cash).
export const DEFAULT_LEVEL_WEIGHTS = { output: 0.7, money: 0.3 };

export const DEFAULT_QUALITY_THRESHOLDS = {
  productivity: { min: 0.9, target: 1.0, max: 1.15 },
  on_time_share: { min: 0.85, target: 1.0, max: 1.0 },
  rework_share: { min: 0.05, target: 0, max: 0 },
};

export const QUALITY_DIRECTIONS = { productivity: 'higher', on_time_share: 'higher', rework_share: 'lower' };

export const METRIC_LABELS = {
  output_hours: 'Выпуск, нормо-часы',
  productivity: 'Производительность',
  on_time_share: 'В срок',
  rework_share: 'Переделки',
};

const QUARTER_MONTHS = { 1: ['01-01', '03-31'], 2: ['04-01', '06-30'], 3: ['07-01', '09-30'], 4: ['10-01', '12-31'] };

export function periodBounds(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(period || '').trim());
  if (!match) throw new Error('INVALID_PERIOD');
  const year = Number(match[1]);
  const q = Number(match[2]);
  const [from, to] = QUARTER_MONTHS[q];
  return { year, q, from: `${year}-${from}`, to: `${year}-${to}` };
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function parseYmd(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isValidYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseYmd(value);
  return Number.isFinite(parsed.getTime()) && ymd(parsed) === value;
}

export function holidaySet(settings) {
  const raw = String(settings?.production_holidays || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(/[\s,;]+/).filter((value) => isValidYmd(value)));
}

export function workingDays(from, to, holidays = new Set()) {
  let count = 0;
  const end = String(to).slice(0, 10);
  for (let cursor = parseYmd(from); ymd(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(ymd(cursor))) continue;
    count += 1;
  }
  return count;
}

export function elapsedWorkingShare(period, todayYmd, holidays = new Set()) {
  const { from, to } = periodBounds(period);
  const today = String(todayYmd).slice(0, 10);
  if (today < from) return 0;
  if (today > to) return 1;
  const total = workingDays(from, to, holidays);
  if (total === 0) return 1;
  return workingDays(from, today, holidays) / total;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function achievement(fact, thresholds, direction = 'higher', ladder = DEFAULT_LADDER) {
  if (fact === null || fact === undefined || !Number.isFinite(Number(fact))) return null;
  const sign = direction === 'lower' ? -1 : 1;
  const x = Number(fact) * sign;
  const a = Number(thresholds.min) * sign;
  const b = Number(thresholds.target) * sign;
  const c = Number(thresholds.max) * sign;
  const lMin = Number(ladder.min);
  const lTarget = Number(ladder.target);
  const lMax = Number(ladder.max);
  const cap = ladder.cap === undefined || ladder.cap === null ? lMax : Number(ladder.cap);
  if (x < a) return Number(ladder.below_min);
  if (x < b) return b === a ? lMin : lerp(lMin, lTarget, (x - a) / (b - a));
  if (x < c) return c === b ? lTarget : lerp(lTarget, lMax, (x - b) / (c - b));
  // target = max: попадание в цель даёт ровно target, выше не бывает.
  if (c === b) return lTarget;
  // Выше aspiration: тот же наклон, что между medium и aspiration, до потолка.
  return Math.min(cap, lMax + (lMax - lTarget) * ((x - c) / (c - b)));
}

const NON_COMMERCIAL = new Set(['rework', 'stock_sample']);

export function orderPurpose(order) {
  const key = String(order?.production_purpose || '').trim().toLowerCase();
  return key || 'commercial';
}

export function isCommercialOrder(order) {
  return !NON_COMMERCIAL.has(orderPurpose(order));
}

function isAlive(order) {
  const status = String(order?.status || '').trim().toLowerCase();
  return !order?.deleted_at && status !== 'deleted' && status !== 'cancelled';
}

function isCompleted(order) {
  return String(order?.status || '').trim().toLowerCase() === 'completed';
}

function isUnpaidDraft(order) {
  return String(order?.status || '') === 'draft' && (!order?.payment_status || order.payment_status === 'not_sent');
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function day(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function roundTo(value, digits) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

function hasOrder(entry) {
  return !(entry?.order_id === null || entry?.order_id === undefined || entry.order_id === '');
}

export function orderCompletionDate(order, entriesForOrder = []) {
  const explicit = day(order?.completed_at);
  if (explicit) return { date: explicit, estimated: false };
  const lastEntry = entriesForOrder.map((e) => day(e?.date)).filter(Boolean).sort().pop();
  if (lastEntry) return { date: lastEntry, estimated: true };
  return { date: day(order?.updated_at), estimated: true };
}

function groupEntriesByOrder(timeEntries) {
  const map = new Map();
  for (const entry of timeEntries) {
    if (!hasOrder(entry)) continue;
    const key = String(entry.order_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  return map;
}

function sumHours(entries) {
  return entries.reduce((acc, e) => acc + num(e?.hours), 0);
}

// Проданные часы квартала: коммерческие заказы с дедлайном в периоде,
// живые, не черновики без счёта. Завершённые входят.
export function soldHoursForPeriod(orders, period) {
  const { from, to } = periodBounds(period);
  let total = 0;
  for (const order of orders) {
    if (!isAlive(order) || !isCommercialOrder(order) || isUnpaidDraft(order)) continue;
    const deadline = day(order.deadline);
    if (!deadline || deadline < from || deadline > to) continue;
    total += num(order.total_hours_plan);
  }
  return roundTo(total, 2);
}

export function computeProductionPeriod(input) {
  const {
    period, today, status = 'open', scheme, targets, orders, timeEntries, settings, stockApprovals,
    soldHours = null, teamMoney = null, employees = [],
  } = input;
  const { from, to } = periodBounds(period);
  const holidays = holidaySet(settings);
  const ladder = scheme.ladder_json || DEFAULT_LADDER;
  const rate = num(scheme.rates_json?.rate);
  const weights = { ...DEFAULT_QUALITY_WEIGHTS, ...(scheme.quality_json?.weights || {}) };
  const levelWeights = { ...DEFAULT_LEVEL_WEIGHTS, ...(scheme.quality_json?.level_weights || {}) };
  const approvals = stockApprovals instanceof Set ? stockApprovals : new Set((stockApprovals || []).map(String));
  const entriesByOrder = groupEntriesByOrder(timeEntries);
  const inPeriod = (d) => d !== null && d >= from && d <= to;
  const todayYmd = String(today || '').slice(0, 10);

  const warnings = [];
  const detail = [];
  let outputHours = 0;
  let commercialOutputHours = 0;
  let internalOutputHours = 0;
  let timesheetOnIncluded = 0;
  let onTimeCount = 0;
  let deadlineCount = 0;
  const noHours = [];
  const noDeadline = [];
  const estimated = [];

  for (const order of orders) {
    if (!isAlive(order) || !isCompleted(order)) continue;
    const purpose = orderPurpose(order);
    if (purpose === 'rework') continue;
    const entries = entriesByOrder.get(String(order.id)) || [];
    const completion = orderCompletionDate(order, entries);
    if (!inPeriod(completion.date)) continue;

    const hoursPlan = num(order.total_hours_plan);
    const hoursFact = sumHours(entries);
    const deadline = day(order.deadline);
    const isStock = purpose === 'stock_sample';
    const approved = isStock ? approvals.has(String(order.id)) : null;
    const onTime = deadline ? completion.date <= deadline : null;
    const included = hoursPlan > 0 && (!isStock || approved);

    if (hoursPlan <= 0) noHours.push(order.id);
    if (completion.estimated) estimated.push(order.id);
    // «В срок» считаем только по заказам с настоящей датой завершения:
    // оценочная дата (по табелю или последнему изменению) делает старые
    // заказы «просроченными» без вины цеха.
    if (!isStock) {
      if (deadline && !completion.estimated) {
        deadlineCount += 1;
        if (onTime) onTimeCount += 1;
      } else if (!deadline) {
        noDeadline.push(order.id);
      }
    }
    if (included) {
      outputHours += hoursPlan;
      if (isStock) internalOutputHours += hoursPlan; else commercialOutputHours += hoursPlan;
      timesheetOnIncluded += hoursFact;
    }
    detail.push({
      id: order.id, name: String(order.order_name || ''), purpose, hoursPlan, hoursFact: roundTo(hoursFact, 2),
      deadline, completedAt: completion.date, estimated: completion.estimated, onTime, approved, included,
    });
  }

  let reworkHours = 0;
  let commercialPeriodHours = 0;
  let unmarkedHours = 0;
  const orderById = new Map(orders.map((o) => [String(o.id), o]));
  for (const entry of timeEntries) {
    const d = day(entry?.date);
    if (!inPeriod(d)) continue;
    if (!hasOrder(entry)) {
      unmarkedHours += num(entry.hours);
      continue;
    }
    const order = orderById.get(String(entry.order_id));
    if (!order) continue;
    const purpose = orderPurpose(order);
    if (purpose === 'rework') reworkHours += num(entry.hours);
    else if (purpose !== 'stock_sample') commercialPeriodHours += num(entry.hours);
  }

  // Проданное, но ещё не сделанное: коммерческие заказы с дедлайном в периоде,
  // не завершённые, остаток нормы за вычетом табеля. Прямой призыв на карточке.
  let remainingSoldHours = 0;
  const remainingSoldOrders = [];
  for (const order of orders) {
    if (!isAlive(order) || isCompleted(order) || !isCommercialOrder(order) || isUnpaidDraft(order)) continue;
    const deadline = day(order.deadline);
    if (!deadline || deadline < from || deadline > to) continue;
    const left = Math.max(0, num(order.total_hours_plan) - sumHours(entriesByOrder.get(String(order.id)) || []));
    if (left > 0) {
      remainingSoldHours += left;
      remainingSoldOrders.push(order.id);
    }
  }

  if (noHours.length) warnings.push({ code: 'no_hours', count: noHours.length, hours: 0, orderIds: noHours });
  if (noDeadline.length) warnings.push({ code: 'no_deadline', count: noDeadline.length, hours: 0, orderIds: noDeadline });
  if (estimated.length) warnings.push({ code: 'estimated_dates', count: estimated.length, hours: 0, orderIds: estimated });
  if (unmarkedHours > 0) warnings.push({ code: 'unmarked_hours', count: 0, hours: roundTo(unmarkedHours, 2), orderIds: [] });

  // Пробелы табеля по людям: рабочие дни периода до сегодня без единой записи.
  const untilYmd = status === 'open' ? (todayYmd && todayYmd < to ? todayYmd : to) : to;
  if (untilYmd >= from) {
    const daysByEmployee = new Map();
    for (const entry of timeEntries) {
      const d = day(entry?.date);
      if (!d || d < from || d > untilYmd) continue;
      const key = String(entry.employee_id);
      if (!daysByEmployee.has(key)) daysByEmployee.set(key, new Set());
      daysByEmployee.get(key).add(d);
    }
    const expectedDays = workingDays(from, untilYmd, holidays);
    const byEmployee = [];
    for (const employee of employees) {
      if (!employee || employee.is_active === false) continue;
      if (String(employee.role || '').trim().toLowerCase() !== 'production') continue;
      const logged = daysByEmployee.get(String(employee.id))?.size || 0;
      const days = Math.max(0, expectedDays - logged);
      if (days > 0) byEmployee.push({ id: employee.id, name: String(employee.name || ''), days });
    }
    if (byEmployee.length) {
      warnings.push({ code: 'timesheet_gaps', count: byEmployee.reduce((acc, e) => acc + e.days, 0), hours: 0, orderIds: [], byEmployee });
    }
  }

  // Выпуск и уровень. Если продано меньше плана medium, уровни масштабируются
  // от проданного: цех не может сделать больше, чем продано, и не виноват в
  // недоборе. Но пересчёт может поднять уровень только до medium (полная
  // ставка); выше medium уровень считается только от настоящего плана.
  const planThresholds = targets?.output_hours || null;
  const sold = soldHours === null || soldHours === undefined ? null : num(soldHours);
  const outputFact = roundTo(outputHours, 2);
  let outputThresholds = planThresholds;
  let outputAch = planThresholds ? achievement(outputFact, planThresholds, 'higher', ladder) : null;
  let scaledCapped = false;
  if (planThresholds && sold !== null && num(planThresholds.target) > 0 && sold < num(planThresholds.target)) {
    const scale = sold / num(planThresholds.target);
    outputThresholds = {
      min: Math.round(num(planThresholds.min) * scale),
      target: Math.round(sold),
      max: Math.round(num(planThresholds.max) * scale),
    };
    warnings.push({ code: 'sold_below_plan', count: 0, hours: roundTo(sold, 2), orderIds: [] });
    if (outputAch !== null && outputAch < Number(ladder.target)) {
      const scaledAch = achievement(outputFact, outputThresholds, 'higher', ladder);
      const capped = Math.min(Number(ladder.target), scaledAch);
      scaledCapped = scaledAch > Number(ladder.target);
      outputAch = Math.max(outputAch, capped);
    }
  }

  // Деньги компании: только поднимают уровень.
  const moneyThresholds = teamMoney?.thresholds || null;
  const moneyFact = teamMoney?.fact === null || teamMoney?.fact === undefined ? null : num(teamMoney.fact);
  const moneyAch = moneyThresholds && moneyFact !== null ? achievement(moneyFact, moneyThresholds, 'higher', ladder) : null;
  let level = outputAch;
  let blend = null;
  if (outputAch !== null && moneyAch !== null) {
    blend = roundTo(num(levelWeights.output) * outputAch + num(levelWeights.money) * moneyAch, 4);
    level = Math.max(outputAch, blend);
  } else if (outputAch !== null) {
    warnings.push({ code: 'no_money_plan', count: 0, hours: 0, orderIds: [] });
  }
  const rateApplied = level === null ? 0 : roundTo(rate * level, 2);

  // Качество
  const qualityFacts = {};
  if (outputHours > 0 && timesheetOnIncluded === 0) {
    qualityFacts.productivity = { fact: null, available: false, fallback: Number(ladder.min) };
    warnings.push({ code: 'no_timesheet', count: 0, hours: 0, orderIds: [] });
  } else if (timesheetOnIncluded > 0) {
    qualityFacts.productivity = { fact: roundTo(outputHours / timesheetOnIncluded, 4), available: true };
  } else {
    qualityFacts.productivity = { fact: null, available: false, fallback: Number(ladder.min) };
  }
  if (deadlineCount > 0) {
    qualityFacts.on_time_share = { fact: roundTo(onTimeCount / deadlineCount, 4), available: true };
  } else {
    qualityFacts.on_time_share = { fact: null, available: false, fallback: Number(ladder.target) };
    warnings.push({ code: 'no_deadline_orders', count: 0, hours: 0, orderIds: [] });
  }
  if (reworkHours + commercialPeriodHours > 0) {
    qualityFacts.rework_share = { fact: roundTo(reworkHours / (reworkHours + commercialPeriodHours), 4), available: true };
  } else {
    qualityFacts.rework_share = { fact: null, available: false, fallback: Number(ladder.target) };
    warnings.push({ code: 'no_period_hours', count: 0, hours: 0, orderIds: [] });
  }

  let multiplier = 0;
  const qualityMetrics = ['productivity', 'on_time_share', 'rework_share'].map((key) => {
    const thresholds = targets?.[key] || DEFAULT_QUALITY_THRESHOLDS[key];
    const { fact, available, fallback } = qualityFacts[key];
    // Для качества потолок = max (1,5): рост «выше aspiration» только у выпуска.
    const qualityLadder = { ...ladder, cap: Number(ladder.max) };
    const ach = available ? achievement(fact, thresholds, QUALITY_DIRECTIONS[key], qualityLadder) : fallback;
    const weight = num(weights[key]);
    multiplier += weight * ach;
    return {
      key, label: METRIC_LABELS[key], direction: QUALITY_DIRECTIONS[key], weight, thresholds, fact,
      achievement: roundTo(ach, 4), available, informational: weight === 0,
    };
  });
  multiplier = roundTo(multiplier, 4);

  const amount = Math.round(outputFact * rateApplied * multiplier);

  // Прогноз выпуска по доле прошедших рабочих дней.
  const share = status === 'open' ? elapsedWorkingShare(period, todayYmd, holidays) : 1;
  let forecast = null;
  let forecastAchievement = null;
  let forecastLevel = null;
  let forecastAmount = null;
  if (status === 'open' && share > 0 && share < 1 && outputThresholds) {
    forecast = roundTo(outputFact / share, 0);
    let fAch = achievement(forecast, planThresholds, 'higher', ladder);
    if (outputThresholds !== planThresholds && fAch < Number(ladder.target)) {
      fAch = Math.max(fAch, Math.min(Number(ladder.target), achievement(forecast, outputThresholds, 'higher', ladder)));
    }
    forecastAchievement = roundTo(fAch, 4);
    forecastLevel = moneyAch === null
      ? forecastAchievement
      : roundTo(Math.max(forecastAchievement, num(levelWeights.output) * forecastAchievement + num(levelWeights.money) * moneyAch), 4);
    forecastAmount = Math.round(forecast * rate * forecastLevel * multiplier);
  }

  return {
    period, schemeId: scheme.id, employeeId: scheme.employee_id, status, rate,
    level: level === null ? null : roundTo(level, 4),
    output: {
      fact: outputFact, commercialHours: roundTo(commercialOutputHours, 2), internalHours: roundTo(internalOutputHours, 2),
      unmarkedHours: roundTo(unmarkedHours, 2),
      thresholds: planThresholds, thresholdsEffective: outputThresholds, soldHours: sold, scaledCapped,
      remainingSoldHours: roundTo(remainingSoldHours, 2), remainingSoldOrders,
      achievement: outputAch === null ? null : roundTo(outputAch, 4), rateApplied,
      forecast, forecastAchievement, forecastLevel, forecastAmount,
    },
    money: { fact: moneyFact, thresholds: moneyThresholds, achievement: moneyAch === null ? null : roundTo(moneyAch, 4), blend },
    quality: { multiplier, metrics: qualityMetrics },
    amountComputed: amount, warnings, orders: detail,
  };
}

export function computeYear({ year, scheme, quarters }) {
  const ladder = scheme.ladder_json || DEFAULT_LADDER;
  const rate = num(scheme.rates_json?.rate);
  const counted = quarters.filter((q) => q.thresholds && q.fact !== null && q.fact !== undefined);
  const sum = (key) => counted.reduce((acc, q) => acc + num(q.thresholds[key]), 0);
  const thresholdsSum = { min: sum('min'), target: sum('target'), max: sum('max') };
  const factSum = roundTo(counted.reduce((acc, q) => acc + num(q.fact), 0), 2);
  const yearAch = counted.length ? achievement(factSum, thresholdsSum, 'higher', ladder) : null;
  const rows = quarters.map((q) => {
    const isCounted = counted.includes(q);
    const quarterBasis = isCounted ? Math.round(num(q.fact) * rate * num(q.achievement)) : 0;
    const yearBasis = isCounted && yearAch !== null ? Math.round(num(q.fact) * rate * yearAch) : 0;
    return {
      period: q.period, fact: isCounted ? num(q.fact) : null, achievement: isCounted ? num(q.achievement) : null,
      resultStatus: q.resultStatus || 'open', quarterBasis, yearBasis, topUp: Math.max(0, yearBasis - quarterBasis),
    };
  });
  return {
    year, factSum, thresholdsSum, achievement: yearAch === null ? null : roundTo(yearAch, 4),
    quartersCounted: counted.length, quarters: rows, topUp: rows.reduce((acc, r) => acc + r.topUp, 0),
  };
}

export function suggestProductionTargets({ period, settings }) {
  const { q } = periodBounds(period);
  let target = 0;
  let source = 'formula';
  try {
    const stored = JSON.parse(settings?.seasonal_load_plan_json || 'null');
    if (stored && num(stored[`Q${q}`]) > 0) {
      target = Math.round(num(stored[`Q${q}`]));
      source = 'plan';
    }
  } catch {
    target = 0;
  }
  if (!target) {
    target = Math.round(num(settings?.workers_count) * num(settings?.hours_per_worker) * num(settings?.work_load_ratio) * 3);
  }
  return {
    source,
    targets: {
      output_hours: { min: Math.round(target * 0.88), target, max: Math.round(target * 1.12) },
      ...DEFAULT_QUALITY_THRESHOLDS,
    },
  };
}

// Блок «Люди»: по сотрудникам, состав, прогноз до конца квартала.
export function computeTeamStats({ period, today, orders, timeEntries, employees, settings, shopProductivity = 1, tiers = null }) {
  const { from, to } = periodBounds(period);
  const holidays = holidaySet(settings);
  const hoursPerDay = num(settings?.planning_hours_per_day) || 9;
  const todayYmd = String(today || '').slice(0, 10);
  const until = !todayYmd || todayYmd < from ? null : (todayYmd > to ? to : todayYmd);
  const prod = num(shopProductivity) || 1;
  const orderById = new Map(orders.map((o) => [String(o.id), o]));
  const entriesByOrder = groupEntriesByOrder(timeEntries);

  const orderProductivity = new Map();
  for (const order of orders) {
    if (!isAlive(order) || !isCompleted(order) || orderPurpose(order) === 'rework') continue;
    const hoursPlan = num(order.total_hours_plan);
    const hoursFact = sumHours(entriesByOrder.get(String(order.id)) || []);
    if (hoursPlan > 0 && hoursFact > 0) orderProductivity.set(String(order.id), hoursPlan / hoursFact);
  }

  const workingDaysSoFar = until ? workingDays(from, until, holidays) : 0;
  const people = [];
  for (const employee of employees) {
    if (!employee || employee.is_active === false) continue;
    if (String(employee.role || '').trim().toLowerCase() !== 'production') continue;
    const mine = timeEntries.filter((e) => {
      const d = day(e?.date);
      return String(e?.employee_id) === String(employee.id) && d !== null && d >= from && d <= to;
    });
    const days = new Set(mine.map((e) => day(e.date)));
    let hours = 0;
    let orderHours = 0;
    let unmarkedHours = 0;
    let reworkHours = 0;
    let weightedNorm = 0;
    let weightedHours = 0;
    for (const entry of mine) {
      const h = num(entry.hours);
      hours += h;
      if (!hasOrder(entry)) {
        unmarkedHours += h;
        continue;
      }
      orderHours += h;
      const order = orderById.get(String(entry.order_id));
      if (order && orderPurpose(order) === 'rework') reworkHours += h;
      const p = orderProductivity.get(String(entry.order_id));
      if (p !== undefined) {
        weightedNorm += h * p;
        weightedHours += h;
      }
    }
    const productivity = weightedHours > 0 ? roundTo(weightedNorm / weightedHours, 4) : null;
    const orderShare = hours > 0 ? roundTo(orderHours / hours, 4) : null;
    const flags = [];
    if (workingDaysSoFar > 0 && (workingDaysSoFar - days.size) / workingDaysSoFar > 0.1) flags.push('timesheet_gaps');
    if (hours > 0 && unmarkedHours / hours > 0.1) flags.push('unmarked');
    if (productivity !== null && productivity < 0.9) flags.push('slow');
    if (productivity !== null && productivity > 1.15) flags.push('fast');
    people.push({
      id: employee.id, name: String(employee.name || ''), workingDays: workingDaysSoFar, loggedDays: days.size,
      hours: roundTo(hours, 2), orderHours: roundTo(orderHours, 2), orderShare, unmarkedHours: roundTo(unmarkedHours, 2),
      reworkHours: roundTo(reworkHours, 2), productivity, flags,
    });
  }

  const totalWorkingDays = workingDays(from, to, holidays);
  const capacity = people.length * hoursPerDay * totalWorkingDays;
  const need = (plan) => (plan && totalWorkingDays > 0 ? roundTo(plan / (hoursPerDay * totalWorkingDays * prod), 1) : null);
  const headcount = {
    people: people.length, hoursPerDay, workingDays: totalWorkingDays, capacity,
    loadMedium: tiers?.medium && capacity > 0 ? roundTo(tiers.medium / capacity, 4) : null,
    loadAspiration: tiers?.aspiration && capacity > 0 ? roundTo(tiers.aspiration / capacity, 4) : null,
    needMedium: need(tiers?.medium), needAspiration: need(tiers?.aspiration),
  };

  let remainingSoldHours = 0;
  for (const order of orders) {
    if (!isAlive(order) || isCompleted(order) || !isCommercialOrder(order) || isUnpaidDraft(order)) continue;
    const deadline = day(order.deadline);
    if (!deadline || deadline < from || deadline > to) continue;
    remainingSoldHours += Math.max(0, num(order.total_hours_plan) - sumHours(entriesByOrder.get(String(order.id)) || []));
  }
  let remainingWorkingDays = 0;
  if (until && until < to) {
    const next = parseYmd(until);
    next.setUTCDate(next.getUTCDate() + 1);
    remainingWorkingDays = workingDays(ymd(next), to, holidays);
  } else if (!until) {
    remainingWorkingDays = totalWorkingDays;
  }
  const remainingCapacity = Math.round(people.length * hoursPerDay * remainingWorkingDays * prod);
  const outlook = {
    remainingSoldHours: roundTo(remainingSoldHours, 2), remainingWorkingDays, remainingCapacity,
    deltaPersonDays: hoursPerDay > 0 ? Math.round((remainingCapacity - remainingSoldHours) / hoursPerDay) : 0,
  };
  return { people, headcount, outlook };
}
