// Логика новой карточки заказа (OrderCardLogic в js/order-detail.js): этапы, доли тиража, метки
// склада, часы по этапам, вердикт с причинами и причины расхождения маржи. Данные — из макета
// (Лимон, Обвесы Миллениум, Аэрофлот, Авиасейлс), сегодня — 28 октября 2026.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const context = vm.createContext({
    console, Math, Number, String, Object, Array, JSON, Set, Map,
    window: {},
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    App: { isAdmin: () => true, toast() {}, navigate() {}, getCurrentEmployeeName: () => 'Полина' },
});
vm.runInContext(read('js/calculator.js'), context, { filename: 'calculator.js' });
vm.runInContext(`${read('js/order-detail.js')}\nglobalThis.__card = { OrderCardLogic, formatRub };`, context, { filename: 'order-detail.js' });
const { OrderCardLogic: L, formatRub } = context.__card;
assert.ok(L, 'OrderCardLogic is defined in js/order-detail.js');

// Объекты из vm живут в другом realm: сравниваем через JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));
const TODAY = '2026-10-28';

// ---------- formatDayMonth ----------
assert.equal(L.formatDayMonth('2026-10-26'), '26 октября');
assert.equal(L.formatDayMonth('2026-01-05'), '5 января');
assert.equal(L.formatDayMonth('2026-05-01'), '1 мая');
assert.equal(L.formatDayMonth('2026-09-23'), '23 сентября');
assert.equal(L.formatDayMonth('2026-10-16T09:30:00Z'), '16 октября', 'a timestamp reads by its date part');
assert.equal(L.formatDayMonth(''), '');
assert.equal(L.formatDayMonth(null), '');
assert.equal(L.formatDayMonth('скоро'), '');

// ---------- stages ----------
{
    const lemon = L.stages({ status: 'production_casting', hasPrinting: false, hasHardware: true, hasPackaging: true });
    assert.deepEqual(plain(lemon.list), [
        { value: 'draft', label: 'Черновик', state: 'done' },
        { value: 'production_casting', label: 'Выливание', state: 'current' },
        { value: 'production_hardware', label: 'Сборка', state: 'todo' },
        { value: 'production_packaging', label: 'Упаковка', state: 'todo' },
        { value: 'delivery', label: 'Доставка', state: 'todo' },
        { value: 'completed', label: 'Готово', state: 'todo' },
    ], 'Лимон: no sample, no printing; casting is current');
    assert.deepEqual(plain(lemon.next), { value: 'production_hardware', label: 'Сборка' });

    const full = L.stages({ status: 'sample', hasPrinting: true, hasHardware: true, hasPackaging: true });
    assert.deepEqual(plain(full.list.map(s => s.value)), [
        'draft', 'sample', 'production_casting', 'production_printing', 'production_hardware',
        'production_packaging', 'delivery', 'completed',
    ]);
    assert.deepEqual(plain(full.list.map(s => s.label)), [
        'Черновик', 'Образец', 'Выливание', 'Печать', 'Сборка', 'Упаковка', 'Доставка', 'Готово',
    ]);
    assert.deepEqual(plain(full.list.map(s => s.state)), ['done', 'current', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
    assert.deepEqual(plain(full.next), { value: 'production_casting', label: 'Выливание' });

    const bare = L.stages({ status: 'draft', hasPrinting: false, hasHardware: false, hasPackaging: false });
    assert.deepEqual(plain(bare.list.map(s => s.value)), ['draft', 'production_casting', 'delivery', 'completed'],
        '«Образец» only while the order is a sample; no printing / assembly / packaging when the order has none');
    assert.equal(bare.list[0].state, 'current');
    assert.deepEqual(plain(bare.next), { value: 'production_casting', label: 'Выливание' });

    const calculated = L.stages({ status: 'calculated' });
    assert.equal(calculated.list.find(s => s.state === 'current').value, 'draft', '«calculated» is a draft');
    for (const legacy of ['production', 'in_production']) {
        const st = L.stages({ status: legacy, hasHardware: true });
        assert.equal(st.list.find(s => s.state === 'current').value, 'production_casting', `${legacy} is casting`);
        assert.deepEqual(plain(st.next), { value: 'production_hardware', label: 'Сборка' });
    }

    const printing = L.stages({ status: 'production_printing', hasPrinting: true, hasHardware: false, hasPackaging: true });
    assert.deepEqual(plain(printing.list.map(s => s.state)), ['done', 'done', 'current', 'todo', 'todo', 'todo']);
    assert.deepEqual(plain(printing.next), { value: 'production_packaging', label: 'Упаковка' });

    const delivery = L.stages({ status: 'delivery', hasHardware: true });
    assert.deepEqual(plain(delivery.next), { value: 'completed', label: 'Готово' });

    const done = L.stages({ status: 'completed', hasHardware: true });
    assert.equal(done.next, null, 'nothing after «Готово»');
    assert.deepEqual(plain(done.list.map(s => s.state)), ['done', 'done', 'done', 'done', 'current']);

    const cancelled = L.stages({ status: 'cancelled', hasHardware: true });
    assert.equal(cancelled.next, null, 'a cancelled order has no next stage');
    assert.ok(cancelled.list.every(s => s.state !== 'current'), 'a cancelled order stands on no stage');
}

// ---------- stageHoursRows ----------
// Лимон из «Факта»: срезание без плана и без часов, сборка 8 из 1,61, упаковка ещё впереди.
const lemonStages = [
    { key: 'casting', label: 'Выливание', planHours: 9.71, factHours: 10, salary: 5500,
        people: [{ name: 'Илья Т.', hours: 10 }], firstDate: '2026-10-20', lastDate: '2026-10-23' },
    { key: 'trim', label: 'Срезание', planHours: 0, factHours: 0, salary: 0, people: [], firstDate: null, lastDate: null },
    { key: 'assembly', label: 'Сборка', planHours: 1.61, factHours: 8, salary: 4400,
        people: [{ name: 'Тая', hours: 4 }, { name: 'Женя Г.', hours: 4 }], firstDate: '2026-10-23', lastDate: '2026-10-23' },
    { key: 'packaging', label: 'Упаковка', planHours: 0.79, factHours: 0, salary: 0, people: [], firstDate: null, lastDate: null },
];
const lemonRows = L.stageHoursRows(lemonStages);
{
    assert.deepEqual(plain(lemonRows.map(r => [r.key, r.label, r.planHours, r.factHours])), [
        ['casting', 'Литьё и срезание', 9.71, 10],
        ['assembly', 'Сборка', 1.61, 8],
        ['packaging', 'Упаковка', 0.79, 0],
    ], 'trim without its own plan goes into casting; a stage with neither plan nor hours is left out');
    assert.deepEqual(plain(lemonRows[0].people), [{ name: 'Илья Т.', hours: 10 }]);
    assert.equal(lemonRows[0].firstDate, '2026-10-20');
    assert.equal(lemonRows[0].lastDate, '2026-10-23');
    assert.deepEqual(plain(Object.keys(lemonRows[1]).sort()),
        ['factHours', 'firstDate', 'key', 'label', 'lastDate', 'people', 'planHours', 'salary']);

    // Срезание с часами, но без плана: часы, люди и даты сливаются с литьём.
    const merged = L.stageHoursRows([
        { key: 'casting', label: 'Выливание', planHours: 5, factHours: 4, salary: 2200,
            people: [{ name: 'Илья Т.', hours: 3 }, { name: 'Влад Г.', hours: 1 }], firstDate: '2026-10-01', lastDate: '2026-10-03' },
        { key: 'trim', label: 'Срезание', planHours: 0, factHours: 2, salary: 1100,
            people: [{ name: 'Влад Г.', hours: 1.5 }, { name: 'Илья Т.', hours: 0.5 }], firstDate: '2026-09-30', lastDate: '2026-10-02' },
        { key: 'assembly', label: 'Сборка', planHours: 0, factHours: 0, salary: 0, people: [], firstDate: null, lastDate: null },
        { key: 'packaging', label: 'Упаковка', planHours: 0, factHours: 0, salary: 0, people: [], firstDate: null, lastDate: null },
    ]);
    assert.deepEqual(plain(merged), [{
        key: 'casting', label: 'Литьё и срезание', planHours: 5, factHours: 6, salary: 3300,
        people: [{ name: 'Илья Т.', hours: 3.5 }, { name: 'Влад Г.', hours: 2.5 }],
        firstDate: '2026-09-30', lastDate: '2026-10-03',
    }]);

    // У срезания свой план — отдельная строка.
    const separate = L.stageHoursRows([
        { key: 'casting', label: 'Выливание', planHours: 5, factHours: 4, salary: 0, people: [], firstDate: null, lastDate: null },
        { key: 'trim', label: 'Срезание', planHours: 1.5, factHours: 0, salary: 0, people: [], firstDate: null, lastDate: null },
        { key: 'assembly', label: 'Сборка', planHours: 0, factHours: 0, salary: 0, people: [], firstDate: null, lastDate: null },
        { key: 'packaging', label: 'Упаковка', planHours: 0, factHours: 0, salary: 0, people: [], firstDate: null, lastDate: null },
    ]);
    assert.deepEqual(plain(separate.map(r => r.label)), ['Выливание', 'Срезание']);
    assert.deepEqual(plain(L.stageHoursRows(null)), []);
}

// ---------- timesheetAhead ----------
assert.equal(L.timesheetAhead({ status: 'production_casting', stageRows: lemonRows }), 'Сборка',
    'Лимон: assembly is in the timesheet while the status is still casting');
assert.equal(L.timesheetAhead({ status: 'production_printing', stageRows: lemonRows }), 'Сборка');
assert.equal(L.timesheetAhead({ status: 'production_hardware', stageRows: lemonRows }), null);
assert.equal(L.timesheetAhead({ status: 'production_hardware', stageRows: [
    { key: 'assembly', label: 'Сборка', planHours: 1, factHours: 1 },
    { key: 'packaging', label: 'Упаковка', planHours: 1, factHours: 0.5 },
] }), 'Упаковка');
assert.equal(L.timesheetAhead({ status: 'production_casting', stageRows: [
    { key: 'casting', label: 'Выливание', planHours: 5, factHours: 4 },
    { key: 'trim', label: 'Срезание', planHours: 1, factHours: 1 },
    { key: 'assembly', label: 'Сборка', planHours: 2, factHours: 1 },
    { key: 'packaging', label: 'Упаковка', planHours: 1, factHours: 1 },
] }), 'Упаковка', 'the furthest stage wins');
assert.equal(L.timesheetAhead({ status: 'production_casting', stageRows: [
    { key: 'casting', label: 'Выливание', planHours: 5, factHours: 4 },
    { key: 'trim', label: 'Срезание', planHours: 1, factHours: 1 },
] }), null, 'trim is part of casting, not ahead of it');
assert.equal(L.timesheetAhead({ status: 'delivery', stageRows: lemonRows }), null);
assert.equal(L.timesheetAhead({ status: 'completed', stageRows: lemonRows }), null);
assert.equal(L.timesheetAhead({ status: 'production_casting', stageRows: [] }), null);

// ---------- typeParts ----------
{
    const stockHow = `продаём сами со склада по ${formatRub(5900)}`;
    assert.match(stockHow, /по 5\s900 ₽$/);
    const lemonLines = [{
        name: 'Лимон', quantity: 100,
        split: { client: 0, stock: 30, stock_price: 5900, partner: 50, partner_note: '', gift: 20, gift_note: '', sample: 0 },
    }];
    assert.deepEqual(plain(L.typeParts({
        purpose: 'commercial', clientName: '', tirageLines: lemonLines, products: [{ quantity: 100 }], stockPrice: 5900,
    })), [
        { key: 'stock', label: 'Сток', qty: 30, how: stockHow },
        { key: 'partner', label: 'Партнёру', qty: 50, how: 'бесплатно' },
        { key: 'marketing', label: 'Маркетинг', qty: 20, how: 'дарим' },
    ], 'Лимон: stock 30, partner 50, marketing 20; the empty client part is left out');

    // Разметка с подписями, клиентская доля, строка без разметки и образцы.
    assert.deepEqual(plain(L.typeParts({
        purpose: 'commercial', clientName: 'Лимон',
        tirageLines: [{
            name: 'Лимон', quantity: 100,
            split: { client: 10, stock: 30, stock_price: 5900, partner: 40, partner_note: 'художнице', gift: 15, gift_note: 'блогерам', sample: 5 },
        }],
        products: [{ quantity: 100 }, { quantity: 20 }],
    })), [
        { key: 'commercial', label: 'Коммерция', qty: 30, how: 'по счёту клиенту — Лимон' },
        { key: 'stock', label: 'Сток', qty: 30, how: stockHow },
        { key: 'partner', label: 'Партнёру', qty: 40, how: 'бесплатно — художнице' },
        { key: 'marketing', label: 'Маркетинг', qty: 20, how: 'дарим — блогерам' },
    ], 'a product line without a split is the client part; gifts and samples are marketing');

    assert.deepEqual(plain(L.typeParts({ purpose: 'commercial', clientName: 'Аэрофлот', tirageLines: [], products: [{ quantity: 1100 }] })),
        [{ key: 'commercial', label: 'Коммерция', qty: 1100, how: 'по счёту клиенту — Аэрофлот' }], 'no split: the whole order is commercial');
    assert.deepEqual(plain(L.typeParts({ purpose: 'commercial', clientName: '', tirageLines: [], products: [{ quantity: 65 }] })),
        [{ key: 'commercial', label: 'Коммерция', qty: 65, how: 'по счёту клиенту' }]);
    assert.deepEqual(plain(L.typeParts({ purpose: 'leftover_assembly', clientName: 'Ozon', tirageLines: [], products: [{ quantity: 50 }] })),
        [{ key: 'commercial', label: 'Коммерция', qty: 50, how: 'по счёту клиенту — Ozon' }], 'assembly from leftovers is commercial');
    assert.deepEqual(plain(L.typeParts({ purpose: 'marketing', clientName: 'Авиасейлс', tirageLines: lemonLines, products: [{ quantity: 50 }] })),
        [{ key: 'marketing', label: 'Маркетинг', qty: 50, how: 'дарим, не продаём' }], 'marketing: one part');
    assert.deepEqual(plain(L.typeParts({ purpose: 'stock_sample', clientName: '', tirageLines: [], products: [{ quantity: 12 }] })),
        [{ key: 'stock', label: 'Сток', qty: 12, how: 'делаем на склад' }]);
    assert.deepEqual(plain(L.typeParts({ purpose: 'rework', clientName: '', tirageLines: [], products: [{ quantity: 7 }] })),
        [{ key: 'rework', label: 'Переделка брака', qty: 7, how: 'переделываем брак' }]);
    assert.deepEqual(plain(L.typeParts({ purpose: 'commercial', clientName: 'b2c', tirageLines: lemonLines, products: [{ quantity: 40 }] })),
        [{ key: 'b2c', label: 'B2C', qty: 40, how: 'всё на склад готовой продукции' }]);
    assert.deepEqual(plain(L.typeParts({ purpose: 'marketing', clientName: '', tirageLines: [], products: [] })), [],
        'a part with 0 pieces is not shown');
}

// ---------- stockLabel ----------
{
    assert.deepEqual(plain(L.stockLabel({ itemName: 'Карабин', plannedQty: 65, targetQty: 65, actualQty: 65, ready: true, currentReserveQty: 0, availableQty: 0 })),
        { tone: 'green', text: 'собрано, списано' });
    assert.deepEqual(plain(L.stockLabel({ itemName: 'Шнур', plannedQty: 65, targetQty: 65, actualQty: 0, ready: false, currentReserveQty: 65, availableQty: 464 })),
        { tone: 'blue', text: 'в резерве · на складе 464' });
    const available = L.stockLabel({ itemName: 'Кольцо', plannedQty: 100, targetQty: 0, actualQty: 0, ready: false, currentReserveQty: 0, availableQty: 7120 });
    assert.equal(available.tone, 'gray');
    assert.match(available.text, /^есть на складе 7\s120$/, 'need = targetQty || plannedQty; numbers in ru-RU');
    assert.deepEqual(plain(L.stockLabel({ itemName: 'Шнур', plannedQty: 100, targetQty: 100, actualQty: 0, ready: false, currentReserveQty: 20, availableQty: 30.5 })),
        { tone: 'red', text: 'не хватает 50' }, 'shortage = need − reserve − free, rounded up');
    assert.deepEqual(plain(L.stockLabel({ itemName: 'Шнур', plannedQty: 100, targetQty: 100, actualQty: 0, ready: false, currentReserveQty: 40, availableQty: 60 })),
        { tone: 'gray', text: 'есть на складе 60' }, 'part reserved and the rest free is enough');
}

// ---------- health ----------
const lemonHealthInput = {
    status: 'production_casting', purpose: 'commercial', today: TODAY,
    deadlineStart: '2026-10-14', deadlineEnd: '2026-10-26', completedAt: null,
    hoursPlan: 12.11, hoursFact: 18, hasTimesheet: true, stageRows: lemonRows,
    stock: { shortageNames: [] }, notesEmpty: true, paymentStatus: 'not_sent', clientQty: 0,
    partnerWithoutNote: true,
    timesheetStageLabel: L.timesheetAhead({ status: 'production_casting', stageRows: lemonRows }),
    statusStageLabel: 'Выливание', marginPlan: 30.1, marginNow: 12.1,
};
{
    const lemon = L.health(lemonHealthInput);
    assert.equal(lemon.tone, 'red');
    assert.equal(lemon.verdict, 'Горит');
    assert.equal(lemon.reasons[0], 'Срок прошёл 26 октября.');
    assert.deepEqual(plain(lemon.reasons), [
        'Срок прошёл 26 октября.',
        'Часов по табелю 18 вместо 12,1.',
        'По табелю уже идёт «Сборка», а в статусе — «Выливание».',
        'Нет ТЗ для цеха.',
    ], 'at most four reasons, the most serious first');

    const millennium = L.health({
        status: 'production_casting', purpose: 'commercial', today: TODAY,
        deadlineStart: '2026-10-22', deadlineEnd: '2026-11-10', completedAt: null,
        hoursPlan: 11.15, hoursFact: 8.5, hasTimesheet: true,
        stageRows: [
            { key: 'casting', label: 'Литьё и срезание', planHours: 10.5, factHours: 8.5 },
            { key: 'assembly', label: 'Сборка', planHours: 0.65, factHours: 0 },
        ],
        stock: { shortageNames: [] }, notesEmpty: false, paymentStatus: 'paid_100', clientQty: 65,
        partnerWithoutNote: false, timesheetStageLabel: null, statusStageLabel: 'Выливание',
        marginPlan: 45.8, marginNow: 45.8,
    });
    assert.deepEqual(plain(millennium), {
        tone: 'green', verdict: 'Идёт по плану',
        reasons: ['Оплачено 100 %.', 'До срока 13 дн.', 'По часам сделано 76 %.'],
    });

    const aeroflot = L.health({
        status: 'completed', purpose: 'commercial', today: TODAY,
        deadlineStart: '2026-09-22', deadlineEnd: '2026-10-05', completedAt: '2026-10-05',
        hoursPlan: 79, hoursFact: 42, hasTimesheet: true,
        stageRows: [
            { key: 'casting', label: 'Литьё и срезание', planHours: 74.9, factHours: 42 },
            { key: 'assembly', label: 'Сборка', planHours: 4, factHours: 0 },
        ],
        stock: { shortageNames: [] }, notesEmpty: false, paymentStatus: 'sent_to_payment', clientQty: 1100,
        partnerWithoutNote: false, timesheetStageLabel: null, statusStageLabel: 'Готово',
        marginPlan: 34.1, marginNow: 52.9,
    });
    assert.deepEqual(plain(aeroflot), {
        tone: 'yellow', verdict: 'Сдали, ждём деньги',
        reasons: ['Деньги не пришли: «Передано в оплату».', 'Этап «Сборка» в табель не внесли.', 'Сдали в срок.'],
    });

    // Авиасейлс: маркетинг, сдали на 8 дней позже, табеля нет. По спецификации («Вердикт»)
    // опоздание больше чем на 7 дней — красное.
    const aviasalesInput = {
        status: 'completed', purpose: 'marketing', today: TODAY,
        deadlineStart: '2026-10-01', deadlineEnd: '2026-10-08', completedAt: '2026-10-16T15:20:00Z',
        hoursPlan: 5.3, hoursFact: 0, hasTimesheet: false,
        stageRows: [
            { key: 'casting', label: 'Литьё и срезание', planHours: 4.5, factHours: 0 },
            { key: 'assembly', label: 'Сборка', planHours: 0.8, factHours: 0 },
        ],
        stock: { shortageNames: [] }, notesEmpty: true, paymentStatus: '', clientQty: 0,
        partnerWithoutNote: false, timesheetStageLabel: null, statusStageLabel: 'Готово',
        marginPlan: null, marginNow: null,
    };
    assert.deepEqual(plain(L.health(aviasalesInput)), {
        tone: 'red', verdict: 'Закрыт плохо',
        reasons: ['Сдали 16 октября, срок был 8 октября — на 8 дн. позже.', 'В табель не внесли ни часа.'],
    });
    // На неделю позже — жёлтое «Сдали с опозданием», с теми же причинами про опоздание и табель.
    assert.deepEqual(plain(L.health({ ...aviasalesInput, completedAt: '2026-10-15' })), {
        tone: 'yellow', verdict: 'Сдали с опозданием',
        reasons: ['Сдали 15 октября, срок был 8 октября — на 7 дн. позже.', 'В табель не внесли ни часа.'],
    });

    // Черновик: старт по плану прошёл — пора запускать; иначе серый.
    assert.deepEqual(plain(L.health({ status: 'draft', purpose: 'commercial', today: TODAY, deadlineStart: '2026-09-23', deadlineEnd: '2026-11-20' })), {
        tone: 'yellow', verdict: 'Пора запускать',
        reasons: ['Старт по плану был 23 сентября, заказ ещё черновик.'],
    });
    assert.deepEqual(plain(L.health({ status: 'calculated', purpose: 'commercial', today: TODAY, deadlineStart: '2026-11-02', deadlineEnd: '2026-11-20' })),
        { tone: 'gray', verdict: 'Черновик', reasons: [] });
    assert.deepEqual(plain(L.health({ status: 'draft', today: TODAY })), { tone: 'gray', verdict: 'Черновик', reasons: [] });
    assert.deepEqual(plain(L.health({ status: 'cancelled', today: TODAY, deadlineEnd: '2026-10-01', notesEmpty: true })),
        { tone: 'gray', verdict: 'Отменён', reasons: [] });
}

// Пороги «в работе».
const okInWork = {
    status: 'production_casting', purpose: 'commercial', today: TODAY,
    deadlineStart: '2026-10-20', deadlineEnd: '2026-11-20', completedAt: null,
    hoursPlan: 10, hoursFact: 5, hasTimesheet: true, stageRows: [],
    stock: { shortageNames: [] }, notesEmpty: false, paymentStatus: 'sent_to_payment', clientQty: 100,
    partnerWithoutNote: false, timesheetStageLabel: null, statusStageLabel: 'Выливание',
    marginPlan: 30, marginNow: 30,
};
{
    assert.deepEqual(plain(L.health(okInWork)), {
        tone: 'green', verdict: 'Идёт по плану', reasons: ['До срока 23 дн.', 'По часам сделано 50 %.'],
    });

    const soon = L.health({ ...okInWork, deadlineEnd: '2026-10-30' });
    assert.equal(soon.tone, 'yellow');
    assert.equal(soon.verdict, 'Есть риски');
    assert.deepEqual(plain(soon.reasons), ['До срока 2 дн., а заказ ещё на этапе «Выливание».']);
    assert.equal(L.health({ ...okInWork, deadlineEnd: '2026-10-31' }).tone, 'yellow', '3 days is still close');
    assert.equal(L.health({ ...okInWork, deadlineEnd: '2026-11-01' }).tone, 'green', '4 days is fine');
    assert.equal(L.health({ ...okInWork, deadlineEnd: '2026-10-28' }).tone, 'yellow', 'the deadline is today');
    assert.equal(L.health({ ...okInWork, deadlineEnd: '2026-10-30', status: 'production_packaging', statusStageLabel: 'Упаковка' }).tone,
        'green', 'packaging two days before the deadline is on time');
    assert.equal(L.health({ ...okInWork, deadlineEnd: '2026-10-30', status: 'delivery', statusStageLabel: 'Доставка' }).tone, 'green');
    assert.deepEqual(plain(L.health({ ...okInWork, deadlineEnd: '2026-10-30', status: 'sample', statusStageLabel: 'Образец' }).reasons),
        ['До срока 2 дн., а заказ ещё на этапе «Образец».']);
    assert.equal(L.health({ ...okInWork, deadlineEnd: '2026-10-27', status: 'delivery' }).verdict, 'Горит', 'overdue in delivery too');

    const overHours = L.health({ ...okInWork, hoursFact: 16 });
    assert.equal(overHours.tone, 'red');
    assert.deepEqual(plain(overHours.reasons), ['Часов по табелю 16 вместо 10.']);
    assert.equal(L.health({ ...okInWork, hoursFact: 15 }).tone, 'yellow', '1.5× exactly is not red');
    assert.equal(L.health({ ...okInWork, hoursFact: 11.6 }).tone, 'yellow', 'more than 15 % over plan');
    assert.equal(L.health({ ...okInWork, hoursFact: 11.5 }).tone, 'green', '15 % exactly is fine');
    assert.equal(L.health({ ...okInWork, hoursPlan: 2, hoursFact: 4 }).tone, 'yellow', 'a plan of 2 h or less never turns red on hours');
    assert.deepEqual(plain(L.health({ ...okInWork, hoursPlan: 2, hoursFact: 4 }).reasons), ['Часов по табелю 4 вместо 2.']);

    assert.deepEqual(plain(L.health({ ...okInWork, stock: { shortageNames: ['карабин', 'шнур'] } }).reasons), ['На складе не хватает: карабин, шнур.']);
    assert.deepEqual(plain(L.health({ ...okInWork, notesEmpty: true }).reasons), ['Нет ТЗ для цеха.']);
    assert.deepEqual(plain(L.health({ ...okInWork, timesheetStageLabel: 'Сборка' }).reasons), ['По табелю уже идёт «Сборка», а в статусе — «Выливание».']);
    assert.deepEqual(plain(L.health({ ...okInWork, paymentStatus: '' }).reasons), ['Счёт клиенту не выставлен.']);
    assert.deepEqual(plain(L.health({ ...okInWork, paymentStatus: 'not_sent' }).reasons), ['Счёт клиенту не выставлен.']);
    assert.equal(L.health({ ...okInWork, paymentStatus: '', clientQty: 0 }).tone, 'green', 'no client part — no invoice needed');
    assert.deepEqual(plain(L.health({ ...okInWork, partnerWithoutNote: true }).reasons), ['Не указано, кому уходит партнёрская доля.']);
    assert.ok(L.health({ ...okInWork, paymentStatus: 'paid_100' }).reasons.includes('Оплачено 100 %.'));
}

// Пороги «Готово».
const goodDone = {
    status: 'completed', purpose: 'commercial', today: TODAY,
    deadlineStart: '2026-09-20', deadlineEnd: '2026-10-10', completedAt: '2026-10-09',
    hoursPlan: 20, hoursFact: 19, hasTimesheet: true,
    stageRows: [{ key: 'casting', label: 'Выливание', planHours: 20, factHours: 19 }],
    stock: { shortageNames: [] }, notesEmpty: true, paymentStatus: 'paid_100', clientQty: 100,
    partnerWithoutNote: true, timesheetStageLabel: null, statusStageLabel: 'Готово',
    marginPlan: 30.1, marginNow: 28,
};
{
    assert.deepEqual(plain(L.health(goodDone)), { tone: 'green', verdict: 'Закрыт хорошо', reasons: ['Сдали в срок.', 'Оплачено 100 %.'] },
        'a closed order ignores the brief and the partner note');
    assert.equal(L.health({ ...goodDone, paymentStatus: 'postpay_100' }).verdict, 'Закрыт хорошо');
    assert.equal(L.health({ ...goodDone, paymentStatus: '', clientQty: 0 }).verdict, 'Закрыт хорошо');

    const badMargin = L.health({ ...goodDone, marginNow: 12.1 });
    assert.equal(badMargin.tone, 'red');
    assert.equal(badMargin.verdict, 'Закрыт плохо');
    assert.equal(badMargin.reasons[0], 'Маржа 12,1 % вместо 30,1 %.');
    assert.equal(L.health({ ...goodDone, marginNow: 20.1 }).tone, 'green', '10 pp exactly is not red');
    assert.equal(L.health({ ...goodDone, purpose: 'rework', marginPlan: 30, marginNow: 0 }).tone, 'green', 'no margin rule for non-commercial work');

    const late = L.health({ ...goodDone, completedAt: '2026-10-13', paymentStatus: 'sent_to_payment' });
    assert.equal(late.tone, 'yellow');
    assert.equal(late.verdict, 'Сдали с опозданием', 'late wins over unpaid');
    assert.deepEqual(plain(late.reasons), ['Сдали 13 октября, срок был 10 октября — на 3 дн. позже.', 'Деньги не пришли: «Передано в оплату».']);

    const veryLate = L.health({ ...goodDone, completedAt: '2026-10-20', paymentStatus: 'paid_50' });
    assert.equal(veryLate.verdict, 'Закрыт плохо');
    assert.deepEqual(plain(veryLate.reasons), ['Сдали 20 октября, срок был 10 октября — на 10 дн. позже.', 'Деньги не пришли: «Оплачено 50%».']);

    const questions = L.health({ ...goodDone, stageRows: [
        { key: 'casting', label: 'Выливание', planHours: 18, factHours: 19 },
        { key: 'packaging', label: 'Упаковка', planHours: 2, factHours: 0 },
    ] });
    assert.deepEqual(plain(questions), {
        tone: 'yellow', verdict: 'Закрыт с вопросами',
        reasons: ['Этап «Упаковка» в табель не внесли.', 'Сдали в срок.', 'Оплачено 100 %.'],
    });
    assert.equal(L.health({ ...goodDone, hasTimesheet: false, hoursFact: 0 }).verdict, 'Закрыт с вопросами');
}

// ---------- marginReasons ----------
{
    const lemonCostRows = [
        { key: 'salary_production', label: 'ЗП выливание', plan: 5340, fact: 5500, used: 5500, source: 'fact', isSalary: true },
        { key: 'salary_assembly', label: 'ЗП сборка', plan: 886, fact: 4400, used: 4400, source: 'fact', isSalary: true },
        { key: 'indirect_production', label: 'Косвенные', plan: 51128, fact: 75996, used: 75996, source: 'fact', isSalary: false },
        { key: 'hardware_total', label: 'Фурнитура', plan: 3444, fact: 3700, used: 3700, source: 'fact', isSalary: false },
        { key: 'packaging_total', label: 'Упаковка', plan: 21142, fact: 23000, used: 23000, source: 'fact', isSalary: false },
        { key: 'plastic', label: 'Пластик / материалы', plan: 40000, fact: 40700, used: 40700, source: 'fact', isSalary: false },
        { key: 'molds', label: 'Молды', plan: 20000, fact: 0, used: 20000, source: 'plan', isSalary: false },
    ];
    const input = {
        planPct: 30.1, nowPct: 12.1, revenue: 177000, planTotal: 123700, realTotal: 155600,
        rows: lemonCostRows, stageRows: lemonRows, indirectPerHour: 4222, canSeeSalary: true,
    };
    const admin = L.marginReasons(input);
    assert.equal(admin.planPct, 30.1);
    assert.equal(admin.nowPct, 12.1);
    assert.equal(admin.deltaPp, -18);
    assert.equal(admin.deltaRub, -31900, 'the order earns 31 900 ₽ less than planned');
    assert.deepEqual(plain(admin.reasons), [
        // 6,39 ч × (4 400 / 8 + 4 222) = 30 493 ₽ меньше заработка.
        { text: 'Сборка: 8 ч вместо 1,6', rub: -30493 },
        { text: `Упаковка: ${formatRub(23000)} вместо ${formatRub(21142)}`, rub: -1858 },
    ], 'casting (0.29 h off) and packaging not yet logged are not reasons; salary and indirect rows are not reasons; small cost differences are skipped');

    const manager = L.marginReasons({ ...input, canSeeSalary: false });
    assert.equal(manager.deltaRub, -31900, 'the total difference is visible to everyone');
    assert.deepEqual(plain(manager.reasons), [
        { text: 'Сборка: 8 ч вместо 1,6', rub: null },
        { text: `Упаковка: ${formatRub(23000)} вместо ${formatRub(21142)}`, rub: -1858 },
    ], 'a manager sees the hours reason without its rubles');

    // Ставка 550 ₽, когда зарплаты по этапу нет; null-причина сортируется как |Δч| × 4 772.
    const ordering = L.marginReasons({
        planPct: 40, nowPct: 35, revenue: 100000, planTotal: 50000, realTotal: 55000,
        rows: [
            { key: 'hardware_total', label: 'Фурнитура', plan: 10000, used: 15000, source: 'fact' },
            { key: 'nfc_total', label: 'NFC', plan: 1000, used: 400, source: 'fact' },
            { key: 'other', label: 'Прочее', plan: 0, used: 2000, source: 'fact' },
        ],
        stageRows: [
            { key: 'casting', label: 'Выливание', planHours: 4, factHours: 3, salary: 0 },
            { key: 'assembly', label: 'Сборка', planHours: 1, factHours: 1.4, salary: 700 },
        ],
        indirectPerHour: 1000, canSeeSalary: false,
    });
    assert.deepEqual(plain(ordering.reasons), [
        { text: `Фурнитура: ${formatRub(15000)} вместо ${formatRub(10000)}`, rub: -5000 },
        { text: 'Выливание: 3 ч вместо 4', rub: null },
        { text: `Прочее: ${formatRub(2000)} вместо ${formatRub(0)}`, rub: -2000 },
    ], 'at most three, by size (a hidden hours reason ranks as 1 h × 4 772 ₽); fewer hours than planned is a reason too; assembly 0.4 h off is not');
    const orderingAdmin = L.marginReasons({
        planPct: 40, nowPct: 35, revenue: 100000, planTotal: 50000, realTotal: 55000, rows: [],
        stageRows: [{ key: 'casting', label: 'Выливание', planHours: 4, factHours: 3, salary: 0 }],
        indirectPerHour: 1000, canSeeSalary: true,
    });
    assert.deepEqual(plain(orderingAdmin.reasons), [{ text: 'Выливание: 3 ч вместо 4', rub: 1550 }],
        'one hour less earns (550 + 1000) ₽ more when the stage has no salary');

    const empty = L.marginReasons({ planPct: 30, nowPct: 30, planTotal: 100, realTotal: 100, rows: [], stageRows: [], indirectPerHour: 0, canSeeSalary: true });
    assert.deepEqual(plain(empty), { planPct: 30, nowPct: 30, deltaPp: 0, deltaRub: 0, reasons: [] });
}

// Логика чистая: до OrderDetail в файле нет обращений к DOM.
assert.doesNotMatch(read('js/order-detail.js').split('const OrderDetail = {')[0], /document\./, 'OrderCardLogic does not touch the DOM');

console.log('order card smoke: ok');
