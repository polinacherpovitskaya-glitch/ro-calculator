import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodBounds, holidaySet, workingDays, elapsedWorkingShare, achievement, DEFAULT_LADDER, DEFAULT_LEVEL_WEIGHTS,
  computeProductionPeriod, suggestProductionTargets, orderCompletionDate, computeYear, computeTeamStats, soldHoursForPeriod,
} from '../src/bonuses/calc.js';

test('periodBounds: 2026-Q3 → 01.07–30.09', () => {
  assert.deepEqual(periodBounds('2026-Q3'), { year: 2026, q: 3, from: '2026-07-01', to: '2026-09-30' });
  assert.deepEqual(periodBounds('2026-Q1'), { year: 2026, q: 1, from: '2026-01-01', to: '2026-03-31' });
  assert.throws(() => periodBounds('2026-Q5'), /INVALID_PERIOD/);
  assert.throws(() => periodBounds('Q3'), /INVALID_PERIOD/);
});

test('holidaySet и workingDays', () => {
  const holidays = holidaySet({ production_holidays: '2026-09-07, 2026-09-08;2026-13-99' });
  assert.equal(holidays.size, 2);
  assert.equal(workingDays('2026-09-07', '2026-09-11', holidays), 3);
  assert.equal(workingDays('2026-09-12', '2026-09-13', holidays), 0);
  assert.equal(workingDays('2026-07-01', '2026-09-30', new Set()), 66);
});

test('elapsedWorkingShare', () => {
  const none = new Set();
  assert.equal(elapsedWorkingShare('2026-Q3', '2026-06-30', none), 0);
  assert.equal(elapsedWorkingShare('2026-Q3', '2026-10-05', none), 1);
  const share = elapsedWorkingShare('2026-Q3', '2026-09-09', none);
  assert.equal(share, workingDays('2026-07-01', '2026-09-09', none) / workingDays('2026-07-01', '2026-09-30', none));
});

test('achievement: больше лучше, линейно между уровнями, выше aspiration рост до потолка', () => {
  const thr = { min: 1330, target: 1512, max: 1693 };
  assert.equal(achievement(1000, thr, 'higher', DEFAULT_LADDER), 0.25);
  assert.equal(achievement(1330, thr, 'higher', DEFAULT_LADDER), 0.5);
  assert.equal(achievement(1512, thr, 'higher', DEFAULT_LADDER), 1);
  assert.ok(Math.abs(achievement(1550, thr, 'higher', DEFAULT_LADDER) - 1.105) < 0.001);
  assert.equal(achievement(1693, thr, 'higher', DEFAULT_LADDER), 1.5);
  assert.ok(Math.abs(achievement(1874, thr, 'higher', DEFAULT_LADDER) - 2) < 0.001); // +181 ч = ещё один шаг
  assert.equal(achievement(5000, thr, 'higher', DEFAULT_LADDER), 2);
  assert.equal(achievement(5000, thr, 'higher', { below_min: 0, min: 0.5, target: 1, max: 1.5 }), 1.5); // старая шкала без cap
  assert.equal(achievement(null, thr, 'higher', DEFAULT_LADDER), null);
});

test('achievement: меньше лучше', () => {
  const thr = { min: 0.08, target: 0.05, max: 0.02 };
  assert.equal(achievement(0.10, thr, 'lower', DEFAULT_LADDER), 0.25);
  assert.equal(achievement(0.08, thr, 'lower', DEFAULT_LADDER), 0.5);
  assert.equal(achievement(0.05, thr, 'lower', DEFAULT_LADDER), 1);
  assert.ok(Math.abs(achievement(0.04, thr, 'lower', DEFAULT_LADDER) - 1.1667) < 0.001);
  assert.ok(Math.abs(achievement(0.01, thr, 'lower', DEFAULT_LADDER) - 1.6667) < 0.001);
});

test('achievement: target = max → попадание в цель даёт ровно 1, выше не бывает', () => {
  assert.equal(achievement(10, { min: 10, target: 10, max: 10 }, 'higher', DEFAULT_LADDER), 1);
  assert.equal(achievement(9, { min: 10, target: 10, max: 10 }, 'higher', DEFAULT_LADDER), 0.25);
  const onTime = { min: 0.85, target: 1, max: 1 };
  assert.equal(achievement(1, onTime, 'higher', DEFAULT_LADDER), 1);
  assert.ok(Math.abs(achievement(0.95, onTime, 'higher', DEFAULT_LADDER) - 0.8333) < 0.001);
  assert.equal(achievement(0.8, onTime, 'higher', DEFAULT_LADDER), 0.25);
  const rework = { min: 0.05, target: 0, max: 0 };
  assert.equal(achievement(0, rework, 'lower', DEFAULT_LADDER), 1);
  assert.ok(Math.abs(achievement(0.02, rework, 'lower', DEFAULT_LADDER) - 0.8) < 0.001);
  assert.equal(achievement(0.1, rework, 'lower', DEFAULT_LADDER), 0.25);
});

const scheme = {
  id: 7, employee_id: 5,
  rates_json: { rate: 75 },
  quality_json: { weights: { productivity: 0.5, on_time_share: 0.3, rework_share: 0.2 } },
  ladder_json: { below_min: 0.25, min: 0.5, target: 1, max: 1.5, cap: 2 },
};
const targets = {
  output_hours: { min: 1330, target: 1512, max: 1693 },
  productivity: { min: 0.9, target: 1.0, max: 1.15 },
  on_time_share: { min: 0.7, target: 0.85, max: 0.95 },
  rework_share: { min: 0.08, target: 0.05, max: 0.02 },
};

// Факты примера спеки: выпуск 1550, производительность 1.05, в срок 0.9, переделки 0.04
function specFixture() {
  const orders = [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: i + 1, order_name: `З${i}`, status: 'completed', production_purpose: 'commercial',
      total_hours_plan: 155, deadline: '2026-09-20',
      completed_at: i === 9 ? '2026-09-25T00:00:00.000Z' : '2026-09-10T00:00:00.000Z',
    })),
    { id: 99, order_name: 'Переделка', status: 'in_production', production_purpose: 'rework', total_hours_plan: 1 },
  ];
  const commercialHours = 1550 / 1.05;
  const reworkHours = (0.04 / 0.96) * commercialHours;
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-08-01', hours: commercialHours, order_id: 1 },
    { id: 2, employee_id: 5, date: '2026-08-02', hours: reworkHours, order_id: 99 },
  ];
  return { orders, timeEntries };
}

test('computeProductionPeriod: веса 0.5/0.3/0.2 дают 153 073 ₽ без плана по деньгам', () => {
  const { orders, timeEntries } = specFixture();
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(),
  });
  assert.equal(result.output.fact, 1550);
  assert.ok(Math.abs(result.output.achievement - 1.105) < 0.001);
  assert.ok(Math.abs(result.output.rateApplied - 82.87) < 0.01);
  assert.ok(Math.abs(result.quality.multiplier - 1.1917) < 0.001);
  assert.ok(Math.abs(result.amountComputed - 153073) <= 3);
  assert.ok(result.warnings.some((w) => w.code === 'no_money_plan'));
});

test('computeProductionPeriod: веса по умолчанию 0.5/0.3/0.2, норма по сроку и переделкам даёт 1', () => {
  const { orders, timeEntries } = specFixture();
  const defaultScheme = { ...scheme, quality_json: {} };
  const defaultTargets = { output_hours: targets.output_hours };
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: defaultScheme, targets: defaultTargets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(),
  });
  const onTime = result.quality.metrics.find((m) => m.key === 'on_time_share');
  const rework = result.quality.metrics.find((m) => m.key === 'rework_share');
  assert.equal(onTime.weight, 0.3);
  assert.equal(onTime.informational, false);
  // 9 из 10 в срок при планках 0.85 / 1 / 1 → 0.6667; переделки 4% при 0.05 / 0 / 0 → 0.6
  assert.ok(Math.abs(onTime.achievement - 0.6667) < 0.001);
  assert.ok(Math.abs(rework.achievement - 0.6) < 0.001);
  // 0.5 × 1.1667 + 0.3 × 0.6667 + 0.2 × 0.6 = 0.9033
  assert.ok(Math.abs(result.quality.multiplier - 0.9033) < 0.001);
  const perfect = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: defaultScheme, targets: defaultTargets,
    orders: orders.filter((o) => o.id !== 10 && o.id !== 99).map((o) => ({ ...o })), timeEntries: [timeEntries[0]],
    settings: {}, stockApprovals: new Set(),
  });
  const pOnTime = perfect.quality.metrics.find((m) => m.key === 'on_time_share');
  const pRework = perfect.quality.metrics.find((m) => m.key === 'rework_share');
  assert.equal(pOnTime.achievement, 1);
  assert.equal(pRework.achievement, 1);
});

test('деньги ниже часов не тянут уровень вниз', () => {
  const { orders, timeEntries } = specFixture();
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(),
    teamMoney: { fact: 14400000, thresholds: { min: 14000000, target: 15500000, max: 17000000 } },
  });
  assert.deepEqual(DEFAULT_LEVEL_WEIGHTS, { output: 0.7, money: 0.3 });
  assert.ok(Math.abs(result.money.achievement - 0.6333) < 0.001);
  assert.ok(Math.abs(result.money.blend - 0.9635) < 0.001);
  assert.ok(Math.abs(result.level - 1.105) < 0.001);
  assert.ok(Math.abs(result.output.rateApplied - 82.87) < 0.01);
  assert.ok(Math.abs(result.amountComputed - 153073) <= 3);
  assert.ok(!result.warnings.some((w) => w.code === 'no_money_plan'));
});

test('деньги выше часов поднимают уровень', () => {
  const { orders, timeEntries } = specFixture();
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(),
    teamMoney: { fact: 17000000, thresholds: { min: 14000000, target: 15500000, max: 17000000 } },
  });
  assert.ok(Math.abs(result.level - 1.2235) < 0.001);
  assert.ok(Math.abs(result.output.rateApplied - 91.76) < 0.01);
  assert.ok(Math.abs(result.amountComputed - 169493) <= 3);
});

test('уровни от проданного: продано меньше плана', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 900, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const timeEntries = [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 900, order_id: 1 }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: { ...scheme, quality_json: productivityOnly }, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(), soldHours: 900,
  });
  assert.deepEqual(result.output.thresholdsEffective, { min: 792, target: 900, max: 1008 });
  assert.deepEqual(result.output.thresholds, targets.output_hours);
  assert.equal(result.output.soldHours, 900);
  assert.ok(Math.abs(result.output.achievement - 1) < 0.001);
  assert.ok(result.warnings.some((w) => w.code === 'sold_below_plan'));
  assert.equal(result.amountComputed, Math.round(900 * 75 * 1 * 1.0));
});

test('уровни от проданного: выше проданного, но ниже плана → не выше medium', () => {
  // Продано 1044 из плана 1512, сделано 1173 (как в Q3 2026): по пересчитанным
  // планкам это выше aspiration, но реального плана нет → уровень 1.0, ставка 75.
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 1173, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const timeEntries = [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 1173, order_id: 1 }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: { ...scheme, quality_json: productivityOnly }, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(), soldHours: 1044,
  });
  assert.deepEqual(result.output.thresholdsEffective, { min: 918, target: 1044, max: 1169 });
  assert.equal(result.output.achievement, 1);
  assert.equal(result.output.scaledCapped, true);
  assert.equal(result.output.remainingSoldHours, 0);
  assert.equal(result.output.rateApplied, 75);
  assert.equal(result.amountComputed, Math.round(1173 * 75 * 1));
});

test('remainingSoldHours: проданное с дедлайном в квартале, ещё не сделанное', () => {
  const orders = [
    { id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' },
    { id: 2, status: 'in_production', production_purpose: 'commercial', total_hours_plan: 300, deadline: '2026-09-25' },
    { id: 3, status: 'in_production', production_purpose: 'commercial', total_hours_plan: 200, deadline: '2026-10-25' },
    { id: 4, status: 'draft', payment_status: 'not_sent', production_purpose: 'commercial', total_hours_plan: 100, deadline: '2026-09-25' },
  ];
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-08-01', hours: 500, order_id: 1 },
    { id: 2, employee_id: 5, date: '2026-09-01', hours: 120, order_id: 2 },
  ];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-09-15', status: 'open', scheme: { ...scheme, quality_json: productivityOnly }, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(), soldHours: 800,
  });
  assert.equal(result.output.remainingSoldHours, 180);
  assert.deepEqual(result.output.remainingSoldOrders, [2]);
});

test('уровни от проданного: сделано больше реального плана → считается от плана', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 1600, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const timeEntries = [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 1600, order_id: 1 }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: { ...scheme, quality_json: productivityOnly }, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(), soldHours: 1044,
  });
  assert.ok(Math.abs(result.output.achievement - (1 + 0.5 * (1600 - 1512) / (1693 - 1512))) < 0.001);
  assert.equal(result.output.scaledCapped, false);
});

test('soldHoursForPeriod: дедлайн в периоде, живые, не черновики без счёта', () => {
  const orders = [
    { id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 100, deadline: '2026-09-20' },
    { id: 2, status: 'in_production', production_purpose: 'commercial', total_hours_plan: 200, deadline: '2026-08-01' },
    { id: 3, status: 'draft', payment_status: 'not_sent', production_purpose: 'commercial', total_hours_plan: 50, deadline: '2026-08-01' },
    { id: 4, status: 'draft', payment_status: 'sent', production_purpose: 'commercial', total_hours_plan: 30, deadline: '2026-08-01' },
    { id: 5, status: 'cancelled', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-08-01' },
    { id: 6, status: 'in_production', production_purpose: 'stock_sample', total_hours_plan: 40, deadline: '2026-08-01' },
    { id: 7, status: 'in_production', production_purpose: 'commercial', total_hours_plan: 70, deadline: '2026-10-01' },
  ];
  assert.equal(soldHoursForPeriod(orders, '2026-Q3'), 330);
});

test('computeProductionPeriod: склад, предупреждения, границы периода', () => {
  const orders = [
    { id: 1, order_name: 'А', status: 'completed', production_purpose: 'commercial', total_hours_plan: 1000, deadline: '2026-09-20', completed_at: '2026-09-10T10:00:00.000Z' },
    { id: 2, order_name: 'Образцы', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 40, completed_at: '2026-08-01T10:00:00.000Z' },
    { id: 3, order_name: 'Сток', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 50, completed_at: '2026-08-02T10:00:00.000Z' },
    { id: 4, order_name: 'Старый', status: 'completed', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-06-01', completed_at: '2026-06-20T10:00:00.000Z' },
    { id: 5, order_name: 'Без часов', status: 'completed', production_purpose: 'commercial', total_hours_plan: 0, deadline: '2026-09-05', completed_at: '2026-09-02T10:00:00.000Z' },
    { id: 6, order_name: 'Без дедлайна', status: 'completed', production_purpose: 'commercial', total_hours_plan: 10, completed_at: '2026-09-03T10:00:00.000Z' },
    { id: 7, order_name: 'Отменён', status: 'cancelled', production_purpose: 'commercial', total_hours_plan: 100, completed_at: '2026-09-03T10:00:00.000Z' },
  ];
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-08-05', hours: 900, order_id: 1 },
    { id: 2, employee_id: 6, date: '2026-08-08', hours: 3, order_id: null },
  ];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(['2']),
  });
  assert.equal(result.output.fact, 1050);
  assert.equal(result.output.commercialHours, 1010);
  assert.equal(result.output.internalHours, 40);
  assert.equal(result.output.unmarkedHours, 3);
  // часы без заказа: половина ставки, отдельной строкой, не в уровне
  assert.equal(result.unmarked.hours, 3);
  assert.equal(result.unmarked.share, 0.5);
  assert.equal(result.unmarked.amount, Math.round(3 * result.output.rateApplied * 0.5));
  assert.equal(result.amountComputed, result.amountBase + result.unmarked.amount);
  const noPay = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: { ...scheme, quality_json: { ...scheme.quality_json, unmarked_rate_share: 0 } }, targets, orders, timeEntries,
    settings: {}, stockApprovals: new Set(['2']),
  });
  assert.equal(noPay.unmarked.amount, 0);
  assert.equal(noPay.amountComputed, noPay.amountBase);
  assert.equal(result.orders.find((o) => o.id === 3).included, false);
  assert.equal(result.orders.find((o) => o.id === 4), undefined);
  assert.equal(result.orders.find((o) => o.id === 7), undefined);
  assert.equal(result.warnings.find((w) => w.code === 'unmarked_hours').hours, 3);
  assert.deepEqual(result.warnings.find((w) => w.code === 'no_hours').orderIds, [5]);
  assert.deepEqual(result.warnings.find((w) => w.code === 'no_deadline').orderIds, [6]);
  const onTime = result.quality.metrics.find((m) => m.key === 'on_time_share');
  assert.equal(onTime.fact, 1);
});

test('on_time_share: заказы с оценочной датой завершения не участвуют', () => {
  const orders = [
    { id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 100, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' },
    { id: 2, status: 'completed', production_purpose: 'commercial', total_hours_plan: 100, deadline: '2026-08-01', updated_at: '2026-09-25T00:00:00.000Z' },
  ];
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-09-01', hours: 100, order_id: 1 },
    { id: 2, employee_id: 5, date: '2026-09-02', hours: 100, order_id: 2 },
  ];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries, settings: {}, stockApprovals: new Set(),
  });
  const onTime = result.quality.metrics.find((m) => m.key === 'on_time_share');
  assert.equal(onTime.fact, 1); // только заказ 1; заказ 2 с оценочной датой исключён
  assert.ok(result.warnings.some((w) => w.code === 'estimated_dates' && w.orderIds.includes(2)));
  const onlyEstimated = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders: [orders[1]], timeEntries: [timeEntries[1]], settings: {}, stockApprovals: new Set(),
  });
  const neutral = onlyEstimated.quality.metrics.find((m) => m.key === 'on_time_share');
  assert.equal(neutral.available, false);
  assert.equal(neutral.achievement, 1); // нейтрально
});

test('computeProductionPeriod: пустой табель → A_prod 0.5 и предупреждение', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 1512, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme, targets, orders, timeEntries: [], settings: {}, stockApprovals: new Set(),
  });
  const prod = result.quality.metrics.find((m) => m.key === 'productivity');
  assert.equal(prod.available, false);
  assert.equal(prod.achievement, 0.5);
  assert.ok(result.warnings.some((w) => w.code === 'no_timesheet'));
  assert.ok(result.warnings.some((w) => w.code === 'no_period_hours'));
  // A_out = 1, rate 75; в срок 100% при 0.7/0.85/0.95 → потолок качества 1.5; quality = 0.5*0.5 + 0.3*1.5 + 0.2*1 = 0.9
  assert.equal(result.amountComputed, Math.round(1512 * 75 * 0.9));
});

const productivityOnly = { weights: { productivity: 1, on_time_share: 0, rework_share: 0 } };

test('computeProductionPeriod: ниже base платится четверть ставки', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 1000, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: { ...scheme, quality_json: productivityOnly }, targets, orders,
    timeEntries: [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 1000, order_id: 1 }], settings: {}, stockApprovals: new Set(),
  });
  assert.equal(result.output.achievement, 0.25);
  assert.equal(result.output.rateApplied, 18.75);
  assert.equal(result.amountComputed, Math.round(1000 * 18.75 * 1)); // производительность 1,0
});

test('computeProductionPeriod: выше aspiration ставка продолжает расти', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 1874, deadline: '2026-09-20', completed_at: '2026-09-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-10-05', status: 'open', scheme: { ...scheme, quality_json: productivityOnly }, targets, orders,
    timeEntries: [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 1874, order_id: 1 }], settings: {}, stockApprovals: new Set(),
  });
  assert.ok(Math.abs(result.output.achievement - 2) < 0.001);
  assert.equal(result.output.rateApplied, 150);
});

test('computeProductionPeriod: прогноз по доле рабочих дней', () => {
  const orders = [{ id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 800, deadline: '2026-09-20', completed_at: '2026-08-10T00:00:00.000Z' }];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-08-14', status: 'open', scheme, targets, orders,
    timeEntries: [{ id: 1, employee_id: 5, date: '2026-08-01', hours: 800, order_id: 1 }], settings: {}, stockApprovals: new Set(),
  });
  const none = new Set();
  const share = workingDays('2026-07-01', '2026-08-14', none) / workingDays('2026-07-01', '2026-09-30', none);
  assert.ok(Math.abs(result.output.forecast - 800 / share) < 1);
  assert.ok(result.output.forecastAmount > 0);
});

test('timesheet_gaps: дни без табеля по каждому производственнику', () => {
  const employees = [
    { id: 5, name: 'Женя', role: 'production', is_active: true },
    { id: 6, name: 'Тая', role: 'production', is_active: true },
    { id: 7, name: 'Аня', role: 'sales', is_active: true },
    { id: 8, name: 'Бывший', role: 'production', is_active: false },
  ];
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-07-01', hours: 9, order_id: 1 },
    { id: 2, employee_id: 5, date: '2026-07-02', hours: 9, order_id: 1 },
    { id: 3, employee_id: 5, date: '2026-07-03', hours: 9, order_id: 1 },
    { id: 4, employee_id: 6, date: '2026-07-01', hours: 9, order_id: null },
  ];
  const result = computeProductionPeriod({
    period: '2026-Q3', today: '2026-07-03', status: 'open', scheme, targets, orders: [], timeEntries,
    settings: { production_holidays: '' }, stockApprovals: new Set(), employees,
  });
  const gaps = result.warnings.find((w) => w.code === 'timesheet_gaps');
  assert.equal(gaps.count, 2);
  assert.deepEqual(gaps.byEmployee, [{ id: 6, name: 'Тая', days: 2 }]);
});

test('orderCompletionDate', () => {
  assert.deepEqual(orderCompletionDate({ completed_at: '2026-09-10T10:00:00.000Z' }, []), { date: '2026-09-10', estimated: false });
  assert.deepEqual(orderCompletionDate({ updated_at: '2026-09-30T10:00:00.000Z' }, [{ date: '2026-09-01' }, { date: '2026-09-12' }]), { date: '2026-09-12', estimated: true });
  assert.deepEqual(orderCompletionDate({ updated_at: '2026-09-30T10:00:00.000Z' }, []), { date: '2026-09-30', estimated: true });
  assert.deepEqual(orderCompletionDate({}, []), { date: null, estimated: true });
});

test('suggestProductionTargets: три уровня из сезонного плана, иначе формула', () => {
  const fromPlan = suggestProductionTargets({ period: '2026-Q3', settings: { seasonal_load_plan_json: JSON.stringify({ Q1: 864, Q2: 1296, Q3: 1512, Q4: 1728 }) } });
  assert.equal(fromPlan.source, 'plan');
  assert.deepEqual(fromPlan.targets.output_hours, { min: 1331, target: 1512, max: 1693 });
  assert.deepEqual(fromPlan.targets.rework_share, { min: 0.05, target: 0, max: 0 });
  assert.deepEqual(fromPlan.targets.on_time_share, { min: 0.85, target: 1, max: 1 });
  const fromFormula = suggestProductionTargets({ period: '2026-Q3', settings: { workers_count: 4, hours_per_worker: 180, work_load_ratio: 0.7 } });
  assert.equal(fromFormula.source, 'formula');
  assert.equal(fromFormula.targets.output_hours.target, 1512);
});

test('computeYear: слабый квартал доплачивается до годового уровня', () => {
  const result = computeYear({
    year: 2026, scheme,
    quarters: [
      { period: '2026-Q1', thresholds: { min: 760, target: 864, max: 968 }, fact: 600, achievement: 0 },
      { period: '2026-Q2', thresholds: { min: 1140, target: 1296, max: 1452 }, fact: 1300, achievement: 1.0128 },
      { period: '2026-Q3', thresholds: { min: 1330, target: 1512, max: 1693 }, fact: 1550, achievement: 1.105 },
      { period: '2026-Q4', thresholds: { min: 1520, target: 1728, max: 1935 }, fact: 1800, achievement: 1.1739 },
    ],
  });
  assert.equal(result.factSum, 5250);
  assert.deepEqual(result.thresholdsSum, { min: 4750, target: 5400, max: 6048 });
  assert.ok(Math.abs(result.achievement - 0.8846) < 0.001);
  assert.equal(result.quartersCounted, 4);
  assert.equal(result.quarters[0].topUp, 39808);
  assert.equal(result.quarters[1].topUp, 0);
  assert.equal(result.topUp, 39808);
});

test('computeYear: кварталы без целей не считаются', () => {
  const result = computeYear({
    year: 2026, scheme,
    quarters: [
      { period: '2026-Q3', thresholds: { min: 1330, target: 1512, max: 1693 }, fact: 1693, achievement: 1.5 },
      { period: '2026-Q4', thresholds: null, fact: null, achievement: null },
    ],
  });
  assert.equal(result.quartersCounted, 1);
  assert.equal(result.achievement, 1.5);
  assert.equal(result.topUp, 0);
});

test('computeTeamStats: люди, состав, прогноз', () => {
  const employees = [
    { id: 5, name: 'Женя', role: 'production', is_active: true },
    { id: 6, name: 'Тая', role: 'production', is_active: true },
    { id: 7, name: 'Аня', role: 'sales', is_active: true },
  ];
  const orders = [
    { id: 1, status: 'completed', production_purpose: 'commercial', total_hours_plan: 100, deadline: '2026-08-01', completed_at: '2026-07-03T00:00:00.000Z' },
    { id: 2, status: 'in_production', production_purpose: 'commercial', total_hours_plan: 200, deadline: '2026-09-20' },
    { id: 3, status: 'in_production', production_purpose: 'rework', total_hours_plan: 5 },
  ];
  const timeEntries = [
    { id: 1, employee_id: 5, date: '2026-07-01', hours: 9, order_id: 1 },
    { id: 2, employee_id: 5, date: '2026-07-02', hours: 9, order_id: 1 },
    { id: 3, employee_id: 5, date: '2026-07-03', hours: 42, order_id: 1 },
    { id: 4, employee_id: 6, date: '2026-07-01', hours: 20, order_id: 1 },
    { id: 5, employee_id: 6, date: '2026-07-02', hours: 50, order_id: 2 },
    { id: 6, employee_id: 6, date: '2026-07-03', hours: 4, order_id: null },
    { id: 7, employee_id: 6, date: '2026-07-03', hours: 3, order_id: 3 },
  ];
  const stats = computeTeamStats({
    period: '2026-Q3', today: '2026-07-03', orders, timeEntries, employees,
    settings: { planning_hours_per_day: 9, production_holidays: '' }, shopProductivity: 1.25, tiers: { medium: 1512, aspiration: 1693 },
  });
  const zhenya = stats.people.find((p) => p.id === 5);
  assert.equal(zhenya.workingDays, 3);
  assert.equal(zhenya.loggedDays, 3);
  assert.equal(zhenya.hours, 60);
  assert.equal(zhenya.orderHours, 60);
  assert.ok(Math.abs(zhenya.productivity - 1.25) < 0.001);
  const taya = stats.people.find((p) => p.id === 6);
  assert.equal(taya.unmarkedHours, 4);
  assert.equal(taya.reworkHours, 3);
  assert.ok(Math.abs(taya.productivity - 1.25) < 0.001);
  assert.ok(stats.people.every((p) => p.id !== 7));
  assert.equal(stats.headcount.people, 2);
  assert.equal(stats.headcount.workingDays, 66);
  assert.equal(stats.headcount.capacity, 2 * 9 * 66);
  assert.ok(Math.abs(stats.headcount.needMedium - 1512 / (9 * 66 * 1.25)) < 0.06);
  assert.equal(stats.outlook.remainingSoldHours, 150);
  assert.equal(stats.outlook.remainingWorkingDays, 63);
  assert.equal(stats.outlook.remainingCapacity, Math.round(2 * 9 * 63 * 1.25));
  assert.equal(stats.outlook.deltaPersonDays, Math.round((Math.round(2 * 9 * 63 * 1.25) - 150) / 9));
});
