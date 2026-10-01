const assert = require('node:assert');
const { test } = require('node:test');
const {
    bonusesCurrentPeriod, bonusesPeriodOptions, formatRub, formatMetricValue, renderOutputRow, renderLevelRow, renderQualityRow,
    renderBonusCard, renderWarnings, renderTeamBlock, renderPeopleBlock, renderSummary, renderReceipt, renderLevelLadder,
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
    assert.equal(formatMetricValue('cash_in', 14400000), '14,4 млн');
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
    assert.match(html, /14,4 млн/);
    assert.match(html, /base 14 млн/);
    assert.match(html, /medium 15,5 млн/);
    assert.match(html, /aspiration 17 млн/);
    assert.match(html, /bn-tick-above/);
    assert.match(html, /уровень 0,63/);
    assert.match(html, /93% от medium 15,5 млн/);
    assert.match(html, /вручную 15\.09/);
    const auto = renderTeamBlock({ commercial: { targets: { cash_in: { min: 1, target: 2, max: 3 } }, facts: { cash_in: { value: 2, source: 'fintablo', note: 'Финтабло, синк 2026-09-16', updated_at: '2026-09-16T04:15:00.000Z' } }, cashAchievement: 1 } }, '2026-Q3');
    assert.match(auto, /Финтабло 16\.09/);
    assert.match(html, /План и факт по деньгам/);
    assert.match(html, /Обновить из Финтабло сейчас/);
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

const ENTRY = {
    schemeId: 7, employeeId: 5, employeeName: 'Лёша', kind: 'production', resultStatus: 'open', period: '2026-Q3',
    rate: 225, level: 1.55, hasTargets: true, targetsDrift: false,
    tier: 'below', tierByHours: 'aspiration', tierByMoney: 'below',
    rates: { medium: 225, orders: 75, flat: 50, steps: { below: 75, base: 150, medium: 225, aspiration: 270 } },
    money: { fact: 10813376, thresholds: { min: 14500000, target: 16500000, max: 17000000 }, known: true, belowBase: true },
    output: {
        fact: 1899, commercialHours: 1899, internalHours: 0, unmarkedHours: 232, soldHours: 1283,
        thresholds: { min: 1331, target: 1512, max: 1693 }, achievement: 1.55,
        remainingSoldHours: 701, remainingSoldOrders: [1], forecast: null, forecastAmount: null,
    },
    quality: { multiplier: 1, metrics: [
        { key: 'productivity', label: 'Производительность', weight: 0, informational: true, fact: 1.01, available: true, direction: 'higher', thresholds: { min: 0.9, target: 1, max: 1.15 } },
        { key: 'on_time_share', label: 'В срок', weight: 0, informational: true, fact: 0.9, available: true, direction: 'higher', thresholds: { min: 0.85, target: 1, max: 1 } },
    ] },
    receipt: {
        orders: { hours: 1899, rate: 75, amount: 142425 },
        internal: { hours: 0, rate: 50, amount: 0 },
        unmarked: { hours: 232, rate: 50, amount: 11600 },
        upside: { hours: 701, rate: 75, amount: 52575 },
    },
    amountComputed: 154025, amountFinal: null, warnings: [{ code: 'unmarked_hours', hours: 232, count: 0, orderIds: [] }],
    orders: [], adjustments: [],
};

test('renderReceipt: заказы, часы без заказа, итог и упущенное', () => {
    const html = renderReceipt(ENTRY);
    assert.match(html, /Заказы клиентов<\/td><td>1 899 ч × 75 ₽<\/td><td class="num">142 425 ₽/);
    assert.match(html, /Часы без заказа<\/td><td>232 ч × 50 ₽<\/td><td class="num">11 600 ₽/);
    assert.doesNotMatch(html, /Внутренние работы/);
    assert.match(html, /Итого к выплате<\/td><td><\/td><td class="num"><b>154 025 ₽/);
    assert.match(html, /Продано, но ещё не сделано<\/td><td>701 ч × 75 ₽<\/td><td class="num">\+ 52 575 ₽/);
});

test('renderLevelRow: платим по меньшей из ступеней', () => {
    assert.match(renderLevelRow(ENTRY), /bn-level-red[^>]*>Деньги компании 10,8 млн — это ступень <b>ниже base<\/b>, часы цеха — <b>aspiration<\/b>\. Платим по меньшей: 75 ₽\/ч вместо 270 ₽/);
    const same = renderLevelRow({ ...ENTRY, tier: 'aspiration', tierByMoney: 'aspiration', money: { ...ENTRY.money, fact: 17200000, belowBase: false }, rates: { ...ENTRY.rates, orders: 270 } });
    assert.match(same, /bn-level-green[^>]*>Часы и деньги на одной ступени <b>aspiration<\/b>: ставка 270 ₽\/ч/);
    const hoursLow = renderLevelRow({ ...ENTRY, tier: 'base', tierByHours: 'base', tierByMoney: 'aspiration', money: { ...ENTRY.money, fact: 17200000, belowBase: false }, rates: { ...ENTRY.rates, orders: 150 } });
    assert.match(hoursLow, /bn-level-amber[^>]*>.*часы цеха только <b>base<\/b>/);
    const unknown = renderLevelRow({ ...ENTRY, money: { known: false } });
    assert.match(unknown, /считаем только по часам/);
});

test('renderLevelLadder: четыре ступени со своими ставками', () => {
    const html = renderLevelLadder(ENTRY);
    assert.match(html, /ниже base<\/div><div class="h">меньше 1 331 ч<\/div><div class="r">75 ₽\/ч/);
    assert.match(html, /base<\/div><div class="h">от 1 331 ч<\/div><div class="r">150 ₽\/ч/);
    assert.match(html, /medium<\/div><div class="h">от 1 512 ч<\/div><div class="r">225 ₽\/ч/);
    assert.match(html, /bn-step bn-step-on"><div class="n">aspiration<\/div><div class="h">от 1 693 ч<\/div><div class="r">270 ₽\/ч/);
    assert.match(html, /bn-step-pay/);
    assert.match(html, /по деньгам ступень ниже, поэтому платим по <b>ниже base<\/b>: 75 ₽\/ч/i);
    const ok = renderLevelLadder({ ...ENTRY, money: { ...ENTRY.money, belowBase: false }, tier: 'aspiration', tierByMoney: 'aspiration' });
    assert.doesNotMatch(ok, /bn-step-pay/);
    assert.match(ok, /Все часы заказов идут по 270 ₽\/ч/);
});

test('renderSummary: правила ступеней', () => {
    const html = renderSummary(ENTRY);
    assert.match(html, /ниже base 75 ₽, base 150 ₽, medium 225 ₽, aspiration 270 ₽/);
    assert.match(html, /Внутренние работы и часы без заказа всегда по 50 ₽/);
    assert.match(html, /наименьшая из двух: по часам цеха и по деньгам компании/);
    assert.match(renderSummary({ hasTargets: false }), /Цели квартала ещё не заданы/);
});

test('renderBonusCard: плитки, чек, лесенка, детали', () => {
    const html = renderBonusCard(ENTRY, { expanded: true });
    assert.match(html, /Лёша/);
    assert.match(html, /К выплате сейчас<\/div><div class="v">154 025 ₽/);
    assert.match(html, /План квартала<\/div><div class="v">выше aspiration/);
    assert.match(html, /Ставка за нормо-час<\/div><div class="v">75 ₽<\/div><div class="s">ступень ниже base · меньшая из часов \(aspiration\) и денег \(ниже base\)/);
    assert.match(html, /bn-receipt/);
    assert.match(html, /bn-chip-grey[^>]*>Производительность <b>1,01<\/b>/);
    assert.match(html, /Качество, на сумму не влияет/);
    assert.match(html, /Закрыть квартал/);
    const ro = renderBonusCard(ENTRY, { expanded: false, readOnly: true });
    assert.doesNotMatch(ro, /Закрыть квартал|Цели квартала|data-action="scheme"/);
    assert.doesNotMatch(ro, /bn-card-details/);
});

test('renderOutputRow: полоса плана и отметка проданного', () => {
    const html = renderOutputRow(ENTRY.output);
    assert.match(html, /Сделано, нормо-часы/);
    assert.match(html, /base 1 331 ч/);
    assert.match(html, /bn-tick-sold-label[^>]*>продано 1 283 ч/);
    assert.match(html, /1 899 ч/);
});

test('renderQualityRow: только факт, без процентов', () => {
    const html = renderQualityRow(ENTRY.quality.metrics[1]);
    assert.match(html, /В срок/);
    assert.match(html, /информация, в деньги не входит/);
    assert.match(html, /90%/);
});
