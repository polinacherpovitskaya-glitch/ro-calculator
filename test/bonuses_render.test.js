const assert = require('node:assert');
const { test } = require('node:test');
const {
    bonusesCurrentPeriod, bonusesPeriodOptions, formatRub, formatMetricValue, renderOutputRow, renderLevelRow, renderQualityRow,
    renderBonusCard, renderWarnings, renderTeamBlock, renderPeopleBlock,
} = require('../js/bonuses.js');

test('bonusesCurrentPeriod и bonusesPeriodOptions', () => {
    assert.equal(bonusesCurrentPeriod(new Date(2026, 8, 15)), '2026-Q3');
    assert.equal(bonusesCurrentPeriod(new Date(2026, 0, 2)), '2026-Q1');
    const options = bonusesPeriodOptions(new Date(2026, 8, 15));
    assert.equal(options.length, 8);
    assert.equal(options[0], '2024-Q4');
    assert.equal(options[7], '2026-Q3');
});

test('formatRub и formatMetricValue', () => {
    assert.equal(formatRub(153073), '153 073 ₽');
    assert.equal(formatMetricValue('output_hours', 1550), '1 550 ч');
    assert.equal(formatMetricValue('productivity', 1.0523), '1,05');
    assert.equal(formatMetricValue('on_time_share', 0.9), '90%');
    assert.equal(formatMetricValue('rework_share', null), '—');
    assert.equal(formatMetricValue('cash_in', 14400000), '14 400 000 ₽');
});

test('renderOutputRow: уровни, факт, прогноз, пересчёт от проданного', () => {
    const html = renderOutputRow({
        fact: 1550, thresholds: { min: 1330, target: 1512, max: 1693 }, thresholdsEffective: { min: 1330, target: 1512, max: 1693 },
        soldHours: 1600, achievement: 1.1123, rateApplied: 82.87, forecast: 1610, forecastAchievement: 1.27, forecastAmount: 170000,
    }, 75);
    assert.match(html, /bn-output/);
    assert.match(html, /1 550 ч/);
    assert.match(html, /1 330/);
    assert.match(html, /1 693/);
    assert.match(html, /1,11/);
    assert.match(html, /уровень по часам/);
    assert.match(html, /прогноз 1 610 ч/);
    const scaled = renderOutputRow({
        fact: 900, thresholds: { min: 1330, target: 1512, max: 1693 }, thresholdsEffective: { min: 792, target: 900, max: 1008 },
        soldHours: 900, achievement: 1, rateApplied: 75, forecast: null, forecastAchievement: null, forecastAmount: null,
    }, 75);
    assert.match(scaled, /продано 900 ч из плана 1 512 ч, уровни пересчитаны/);
    assert.match(scaled, /1 008/);
});

test('renderLevelRow: формула уровня', () => {
    const html = renderLevelRow({ rate: 75, level: 1.1123, output: { achievement: 1.1123, rateApplied: 83.42 }, money: { achievement: 0.6333, blend: 0.9686 } });
    assert.match(html, /max\(часы 1,11; 0,7 × 1,11 \+ 0,3 × 0,63 = 0,97\) = 1,11/);
    assert.match(html, /83,42 ₽\/ч/);
    const noMoney = renderLevelRow({ rate: 75, level: 1.1123, output: { achievement: 1.1123, rateApplied: 83.42 }, money: { achievement: null } });
    assert.match(noMoney, /план по деньгам не задан/);
});

test('renderQualityRow: доступный, недоступный и информационный показатель', () => {
    const ok = renderQualityRow({ key: 'on_time_share', label: 'В срок', direction: 'higher', weight: 0.3, thresholds: { min: 0.7, target: 0.85, max: 0.95 }, fact: 0.9, achievement: 1.25, available: true });
    assert.match(ok, /90%/);
    assert.match(ok, /125%/);
    assert.match(ok, /вес 30%/);
    const none = renderQualityRow({ key: 'productivity', label: 'Производительность', direction: 'higher', weight: 1, thresholds: { min: 0.9, target: 1, max: 1.15 }, fact: null, achievement: 0.5, available: false });
    assert.match(none, /нет данных/);
    assert.match(none, /50%/);
    const info = renderQualityRow({ key: 'rework_share', label: 'Переделки', direction: 'lower', weight: 0, thresholds: { min: 0.08, target: 0.05, max: 0.02 }, fact: 0.01, achievement: 1.5, available: true });
    assert.match(info, /информация, в деньги не входит/);
});

test('renderBonusCard: формула, итог, детали под карточкой', () => {
    const html = renderBonusCard({
        schemeId: 7, employeeId: 5, employeeName: 'Лёша', kind: 'production', resultStatus: 'open', rate: 75, level: 1.105,
        output: { fact: 1550, thresholds: { min: 1330, target: 1512, max: 1693 }, thresholdsEffective: { min: 1330, target: 1512, max: 1693 }, soldHours: 1600, achievement: 1.105, rateApplied: 82.87, forecast: null, forecastAchievement: null, forecastAmount: null },
        money: { fact: null, thresholds: null, achievement: null, blend: null },
        quality: { multiplier: 1.1917, metrics: [
            { key: 'productivity', label: 'Производительность', direction: 'higher', weight: 1, thresholds: { min: 0.9, target: 1, max: 1.15 }, fact: 1.05, achievement: 1.1667, available: true },
            { key: 'on_time_share', label: 'В срок', direction: 'higher', weight: 0, thresholds: { min: 0.7, target: 0.85, max: 0.95 }, fact: 0.9, achievement: 1.25, available: true },
        ] },
        amountComputed: 153073, amountFinal: null, warnings: [],
        orders: [{ id: 1, name: 'Заказ', purpose: 'commercial', hoursPlan: 10, hoursFact: 9, deadline: '2026-09-20', completedAt: '2026-09-10', estimated: false, onTime: true, approved: null, included: true }],
        adjustments: [], targetsDrift: false, hasTargets: true,
    }, { expanded: true });
    assert.match(html, /Лёша/);
    assert.match(html, /153 073 ₽/);
    assert.match(html, /1 550 ч × 82,87 ₽ × 1,19/);
    assert.match(html, /bn-card-details/);
    assert.match(html, /Закрыть квартал/);
    assert.match(html, /Производительность/);
    assert.doesNotMatch(html, /data-metric="on_time_share"/, 'строки с весом 0 на карточке не показываются');
    assert.match(html, /к выплате за квартал/);
});

test('renderBonusCard: без целей вместо суммы прочерк и подсказка', () => {
    const html = renderBonusCard({
        schemeId: 7, employeeId: 5, employeeName: 'Лёша', kind: 'production', resultStatus: 'open', rate: 75, level: null,
        output: { fact: 0, thresholds: null, thresholdsEffective: null, soldHours: null, achievement: null, rateApplied: 0, forecast: null, forecastAchievement: null, forecastAmount: null },
        money: { fact: null, thresholds: null, achievement: null, blend: null },
        quality: { multiplier: 0, metrics: [] }, amountComputed: 0, amountFinal: null, warnings: [], orders: [], adjustments: [], targetsDrift: false, hasTargets: false,
    });
    assert.match(html, /задайте цели квартала/);
    assert.doesNotMatch(html, /0 ₽<small>/);
});

test('renderWarnings', () => {
    const html = renderWarnings([
        { code: 'unmarked_hours', count: 0, hours: 3, orderIds: [] },
        { code: 'no_timesheet', count: 0, hours: 0, orderIds: [] },
        { code: 'timesheet_gaps', count: 2, hours: 0, orderIds: [], byEmployee: [{ id: 6, name: 'Тая', days: 2 }] },
    ]);
    assert.match(html, /без заказа: 3 ч/);
    assert.match(html, /Табель по завершённым заказам пустой/);
    assert.match(html, /Дни без табеля: 2\. Тая: 2/);
});

test('renderTeamBlock: уровни, факт из Финтабло, A_cash', () => {
    const html = renderTeamBlock({ commercial: {
        targets: { cash_in: { min: 14000000, target: 15500000, max: 17000000 } },
        facts: { cash_in: { value: 14400000, source: 'manual', note: 'Финтабло 15.09', updated_at: '2026-09-15T10:00:00.000Z' } },
        cashAchievement: 0.6333,
    } }, '2026-Q3');
    assert.match(html, /bn-team/);
    assert.match(html, /14 400 000 ₽/);
    assert.match(html, /14 000 000/);
    assert.match(html, /17 000 000/);
    assert.match(html, /уровень 0,63/);
    assert.match(html, /Финтабло 15\.09/);
    assert.match(html, /введено вручную/);
    const auto = renderTeamBlock({ commercial: { targets: { cash_in: { min: 1, target: 2, max: 3 } }, facts: { cash_in: { value: 2, source: 'fintablo', note: 'Финтабло, синк 2026-09-16', updated_at: '2026-09-16T04:15:00.000Z' } }, cashAchievement: 1 } }, '2026-Q3');
    assert.match(auto, /из Финтабло автоматически/);
    assert.match(html, /План и факт по деньгам/);
    const none = renderTeamBlock({ commercial: { targets: null, facts: {}, cashAchievement: null } }, '2026-Q3');
    assert.match(none, /ещё не пришёл из таблицы/);
});

test('renderPeopleBlock: таблица людей, состав, прогноз', () => {
    const html = renderPeopleBlock({
        people: [
            { id: 5, name: 'Женя', workingDays: 40, loggedDays: 40, hours: 360, orderHours: 350, orderShare: 0.972, unmarkedHours: 10, reworkHours: 0, productivity: 1.08, flags: [] },
            { id: 6, name: 'Тая', workingDays: 40, loggedDays: 31, hours: 280, orderHours: 200, orderShare: 0.714, unmarkedHours: 80, reworkHours: 12, productivity: 0.86, flags: ['timesheet_gaps', 'unmarked', 'slow'] },
        ],
        headcount: { people: 4, hoursPerDay: 9, workingDays: 66, capacity: 2376, loadMedium: 0.6364, loadAspiration: 0.7125, needMedium: 2.7, needAspiration: 3.0 },
        outlook: { remainingSoldHours: 640, remainingWorkingDays: 11, remainingCapacity: 416, deltaPersonDays: -25 },
    });
    assert.match(html, /bn-people/);
    assert.match(html, /Женя/);
    assert.match(html, /31 из 40/);
    assert.match(html, /0,86/);
    assert.match(html, /bn-flag-slow/);
    assert.match(html, /нужно 2,7/);
    assert.match(html, /не хватает 25 человеко-дней/);
});
