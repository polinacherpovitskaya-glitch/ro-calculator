import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseCsv, parsePlanCsv, tiersToPeriods, quarterOfDate, sumIncomeByQuarter, buildPayload, directionTreeIds, moneyQuarterWindow } from '../scripts/bonuses-plan-fact-sync.mjs';

const CSV = `2025,,,,,
,,,,,
1 квартал ,2 квартал ,3 квартал,4 квартал ,,
"р.5 600 000,00","р.8 000 000,00","р.10 000 000,00","р.14 000 000,00","р.37 600 000,00",base
"р.8 000 000,00","р.11 500 000,00","р.12 500 000,00","р.15 000 000,00","р.47 000 000,00",medium
"р.11 000 000,00","р.14 500 000,00","р.16 000 000,00","р.18 500 000,00","р.60 000 000,00",aspiration
"р.6 611 000,00","р.12 206 890,00","р.15 827 868,00","р.18 247 000,00","р.52 892 758,00",FACT
,,,,,
,,,,,
,,,,,
2026,,,,,
,,,,,
1 квартал ,2 квартал ,3 квартал,4 квартал ,,
"р.6 000 000,00","р.10 000 000,00","р.14 000 000,00","р.17 500 000,00","р.47 500 000,00",crisis/base
"р.8 000 000,00","р.12 500 000,00","р.15 500 000,00","р.18 500 000,00","р.54 500 000,00",medium
"р.7 500 000,00","р.15 000 000,00","р.17 000 000,00","р.20 000 000,00","р.59 500 000,00",aspiration
"р.5 196 000,00","р.15 620 000,00",,,"р.20 816 000,00",FACT
`;

test('parseMoney: рубли из таблицы', () => {
  assert.equal(parseMoney('р.6 000 000,00'), 6000000);
  assert.equal(parseMoney('р.12 206 890,00'), 12206890);
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('15.5'), 15.5);
});

test('parseCsv: кавычки и запятые', () => {
  const rows = parseCsv('"a,b",c\n"x""y",\n');
  assert.deepEqual(rows, [['a,b', 'c'], ['x"y', '']]);
});

test('parsePlanCsv + tiersToPeriods: план 2026 из таблицы, опечатка Q1 aspiration исправлена', () => {
  const tiers = parsePlanCsv(CSV, 2026);
  assert.deepEqual(tiers.base, [6000000, 10000000, 14000000, 17500000]);
  assert.deepEqual(tiers.medium, [8000000, 12500000, 15500000, 18500000]);
  assert.deepEqual(tiers.aspiration, [7500000, 15000000, 17000000, 20000000]);
  const periods = tiersToPeriods(2026, tiers);
  assert.deepEqual(periods['2026-Q3'], { min: 14000000, target: 15500000, max: 17000000 });
  assert.deepEqual(periods['2026-Q1'], { min: 6000000, target: 8000000, max: 8000000 });
  assert.equal(Object.keys(periods).length, 4);
  const tiers2025 = parsePlanCsv(CSV, 2025);
  assert.deepEqual(tiers2025.medium, [8000000, 11500000, 12500000, 15000000]);
  assert.equal(parsePlanCsv(CSV, 2027), null);
});

test('quarterOfDate и sumIncomeByQuarter: только поступления направления, без плановых и без двойного счёта', () => {
  assert.equal(quarterOfDate('2026-09-15'), '2026-Q3');
  assert.equal(quarterOfDate('2026-10-05'), '2026-Q3'); // до 7 октября ещё III квартал
  assert.equal(quarterOfDate('2026-10-08'), '2026-Q4');
  assert.equal(quarterOfDate('2026-07-03'), '2026-Q2'); // до 7 июля ещё II квартал
  assert.equal(quarterOfDate('2026-01-02'), '2025-Q4');
  assert.deepEqual(moneyQuarterWindow('2026-Q3'), { from: '2026-07-08', to: '2026-10-07' });
  assert.deepEqual(moneyQuarterWindow('2026-Q4'), { from: '2026-10-08', to: '2027-01-07' });
  const tx = [
    { id: '1', group: 'income', directionId: 7, date: '10.07.2026', value: 1000000 },
    { id: '2', group: 'income', directionId: 7, date: '20.08.2026', value: 500000.5 },
    { id: '3', group: 'income', directionId: 8, date: '20.08.2026', value: 999999 },
    { id: '4', group: 'expense', directionId: 7, date: '20.08.2026', value: 300000 },
    { id: '5', group: 'income', directionId: 7, date: '20.08.2026', value: 100, isPlan: true },
    { id: '6', group: 'income', directionId: 7, date: '10.10.2026', value: 250000 },
    { id: '7', group: 'income', directionId: 7, date: '05.09.2026', value: 400000 },
    { id: '8', group: 'income', directionId: 7, date: '05.09.2026', value: 400000, parentId: '7' },
  ];
  assert.deepEqual(sumIncomeByQuarter(tx, 7), { '2026-Q3': 1900000.5, '2026-Q4': 250000 });
  // parentId 0 у Финтабло значит «нет родителя», не должен ничего исключать
  const flat = [{ id: '10', group: 'income', directionId: 7, date: '10.07.2026', value: 5, parentId: 0 }, { id: '11', group: 'income', directionId: 7, date: '10.07.2026', value: 5, parentId: 0 }];
  assert.deepEqual(sumIncomeByQuarter(flat, 7), { '2026-Q3': 10 });
});

test('directionTreeIds: направление с поднаправлениями, как в Финтабло', () => {
  const directions = [
    { id: 31970, name: 'Recycle Object', parentId: null },
    { id: 32024, name: 'Музейные магазины Акрил', parentId: null },
    { id: 33181, name: 'Интернет магазин Recycle Object', parentId: 31970 },
    { id: 33999, name: 'Подподнаправление', parentId: 33181 },
    { id: 33182, name: 'Чужое', parentId: 32024 },
  ];
  assert.deepEqual([...directionTreeIds(directions, 31970)].sort(), ['31970', '33181', '33999']);
  const tx = [
    { id: '1', group: 'income', directionId: 33181, date: '15.09.2026', value: 1718.2, parentId: 0 },
    { id: '2', group: 'income', directionId: 31970, date: '15.09.2026', value: 100, parentId: 0 },
    { id: '3', group: 'income', directionId: 33182, date: '15.09.2026', value: 999, parentId: 0 },
  ];
  assert.deepEqual(sumIncomeByQuarter(tx, directionTreeIds(directions, 31970)), { '2026-Q3': 1818.2 });
});

test('buildPayload', () => {
  const payload = buildPayload({
    targetsByPeriod: { '2026-Q3': { min: 14000000, target: 15500000, max: 17000000 } },
    factsByPeriod: { '2026-Q3': 13824924 },
    note: 'Финтабло, синк 2026-09-15',
  });
  assert.deepEqual(payload, { periods: { '2026-Q3': {
    targets: { cash_in: { min: 14000000, target: 15500000, max: 17000000 } },
    fact: { value: 13824924, source: 'fintablo', note: 'Финтабло, синк 2026-09-15' },
  } } });
});
