// =============================================
// Recycle Object — Order Detail Page
// =============================================

const PAYMENT_STATUSES = [
    { key: 'not_sent',      label: 'Не передано в оплату', color: 'gray' },
    { key: 'sent_to_payment', label: 'Передано в оплату',  color: 'blue' },
    { key: 'paid_50',       label: 'Оплачено 50%',        color: 'orange' },
    { key: 'paid_100',      label: 'Оплачено 100%',       color: 'green' },
    { key: 'postpay_100',   label: 'Постоплата 100%',     color: 'green' },
    { key: 'special',       label: 'Особые условия',      color: 'red' },
];

const HARDWARE_STATUSES = [
    { key: 'discussion',      label: 'Обсуждение',       color: 'gray' },
    { key: 'from_stock',      label: 'Из наличия',       color: 'blue' },
    { key: 'ordered_waiting', label: 'Заказана, ждём',   color: 'orange' },
    { key: 'arrived',         label: 'Приехала',         color: 'green' },
    { key: 'not_needed',      label: 'Не нужна',         color: 'gray' },
    { key: 'to_make',         label: 'Сделать',          color: 'yellow' },
];

// Plastic is always PP, print type is set at printing level — removed from UI

// =============================================
// Логика карточки заказа — чистые функции без DOM: этапы, доли тиража, метки склада, часы по
// этапам, вердикт («лицо») с причинами и причины расхождения маржи. Правила — спецификация
// docs/specs/2026-10-28-order-card-redesign.md («Вердикт»). Даты — строки YYYY-MM-DD, «сегодня»
// передаётся снаружи. Тест: tests/order-card-smoke.js.
// =============================================

const OrderCardLogic = {
    MONTHS_GENITIVE: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
        'сентября', 'октября', 'ноября', 'декабря'],

    // Строка этапов по порядку. «Образец» виден, только пока заказ — образец; печать, сборка и
    // упаковка — если они есть в заказе (или заказ уже на этом этапе).
    STAGE_STEPS: [
        { value: 'draft', label: 'Черновик' },
        { value: 'sample', label: 'Образец', onlyWhenCurrent: true },
        { value: 'production_casting', label: 'Выливание' },
        { value: 'production_printing', label: 'Печать', when: 'hasPrinting' },
        { value: 'production_hardware', label: 'Сборка', when: 'hasHardware' },
        { value: 'production_packaging', label: 'Упаковка', when: 'hasPackaging' },
        { value: 'delivery', label: 'Доставка' },
        { value: 'completed', label: 'Готово' },
    ],
    // Прежние статусы, которые строка этапов показывает как свои.
    STATUS_ALIASES: { calculated: 'draft', production: 'production_casting', in_production: 'production_casting' },
    // Где по табелю этап и где по статусу заказ: срезание — часть литья; доставка и «Готово» —
    // дальше всех этапов табеля.
    TIMESHEET_STAGE_LEVEL: { casting: 0, trim: 0, assembly: 1, packaging: 2 },
    STATUS_STAGE_LEVEL: {
        production_casting: 0, production_printing: 0, production_hardware: 1,
        production_packaging: 2, delivery: 3, completed: 3,
    },
    // До упаковки: за 3 дня до срока такой заказ — риск.
    BEFORE_PACKAGING: ['sample', 'production_casting', 'production_printing', 'production_hardware'],
    PAID_STATUSES: ['paid_100', 'postpay_100'],
    // Час цеха, когда зарплата этапа неизвестна, ₽ (ставка по плану). Вместе с косвенными за час
    // им же сортируются причины без рублей (их рубли видит только администратор).
    FALLBACK_SALARY_PER_HOUR: 550,
    EPS: 1e-9,

    // ---------- даты и числа ----------

    _isoParts(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
        if (!match) return null;
        const y = Number(match[1]);
        const m = Number(match[2]);
        const d = Number(match[3]);
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        return { y, m, d };
    },

    _dayNumber(value) {
        const parts = OrderCardLogic._isoParts(value);
        return parts ? Math.round(Date.UTC(parts.y, parts.m - 1, parts.d) / 86400000) : null;
    },

    // Дней от `from` до `to` (обе даты — YYYY-MM-DD или начало ISO-времени); null без одной из них.
    _daysBetween(from, to) {
        const a = OrderCardLogic._dayNumber(from);
        const b = OrderCardLogic._dayNumber(to);
        return a === null || b === null ? null : b - a;
    },

    _today(value) {
        if (OrderCardLogic._isoParts(value)) return String(value).trim().slice(0, 10);
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },

    _num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    },

    _finiteOrNull(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    },

    _formatNumber(value, maxDigits) {
        const n = OrderCardLogic._num(value);
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(n === 0 ? 0 : n);
    },

    // Часы до десятой: 12,1; 8.
    _formatHours(value) {
        return OrderCardLogic._formatNumber(value, 1);
    },

    // Проценты до десятой, через пробел: «30,1 %».
    _formatPct(value) {
        return `${OrderCardLogic._formatNumber(value, 1)} %`;
    },

    // '2026-10-26' → '26 октября'; пустая строка, если даты нет.
    formatDayMonth(value) {
        const parts = OrderCardLogic._isoParts(value);
        return parts ? `${parts.d} ${OrderCardLogic.MONTHS_GENITIVE[parts.m - 1]}` : '';
    },

    _normalizeStatus(status) {
        const key = String(status || '').trim();
        return OrderCardLogic.STATUS_ALIASES[key] || key || 'draft';
    },

    // Подпись этапа строки этапов для статуса: «Выливание», «Готово»; '' — у отменённого.
    stageLabel(status) {
        const value = OrderCardLogic._normalizeStatus(status);
        const step = OrderCardLogic.STAGE_STEPS.find(item => item.value === value);
        return step ? step.label : '';
    },

    // Зарплатные строки и «Косвенные» в разбивке «Факта» — их видит только администратор.
    isSalaryRow(row) {
        return !!row && (row.isSalary === true || String(row.key || '').startsWith('salary_') || row.key === 'indirect_production');
    },

    // ---------- этапы ----------

    // { list: [{ value, label, state: 'done'|'current'|'todo' }], next: { value, label } | null }.
    // У отменённого заказа текущего этапа и следующего нет.
    stages({ status, hasPrinting = false, hasHardware = false, hasPackaging = false } = {}) {
        const current = OrderCardLogic._normalizeStatus(status);
        const flags = { hasPrinting: !!hasPrinting, hasHardware: !!hasHardware, hasPackaging: !!hasPackaging };
        const steps = OrderCardLogic.STAGE_STEPS.filter(step => step.value === current
            || (!step.onlyWhenCurrent && (!step.when || flags[step.when])));
        const currentIndex = steps.findIndex(step => step.value === current);
        const list = steps.map((step, index) => ({
            value: step.value,
            label: step.label,
            state: currentIndex < 0 || index > currentIndex ? 'todo' : (index === currentIndex ? 'current' : 'done'),
        }));
        const nextStep = currentIndex >= 0 && currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
        return { list, next: nextStep ? { value: nextStep.value, label: nextStep.label } : null };
    },

    // ---------- часы по этапам ----------

    _stageRow(stage) {
        const num = OrderCardLogic._num;
        return {
            key: stage.key,
            label: stage.label,
            planHours: round2(num(stage.planHours)),
            factHours: round2(num(stage.factHours)),
            salary: round2(num(stage.salary)),
            people: (Array.isArray(stage.people) ? stage.people : [])
                .map(person => ({ name: String(person?.name || ''), hours: round2(num(person?.hours)) })),
            firstDate: stage.firstDate || null,
            lastDate: stage.lastDate || null,
        };
    },

    // Литьё и срезание одной строкой: часы, зарплата, люди (по убыванию часов) и даты вместе.
    _mergeCastingAndTrim(casting, trim) {
        const hoursByName = new Map();
        [...casting.people, ...trim.people].forEach(person => {
            if (!person.name) return;
            hoursByName.set(person.name, round2((hoursByName.get(person.name) || 0) + person.hours));
        });
        const people = [...hoursByName.entries()]
            .map(([name, hours]) => ({ name, hours }))
            .sort((a, b) => b.hours - a.hours);
        const firstDates = [casting.firstDate, trim.firstDate].filter(Boolean).sort();
        const lastDates = [casting.lastDate, trim.lastDate].filter(Boolean).sort();
        return {
            key: 'casting',
            label: 'Литьё и срезание',
            planHours: round2(casting.planHours + trim.planHours),
            factHours: round2(casting.factHours + trim.factHours),
            salary: round2(casting.salary + trim.salary),
            people,
            firstDate: firstDates[0] || null,
            lastDate: lastDates[lastDates.length - 1] || null,
        };
    },

    // Строки «Как идёт» из `stages` «Факта» (computeOrderRealCost): срезание без своего плана
    // показывается вместе с литьём; этапы без плана и без часов не выводятся.
    // Строка: { key, label, planHours, factHours, salary, people, firstDate, lastDate }.
    stageHoursRows(stages) {
        const list = (Array.isArray(stages) ? stages : []).filter(stage => stage && stage.key);
        const castingStage = list.find(stage => stage.key === 'casting');
        const trimStage = list.find(stage => stage.key === 'trim');
        const mergeTrim = !!castingStage && !!trimStage && !(OrderCardLogic._num(trimStage.planHours) > 0);
        const rows = [];
        list.forEach(stage => {
            if (mergeTrim && stage === trimStage) return;
            if (mergeTrim && stage === castingStage) {
                rows.push(OrderCardLogic._mergeCastingAndTrim(OrderCardLogic._stageRow(castingStage), OrderCardLogic._stageRow(trimStage)));
                return;
            }
            rows.push(OrderCardLogic._stageRow(stage));
        });
        return rows.filter(row => row.planHours > 0 || row.factHours > 0);
    },

    // Подпись самого дальнего этапа табеля с часами, который дальше этапа статуса, или null:
    // «по табелю уже идёт сборка, а статус — выливание».
    timesheetAhead({ status, stageRows } = {}) {
        const statusLevel = OrderCardLogic.STATUS_STAGE_LEVEL[OrderCardLogic._normalizeStatus(status)];
        if (statusLevel === undefined) return null;
        let furthest = null;
        (Array.isArray(stageRows) ? stageRows : []).forEach(row => {
            const level = OrderCardLogic.TIMESHEET_STAGE_LEVEL[row?.key];
            if (level === undefined || level <= statusLevel || !(OrderCardLogic._num(row.factHours) > 0)) return;
            if (!furthest || level >= furthest.level) furthest = { level, label: row.label };
        });
        return furthest ? furthest.label : null;
    },

    // ---------- тип заказа и как продаём ----------

    // Доли тиража: [{ key, label, qty, how }], key ∈ commercial|stock|partner|marketing|rework|b2c.
    // tirageLines — строки с разметкой ({ name, quantity, split }, OrderDetail._collectTirageLines),
    // products — все изделия заказа ({ quantity }), по ним считается тираж (без них — по строкам
    // разметки); штуки без разметки — клиенту.
    typeParts({ purpose, clientName, tirageLines, products, stockPrice } = {}) {
        const kind = normalizeProductionPurpose(purpose);
        const count = value => Math.max(0, Math.round(OrderCardLogic._num(value)));
        const lines = (Array.isArray(tirageLines) ? tirageLines : []).filter(Boolean);
        const productsQty = (Array.isArray(products) ? products : [])
            .reduce((sum, product) => sum + count(product?.quantity ?? product?.qty), 0);
        const linesQty = lines.reduce((sum, line) => sum + count(line.quantity), 0);
        const totalQty = productsQty > 0 ? productsQty : linesQty;
        const client = String(clientName || '').trim();
        const whole = (key, label, how) => (totalQty > 0 ? [{ key, label, qty: totalQty, how }] : []);

        if (kind === 'marketing') return whole('marketing', 'Маркетинг', 'дарим, не продаём');
        if (kind === 'stock_sample') return whole('stock', 'Сток', 'делаем на склад');
        if (kind === 'rework') return whole('rework', 'Переделка брака', 'переделываем брак');
        if (isB2CClientName(client)) return whole('b2c', 'B2C', 'всё на склад готовой продукции');

        const splits = lines.map(line => line.split).filter(split => split && typeof split === 'object');
        const sum = part => splits.reduce((total, split) => total + count(split[part]), 0);
        const notes = field => [...new Set(splits.map(split => String(split[field] || '').trim()).filter(Boolean))].join(', ');
        const withNote = (text, note) => (note ? `${text} — ${note}` : text);
        const stock = sum('stock');
        const partner = sum('partner');
        const marketing = sum('gift') + sum('sample');
        const commercial = Math.max(0, totalQty - stock - partner - marketing);
        const ownPrice = OrderCardLogic._num(stockPrice);
        const linePrice = OrderCardLogic._num((splits.find(split => count(split.stock) > 0) || {}).stock_price);
        const price = ownPrice > 0 ? ownPrice : linePrice;
        return [
            { key: 'commercial', label: 'Коммерция', qty: commercial, how: withNote('по счёту клиенту', client) },
            { key: 'stock', label: 'Сток', qty: stock, how: price > 0 ? `продаём сами со склада по ${formatRub(price)}` : 'продаём сами со склада' },
            { key: 'partner', label: 'Партнёру', qty: partner, how: withNote('бесплатно', notes('partner_note')) },
            { key: 'marketing', label: 'Маркетинг', qty: marketing, how: withNote('дарим', notes('gift_note')) },
        ].filter(part => part.qty > 0);
    },

    // ---------- склад ----------

    // Метка строки фурнитуры/упаковки (строки OrderDetail.renderHardwareTab): нужно — targetQty,
    // а без него plannedQty; резерв — currentReserveQty; свободно на складе — availableQty.
    stockLabel(row) {
        const r = row || {};
        const num = OrderCardLogic._num;
        const eps = 1e-6;
        const need = Math.max(0, num(r.targetQty) || num(r.plannedQty));
        const reserve = Math.max(0, num(r.currentReserveQty));
        const free = Math.max(0, num(r.availableQty));
        const qty = value => OrderCardLogic._formatNumber(value, 2);
        if (r.ready) return { tone: 'green', text: 'собрано, списано' };
        if (!(need > 0)) return { tone: 'gray', text: 'не нужно' };
        if (reserve + eps >= need) return { tone: 'blue', text: `в резерве · на складе ${qty(free)}` };
        if (reserve + free + eps >= need) return { tone: 'gray', text: `есть на складе ${qty(free)}` };
        return { tone: 'red', text: `не хватает ${qty(Math.ceil(need - reserve - free - eps))}` };
    },

    // ---------- вердикт ----------

    // { tone: 'green'|'yellow'|'red'|'gray', verdict, reasons (до 4, сначала самые серьёзные) }.
    health(input = {}) {
        const status = OrderCardLogic._normalizeStatus(input.status);
        const today = OrderCardLogic._today(input.today);
        if (status === 'cancelled' || status === 'deleted') return { tone: 'gray', verdict: 'Отменён', reasons: [] };
        if (status === 'draft') {
            const sinceStart = OrderCardLogic._daysBetween(input.deadlineStart, today);
            if (sinceStart !== null && sinceStart > 0) {
                return {
                    tone: 'yellow',
                    verdict: 'Пора запускать',
                    reasons: [`Старт по плану был ${OrderCardLogic.formatDayMonth(input.deadlineStart)}, заказ ещё черновик.`],
                };
            }
            return { tone: 'gray', verdict: 'Черновик', reasons: [] };
        }
        if (status === 'completed') return OrderCardLogic._healthCompleted(input);
        return OrderCardLogic._healthInWork(input, status, today);
    },

    // Образец, производство, доставка.
    _healthInWork(input, status, today) {
        const L = OrderCardLogic;
        const red = [];
        const yellow = [];
        const good = [];
        const daysLeft = L._daysBetween(today, input.deadlineEnd);
        const hoursPlan = L._num(input.hoursPlan);
        const hoursFact = L._num(input.hoursFact);
        const stageLabel = input.statusStageLabel || L.stageLabel(status);
        const hoursText = `Часов по табелю ${L._formatHours(hoursFact)} вместо ${L._formatHours(hoursPlan)}.`;
        const overdue = daysLeft !== null && daysLeft < 0;
        const hoursRed = hoursPlan > 2 && hoursFact > hoursPlan * 1.5 + L.EPS;
        const hoursYellow = !hoursRed && hoursPlan > 0 && hoursFact > hoursPlan * 1.15 + L.EPS;
        const shortage = (Array.isArray(input.stock?.shortageNames) ? input.stock.shortageNames : [])
            .map(name => String(name || '').trim()).filter(Boolean);
        const paymentStatus = String(input.paymentStatus || '');
        // Некоммерческому заказу (маркетинг, сток, переделка) счёт не нужен.
        const clientQty = isNonCommercialProductionPurpose(input.purpose) ? 0 : L._num(input.clientQty);

        if (overdue) red.push(`Срок прошёл ${L.formatDayMonth(input.deadlineEnd)}.`);
        if (hoursRed) red.push(hoursText);
        if (!overdue && daysLeft !== null && daysLeft <= 3 && L.BEFORE_PACKAGING.includes(status)) {
            yellow.push(`До срока ${daysLeft} дн., а заказ ещё на этапе «${stageLabel}».`);
        }
        if (hoursYellow) yellow.push(hoursText);
        if (shortage.length) yellow.push(`На складе не хватает: ${shortage.join(', ')}.`);
        if (input.timesheetStageLabel) yellow.push(`По табелю уже идёт «${input.timesheetStageLabel}», а в статусе — «${stageLabel}».`);
        if (input.notesEmpty) yellow.push('Нет ТЗ для цеха.');
        if (clientQty > 0 && (!paymentStatus || paymentStatus === 'not_sent')) yellow.push('Счёт клиенту не выставлен.');
        if (input.partnerWithoutNote) yellow.push('Не указано, кому уходит партнёрская доля.');

        if (red.length) return { tone: 'red', verdict: 'Горит', reasons: [...red, ...yellow].slice(0, 4) };
        if (yellow.length) return { tone: 'yellow', verdict: 'Есть риски', reasons: yellow.slice(0, 4) };

        if (paymentStatus === 'paid_100') good.push('Оплачено 100 %.');
        if (daysLeft !== null) good.push(`До срока ${daysLeft} дн.`);
        if (hoursPlan > 0 && hoursFact > 0) good.push(`По часам сделано ${Math.round((hoursFact / hoursPlan) * 100)} %.`);
        return { tone: 'green', verdict: 'Идёт по плану', reasons: good.slice(0, 4) };
    },

    // «Готово»: опоздание — дата сдачи (completedAt) против срока (deadlineEnd).
    _healthCompleted(input) {
        const L = OrderCardLogic;
        const red = [];
        const yellow = [];
        const good = [];
        const lateDays = L._daysBetween(input.deadlineEnd, input.completedAt);
        const late = lateDays !== null && lateDays > 0;
        const lateText = late
            ? `Сдали ${L.formatDayMonth(input.completedAt)}, срок был ${L.formatDayMonth(input.deadlineEnd)} — на ${lateDays} дн. позже.`
            : '';
        const marginPlan = L._finiteOrNull(input.marginPlan);
        const marginNow = L._finiteOrNull(input.marginNow);
        const marginBad = !isNonCommercialProductionPurpose(input.purpose)
            && marginPlan !== null && marginNow !== null && marginPlan - marginNow > 10 + L.EPS;
        const paymentStatus = String(input.paymentStatus || '');
        const clientQty = isNonCommercialProductionPurpose(input.purpose) ? 0 : L._num(input.clientQty);
        const unpaid = clientQty > 0 && !L.PAID_STATUSES.includes(paymentStatus);
        const paymentLabel = (PAYMENT_STATUSES.find(item => item.key === paymentStatus) || PAYMENT_STATUSES[0]).label;
        const noTimesheet = !input.hasTimesheet;
        const missingStages = noTimesheet ? [] : (Array.isArray(input.stageRows) ? input.stageRows : [])
            .filter(row => row && L._num(row.planHours) > 0 && !(L._num(row.factHours) > 0));

        if (late && lateDays > 7) red.push(lateText);
        if (marginBad) red.push(`Маржа ${L._formatPct(marginNow)} вместо ${L._formatPct(marginPlan)}.`);
        if (late && lateDays <= 7) yellow.push(lateText);
        if (unpaid) yellow.push(`Деньги не пришли: «${paymentLabel}».`);
        if (noTimesheet) yellow.push('В табель не внесли ни часа.');
        missingStages.forEach(row => yellow.push(`Этап «${row.label}» в табель не внесли.`));
        if (lateDays !== null && !late) good.push('Сдали в срок.');
        if (paymentStatus === 'paid_100') good.push('Оплачено 100 %.');

        const reasons = [...red, ...yellow, ...good].slice(0, 4);
        if (red.length) return { tone: 'red', verdict: 'Закрыт плохо', reasons };
        if (late) return { tone: 'yellow', verdict: 'Сдали с опозданием', reasons };
        if (unpaid) return { tone: 'yellow', verdict: 'Сдали, ждём деньги', reasons };
        if (yellow.length) return { tone: 'yellow', verdict: 'Закрыт с вопросами', reasons };
        return { tone: 'green', verdict: 'Закрыт хорошо', reasons };
    },

    // ---------- почему маржа другая ----------

    // { planPct, nowPct, deltaPp, deltaRub, reasons: [{ text, rub }] } — до 3 причин по модулю ₽.
    // deltaRub = planTotal − realTotal: на сколько больше (+) или меньше (−) заказ заработает.
    // rub у причины — тоже изменение заработка. Этап — когда часов по табелю больше или меньше
    // плана на 0,5 ч и больше; этап без часов в табеле не причина: «Факт» считает его по плану.
    // Рубли этапа (зарплата и косвенные) — только при canSeeSalary, иначе null. Статья
    // себестоимости (кроме зарплаты и косвенных) — когда «взято в расчёт» отличается от плана на
    // max(500 ₽, 2 % плана статьи). Вход — поля realCost «Факта» по отдельности (rows, planTotal,
    // realTotal, indirectPerHour) или сам realCost.
    marginReasons(input = {}) {
        const L = OrderCardLogic;
        const real = input.realCost && typeof input.realCost === 'object' ? input.realCost : {};
        const rows = Array.isArray(input.rows) ? input.rows : (Array.isArray(real.rows) ? real.rows : []);
        const stageRows = Array.isArray(input.stageRows) ? input.stageRows : [];
        const planTotal = L._finiteOrNull(input.planTotal ?? real.planTotal);
        const realTotal = L._finiteOrNull(input.realTotal ?? real.realTotal);
        const indirectPerHour = L._num(input.indirectPerHour ?? real.indirectPerHour);
        const planPct = L._finiteOrNull(input.planPct);
        const nowPct = L._finiteOrNull(input.nowPct);
        const canSeeSalary = !!input.canSeeSalary;
        const hasTimesheet = input.hasTimesheet ?? real.hasTimesheet;
        const candidates = [];

        // Без табеля «Факт» берёт всю себестоимость по плану — объяснять нечего.
        if (hasTimesheet !== false) {
            stageRows.forEach(row => {
                if (!row) return;
                const fact = L._num(row.factHours);
                const plan = L._num(row.planHours);
                if (!(fact > 0)) return;
                const deltaHours = round2(fact - plan);
                if (Math.abs(deltaHours) < 0.5 - L.EPS) return;
                const salary = L._num(row.salary);
                const salaryPerHour = salary > 0 ? salary / fact : L.FALLBACK_SALARY_PER_HOUR;
                const rub = Math.round(-deltaHours * (salaryPerHour + indirectPerHour));
                candidates.push({
                    text: `${row.label}: ${L._formatHours(fact)} ч вместо ${L._formatHours(plan)}`,
                    rub: canSeeSalary ? rub : null,
                    weight: canSeeSalary ? Math.abs(rub) : Math.abs(deltaHours) * (L.FALLBACK_SALARY_PER_HOUR + indirectPerHour),
                });
            });
            rows.forEach(row => {
                if (!row || L.isSalaryRow(row)) return;
                const plan = L._num(row.plan);
                const used = L._num(row.used);
                const diff = round2(used - plan);
                if (Math.abs(diff) < Math.max(500, Math.abs(plan) * 0.02) - L.EPS) return;
                const rub = Math.round(-diff);
                candidates.push({
                    text: `${row.label || row.key}: ${formatRub(Math.round(used))} вместо ${formatRub(Math.round(plan))}`,
                    rub,
                    weight: Math.abs(rub),
                });
            });
        }
        candidates.sort((a, b) => b.weight - a.weight);
        return {
            planPct,
            nowPct,
            deltaPp: planPct !== null && nowPct !== null ? round2(nowPct - planPct) : null,
            deltaRub: planTotal !== null && realTotal !== null ? Math.round(planTotal - realTotal) : null,
            reasons: candidates.slice(0, 3).map(({ text, rub }) => ({ text, rub })),
        };
    },
};

// Иконки карточки — inline SVG (без эмодзи), цвет — currentColor.
const ORDER_CARD_ICONS = {
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>',
    dots: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>',
    chevron: '<svg class="odc-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>',
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>',
};

const OrderDetail = {
    currentOrder: null,
    currentItems: [],
    currentFinancial: null,
    deliveryScheduleDraft: [],
    // Честная шапка: реальная себестоимость заказа из «Факта» и склад его штук «на продажу».
    // Приходят после показа карточки (см. _beginHonestNumbers). realCostState: 'none' — не нужна
    // или не пришла, 'loading' — ждём «Факт», 'ready' — ответ в currentRealCost.
    currentRealCost: null,
    realCostState: 'none',
    realCostDetailsOpen: false,
    tirageStock: null,
    tirageRecalcBusy: false,
    // Фурнитура и упаковка заказа со склада (строки _buildHardwareRows): hardwareState 'loading' —
    // читаем склад, 'ready' — строки в hardwareRows, 'error' — склад не прочитался, 'none' — склада нет.
    hardwareRows: null,
    hardwareState: 'none',
    // Что раскрыто: панель под плитками ('money' | 'payment' | 'stock' | null), меню «⋯» и его вид
    // ('main' | 'stages' | 'cancel'), строки внизу (moreOpen[key]) и «График сдачи».
    openPanel: null,
    menuOpen: false,
    menuView: 'main',
    moreOpen: {},
    moreCounts: {},
    deliveryOpen: false,
    statusBusy: false,
    // ТЗ, которое ещё не сохранилось (или не сохранилось из-за связи): перерисовка его не теряет.
    briefDraft: null,

    // ==========================================
    // LOAD
    // ==========================================

    async load(orderId) {
        if (!orderId) { App.navigate('orders'); return; }

        const data = await loadOrder(orderId);
        if (!data) {
            App.toast('Заказ не найден');
            App.navigate('orders');
            return;
        }

        this.currentOrder = data.order;
        this.currentItems = data.items || [];
        this.deliveryScheduleDraft = normalizeDeliverySchedule(data.order?.delivery_schedule, 0).schedule;
        this._beginHonestNumbers();

        // Всё, что есть в самом заказе, — сразу. «Факт», склад готовой продукции, фурнитура, задачи
        // и Китай дорисовываются, когда ответят: карточка их не ждёт.
        this.renderAll();
        this._inBackground(this.loadRealCost(), 'loadRealCost');
        this._inBackground(this.loadTirageStock(), 'loadTirageStock');
        this._inBackground(this.loadHardwareRows(), 'loadHardwareRows');
        this._inBackground(this.renderTasksTab(), 'renderTasksTab');
        this._inBackground(this.renderChinaTab(), 'renderChinaTab');

        if (data.repaired_duplicates) {
            App.toast('Дубли позиций в заказе были автоматически исправлены');
        }
    },

    // То, что дорисовывается само: ошибка не роняет карточку, а остаётся в консоли.
    _inBackground(promise, label) {
        if (promise && typeof promise.catch === 'function') {
            promise.catch(error => console.warn(`OrderDetail.${label} failed:`, error));
        }
    },

    // Вся карточка из того, что уже известно.
    renderAll() {
        this.renderHeader();
        this.renderStats();
        this.renderPanel();
        this.renderStages();
        this.renderWhat();
        this.renderProgress();
        this.renderMore();
        this.renderItemsTab();
        this.renderInfoTab();
    },

    // Сегодня по часам браузера: YYYY-MM-DD.
    _today() {
        if (typeof App !== 'undefined' && App && typeof App.todayLocalYMD === 'function') return App.todayLocalYMD();
        return OrderCardLogic._today();
    },

    _setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
        return el;
    },

    // ==========================================
    // HEADER: «← Все заказы», «Калькулятор», меню «⋯»
    // ==========================================

    renderHeader() {
        const o = this.currentOrder || {};
        this._setHtml('od-head', `
            ${this._renderToolbar()}
            <div class="odc-head">
                <div class="odc-head-main">
                    <div class="odc-head-title">
                        <h1 id="od-title" class="odc-title">${this._esc(o.order_name || 'Без названия')}</h1>
                    </div>
                </div>
            </div>`);
    },

    _renderToolbar() {
        const open = !!this.menuOpen;
        return `
            <div class="odc-toolbar">
                <button type="button" class="odc-back" onclick="App.navigate('orders')">${ORDER_CARD_ICONS.back}Все заказы</button>
                <div class="odc-toolbar-actions">
                    <button type="button" class="odc-btn" onclick="OrderDetail.openInCalculator()">Калькулятор</button>
                    <div class="odc-menu-wrap">
                        <button type="button" id="od-menu-btn" class="odc-btn odc-btn-icon"
                            aria-label="Ещё: копировать, сменить этап, отменить" aria-haspopup="true"
                            aria-expanded="${open ? 'true' : 'false'}" aria-controls="od-menu"
                            onclick="OrderDetail.toggleMenu()">${ORDER_CARD_ICONS.dots}</button>
                        ${open ? `<div id="od-menu" class="odc-menu" role="menu">${this._renderMenu()}</div>` : ''}
                    </div>
                </div>
            </div>`;
    },

    // Меню «⋯»: копировать, сменить этап (список этапов), отменить (с подтверждением в самом меню).
    _renderMenu() {
        const o = this.currentOrder || {};
        const item = (onclick, text, extra = '') => `<button type="button" role="menuitem" class="odc-menu-item ${extra}" onclick="${onclick}">${text}</button>`;
        if (this.menuView === 'stages') {
            const options = (typeof STATUS_OPTIONS !== 'undefined' && Array.isArray(STATUS_OPTIONS) ? STATUS_OPTIONS : [])
                .filter(option => option.value !== 'deleted');
            return `
                <div class="odc-menu-title">Перевести на этап</div>
                ${options.map(option => (option.value === o.status
                    ? `<div class="odc-menu-item odc-menu-current" aria-current="step">${this._esc(option.label)} · сейчас</div>`
                    : item(`OrderDetail.changeStatus('${this._escAttr(option.value)}')`, this._esc(option.label), this.statusBusy ? 'is-busy' : '')
                )).join('')}
                ${item("OrderDetail.showMenu('main')", 'Назад', 'odc-menu-back')}`;
        }
        if (this.menuView === 'cancel') {
            return `
                <div class="odc-menu-title">Отменить заказ «${this._esc(o.order_name || 'Без названия')}»?</div>
                ${item("OrderDetail.changeStatus('cancelled')", 'Да, отменить', 'odc-menu-danger')}
                ${item("OrderDetail.showMenu('main')", 'Нет, оставить')}`;
        }
        return `
            ${item('OrderDetail.cloneOrder()', 'Копировать заказ')}
            ${item("OrderDetail.showMenu('stages')", 'Сменить этап…')}
            ${o.status === 'cancelled' ? '' : item("OrderDetail.showMenu('cancel')", 'Отменить заказ', 'odc-menu-danger')}`;
    },

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        this.menuView = 'main';
        if (this.menuOpen) this._bindMenuDismiss();
        this.renderHeader();
    },

    showMenu(view) {
        this.menuOpen = true;
        this.menuView = ['main', 'stages', 'cancel'].includes(view) ? view : 'main';
        this._bindMenuDismiss();
        this.renderHeader();
    },

    closeMenu() {
        if (!this.menuOpen) return;
        this.menuOpen = false;
        this.menuView = 'main';
        this.renderHeader();
    },

    // Меню закрывается щелчком мимо него и клавишей Escape.
    _bindMenuDismiss() {
        if (this._menuDismissBound || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        this._menuDismissBound = true;
        document.addEventListener('click', event => {
            if (!this.menuOpen) return;
            const target = event && event.target;
            const inside = target && typeof target.closest === 'function' && target.closest('.odc-menu-wrap');
            if (!inside) this.closeMenu();
        });
        document.addEventListener('keydown', event => {
            if (this.menuOpen && event && event.key === 'Escape') this.closeMenu();
        });
    },

    // ==========================================
    // STATS
    // ==========================================

    buildLiveFinancialMeta() {
        const purpose = normalizeProductionPurpose(this.currentOrder?.production_purpose);
        // Цифры, сохранённые вместе с заказом, — когда живой расчёт недоступен. Честных денег
        // (разметка тиража, заработок) в них нет.
        const storedMeta = () => ({
            revenue: Number(this.currentOrder?.total_revenue_plan || 0),
            marginPercent: Number(this.currentOrder?.margin_percent_plan || 0),
            hours: Number(this.currentOrder?.total_hours_plan || 0),
            purpose,
            loss: isNonCommercialProductionPurpose(purpose)
                ? Math.max(0, Number(this.currentOrder?.total_cost_plan || 0))
                : 0,
            totalEarned: null,
            stockQty: 0,
            stockRevenue: 0,
            freeQty: 0,
            freeCost: 0,
            tirageLines: [],
        });
        if (typeof getOrderLiveCalculatorSnapshot !== 'function') {
            return storedMeta();
        }
        try {
            const snapshot = getOrderLiveCalculatorSnapshot(this.currentOrder || {}, this.currentItems || []);
            const snapshotPurpose = normalizeProductionPurpose(snapshot?.productionPurpose || this.currentOrder?.production_purpose);
            const summary = snapshot?.summary || {};
            const earned = summary.totalEarned === null || summary.totalEarned === undefined ? NaN : Number(summary.totalEarned);
            return {
                revenue: Number(snapshot?.revenue || 0),
                marginPercent: Number(snapshot?.marginPercent || 0),
                hours: Number(snapshot?.hours || 0),
                purpose: snapshotPurpose,
                loss: isNonCommercialProductionPurpose(snapshotPurpose)
                    ? Math.max(0, Number(snapshot?.nonCommercialLoss || this.currentOrder?.total_cost_plan || 0))
                    : 0,
                // Честные деньги по разметке тиража — как их считает калькулятор: сколько заработаем
                // (после затрат на весь тираж) и сколько штук и себестоимости отдаём бесплатно.
                totalEarned: Number.isFinite(earned) ? earned : null,
                stockQty: Number(summary.stockQty || 0),
                stockRevenue: Number(summary.stockRevenue || 0),
                freeQty: Number(summary.freeQty || 0),
                freeCost: Number(summary.freeCost || 0),
                tirageLines: snapshotPurpose === 'commercial' ? this._collectTirageLines(snapshot?.products) : [],
            };
        } catch (e) {
            console.warn('OrderDetail.buildLiveFinancialMeta fallback:', e);
            return storedMeta();
        }
    },

    // Строки изделий, у которых есть разметка тиража (кроме «всё клиенту»), для блока «Тираж».
    // Разметку берём у изделий снимка: B2C-заказ там уже без неё.
    _collectTirageLines(products) {
        const lines = [];
        (Array.isArray(products) ? products : []).forEach((product, index) => {
            const split = typeof getItemTirageSplit === 'function' ? getItemTirageSplit(product) : null;
            if (!split) return;
            lines.push({
                name: String(product?.product_name || '').trim() || `Изделие ${index + 1}`,
                quantity: Number(product?.quantity) || 0,
                split,
            });
        });
        return lines;
    },

    // Реальная маржа заказа, % — формула денег живёт в js/calculator.js (computeRealMargin).
    computeRealMargin(totalEarned, totalRevenue, realTotal, planTotal) {
        return computeRealMargin(totalEarned, totalRevenue, realTotal, planTotal);
    },

    // Реальная себестоимость заказа из «Факта» вместе с реальной маржой; null, пока «Факт» не ответил.
    _buildRealCostView(financial) {
        const real = this.currentRealCost;
        if (!real) return null;
        const realTotal = Number(real.realTotal);
        const planTotal = Number(real.planTotal);
        if (!Number.isFinite(realTotal) || !Number.isFinite(planTotal)) return null;
        return {
            realTotal,
            planTotal,
            hasTimesheet: !!real.hasTimesheet,
            hoursFact: Number(real.hoursFact) || 0,
            marginPercent: this.computeRealMargin(financial?.totalEarned, financial?.revenue, realTotal, planTotal),
        };
    },

    renderStats() {
        const o = this.currentOrder || {};
        const ps = PAYMENT_STATUSES.find(s => s.key === o.payment_status) || PAYMENT_STATUSES[0];
        this.currentFinancial = this.buildLiveFinancialMeta();
        const calculatedRevenue = Number(this.currentFinancial?.revenue || o.total_revenue_plan || 0);
        const marginPercent = Number(this.currentFinancial?.marginPercent || o.margin_percent_plan || 0);
        const hours = Number(this.currentFinancial?.hours || o.total_hours_plan || 0);
        const purpose = normalizeProductionPurpose(this.currentFinancial?.purpose || o.production_purpose);
        const isNonCommercial = isNonCommercialProductionPurpose(purpose);
        const isLeftoverAssembly = purpose === 'leftover_assembly';
        const purposeMeta = getProductionPurposeMeta(purpose);
        const revenue = isNonCommercial ? 0 : calculatedRevenue;
        const loss = Math.max(0, Number(this.currentFinancial?.loss || o.total_cost_plan || 0));

        // Честная шапка — у клиентского заказа: выручка с учётом разметки тиража, реальная маржа и
        // себестоимость по «Факту» рядом с плановыми, часы по плану и по табелю. «Переделка»,
        // «Сток / образец» и «Сборка из остатков» показывают то же, что и раньше.
        const honest = !isNonCommercial && !isLeftoverAssembly;
        const financial = this.currentFinancial || {};
        const real = honest ? this._buildRealCostView(financial) : null;
        const hasRealMargin = !!real && real.marginPercent !== null;
        const shownMargin = hasRealMargin ? real.marginPercent : marginPercent;
        const stockQty = honest ? Number(financial.stockQty || 0) : 0;
        const freeQty = honest ? Number(financial.freeQty || 0) : 0;

        // Подпись говорит, чья это цифра: пока «Факт» не ответил (или табеля нет) маржа плановая.
        let marginCaption = '';
        if (honest) {
            if (!hasRealMargin) marginCaption = 'план';
            else if (!real.hasTimesheet) marginCaption = 'по плану';
            else marginCaption = `план ${formatPercent(marginPercent)}`;
        }
        let costTile = '';
        if (honest && this.realCostState === 'loading') {
            costTile = this._tile({ label: 'Себестоимость', value: '…', caption: 'считаем по факту', tone: 'muted' });
        } else if (real && (real.realTotal > 0 || real.planTotal > 0)) {
            costTile = this._tile({
                label: 'Себестоимость',
                value: this._formatWhole(real.realTotal),
                caption: real.hasTimesheet ? `план ${this._formatWhole(real.planTotal)}` : 'по плану',
            });
        }
        let hoursCaption = '';
        if (real) {
            hoursCaption = real.hasTimesheet
                ? `план ${this._formatHours(hours)} · табель ${this._formatHours(real.hoursFact)}`
                : `план ${this._formatHours(hours)} · табеля нет`;
        }
        const freeLine = freeQty > 0
            ? `<div class="odc-tiles-note">Отдаём бесплатно: ${this._formatQuantity(freeQty)} шт. на ${this._formatWhole(financial.freeCost)} себестоимости</div>`
            : '';

        const marginTile = this._tile({
            label: isNonCommercial ? (purpose === 'marketing' ? 'Расход на маркетинг' : 'Некоммерческие расходы') : 'Маржа',
            value: isNonCommercial ? '−' + formatRub(loss) : formatPercent(shownMargin),
            tone: isNonCommercial || shownMargin < 30 ? 'red' : 'green',
            caption: marginCaption,
            panel: 'money',
            more: 'деньги',
        });
        const paymentTile = isNonCommercial || isLeftoverAssembly
            ? this._tile({ label: 'Тип работ', value: isNonCommercial ? `${purposeMeta.icon} ${purposeMeta.shortLabel}` : '↙ Сборка из остатков' })
            : this._tile({ label: 'Оплата', value: ps.label, panel: 'payment', more: 'изменить' });

        this._setHtml('od-stats', `
            ${this._tile({ label: 'Выручка', value: formatRub(revenue), caption: stockQty > 0 ? `ожидаем, если продадим ${this._formatQuantity(stockQty)} шт.` : '' })}
            ${marginTile}
            ${costTile}
            ${this._tile({ label: 'Часы', value: `${hours.toFixed(1)} ч`, caption: hoursCaption })}
            ${this._stockTile()}
            ${paymentTile}
            ${freeLine}
        `);
    },

    // Плитка под строкой денег: подпись, крупное значение и подпись под ним — текстом (экранируется).
    // С panel — это кнопка, которая раскрывает панель под плитками (#od-panel).
    _tile({ label, value, caption = '', tone = '', panel = '', more = '' }) {
        const body = `
                <span class="odc-tile-label">${this._esc(label)}</span>
                <span class="odc-tile-value${tone ? ` odc-tone-${tone}` : ''}">${this._esc(value)}</span>
                ${caption ? `<span class="odc-tile-caption">${this._esc(caption)}</span>` : ''}`;
        if (!panel) return `<div class="odc-tile">${body}</div>`;
        const open = this.openPanel === panel;
        return `
            <button type="button" class="odc-tile odc-tile-button" data-od-panel="${panel}"
                aria-expanded="${open ? 'true' : 'false'}" aria-controls="od-panel"
                onclick="OrderDetail.togglePanel('${panel}')">${body}
                <span class="odc-tile-more">${this._esc(more || 'подробнее')} ${ORDER_CARD_ICONS.chevron}</span>
            </button>`;
    },

    // «Склад»: фурнитура и упаковка заказа со склада (строки _buildHardwareRows).
    _stockTile() {
        const state = this.hardwareState;
        const rows = Array.isArray(this.hardwareRows) ? this.hardwareRows : [];
        let value = '…';
        let caption = 'проверяем склад';
        let tone = 'muted';
        if (state === 'error') {
            value = '—';
            caption = 'склад не прочитался';
        } else if (state === 'ready') {
            const labels = rows.map(row => OrderCardLogic.stockLabel(row));
            const shortage = labels.filter(label => label.tone === 'red').length;
            if (!rows.length) {
                value = 'Не нужен';
                caption = 'без фурнитуры и упаковки со склада';
            } else if (labels.every(label => label.tone === 'green')) {
                value = 'Всё собрано';
                caption = 'собрано и списано';
                tone = 'green';
            } else if (shortage > 0) {
                value = `Не хватает ${shortage}`;
                caption = `из ${rows.length} поз.`;
                tone = 'red';
            } else {
                value = 'Всё есть';
                caption = this._stockSummary(labels);
                tone = 'green';
            }
        } else if (state === 'none') {
            value = '—';
            caption = 'склад недоступен';
        }
        return this._tile({ label: 'Склад', value, caption, tone, panel: 'stock', more: 'фурнитура' });
    },

    // «2 в резерве, 1 собрано, 1 на складе».
    _stockSummary(labels) {
        const count = tone => labels.filter(label => label.tone === tone).length;
        const parts = [];
        if (count('blue')) parts.push(`${count('blue')} в резерве`);
        if (count('green')) parts.push(`${count('green')} собрано`);
        const free = labels.filter(label => label.tone === 'gray' && label.text !== 'не нужно').length;
        if (free) parts.push(`${free} на складе`);
        return parts.join(', ');
    },

    // ==========================================
    // PANEL под плитками: деньги, оплата, склад
    // ==========================================

    togglePanel(name) {
        const panels = ['money', 'payment', 'stock'];
        this.openPanel = panels.includes(name) && this.openPanel !== name ? name : null;
        this.realCostDetailsOpen = this.openPanel === 'money';
        this.renderStats();
        this.renderPanel();
        const panel = document.getElementById('od-panel');
        if (this.openPanel && panel && typeof panel.scrollIntoView === 'function') {
            panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    },

    renderPanel() {
        const panel = document.getElementById('od-panel');
        if (!panel) return;
        const name = this.openPanel;
        panel.hidden = !name;
        panel.dataset.panel = name || '';
        if (!name) {
            panel.innerHTML = '';
            return;
        }
        if (name === 'money') {
            panel.innerHTML = this._renderMoneyPanel();
        } else if (name === 'payment') {
            panel.innerHTML = this._renderPaymentPanel();
        } else if (name === 'stock') {
            panel.innerHTML = '<div id="od-tab-hardware"></div>';
            void this.renderHardwareTab();
        }
    },

    // Деньги: выручка, что отдаём бесплатно и из чего сложилась себестоимость (таблица «Факта»).
    _renderMoneyPanel() {
        const real = this._buildRealCostView(this.currentFinancial || this.buildLiveFinancialMeta());
        if (real && this.currentRealCost) {
            return this.renderRealCostDetails(this.currentRealCost, this._canSeeSalaryBreakdown());
        }
        const text = this.realCostState === 'loading'
            ? 'Считаем себестоимость по табелю…'
            : 'Себестоимость по табелю сейчас не посчитать — цифры по плану.';
        return `<div class="odc-panel-note">${this._esc(text)}</div>`;
    },

    _renderPaymentPanel() {
        const current = (this.currentOrder && this.currentOrder.payment_status) || 'not_sent';
        const options = PAYMENT_STATUSES.map(status =>
            `<option value="${this._escAttr(status.key)}"${status.key === current ? ' selected' : ''}>${this._esc(status.label)}</option>`
        ).join('');
        return `
            <div class="odc-field">
                <label for="od-payment-select" class="odc-field-label">Статус оплаты</label>
                <select id="od-payment-select" class="odc-select" onchange="OrderDetail.setPaymentStatus(this.value)">${options}</select>
            </div>`;
    },

    async setPaymentStatus(value) {
        const order = this.currentOrder;
        if (!order || !PAYMENT_STATUSES.some(status => status.key === value)) return false;
        if (value === (order.payment_status || 'not_sent')) return true;
        const saved = await this.saveField('payment_status', value);
        // Не сохранилось — выбор показывает то, что записано.
        if (!saved && this.currentOrder === order && this.openPanel === 'payment') this.renderPanel();
        return saved;
    },

    // Рубли без копеек: «121 000 ₽».
    _formatWhole(value) {
        return formatRub(Math.round(Number(value) || 0));
    },

    // Часы с десятой, без лишнего «.0»: 12.1, 18.
    _formatHours(value) {
        return String(Math.round((Number(value) || 0) * 10) / 10);
    },

    // ==========================================
    // HONEST NUMBERS: real cost from «Факт» and the stock of the «на продажу» pieces
    // ==========================================

    // Карточка открыта (заново): всё, что пришло для предыдущей, забыть. Ответы, которые ещё в пути,
    // станут устаревшими — их отличает номер открытия.
    _beginHonestNumbers() {
        this._honestToken = (this._honestToken || 0) + 1;
        this.currentRealCost = null;
        this.tirageStock = null;
        this.realCostDetailsOpen = false;
        this.tirageRecalcBusy = false;
        this.realCostState = this._canLoadRealCost() ? 'loading' : 'none';
        this.hardwareRows = null;
        this.hardwareState = this._canLoadHardwareRows() ? 'loading' : 'none';
        this.openPanel = null;
        this.menuOpen = false;
        this.menuView = 'main';
        this.moreOpen = {};
        this.moreCounts = {};
        this.deliveryOpen = false;
        this.statusBusy = false;
        this.briefDraft = null;
    },

    // Реальная себестоимость нужна клиентскому заказу; у «Переделки», «Стока / образца» и «Сборки из
    // остатков» продажи нет, и карточка показывает прежнее.
    _canLoadRealCost() {
        return !!(this.currentOrder && this.currentOrder.id)
            && normalizeProductionPurpose(this.currentOrder.production_purpose) === 'commercial'
            && typeof Factual !== 'undefined' && !!Factual && typeof Factual.computeOrderRealCost === 'function';
    },

    // Зарплатные строки и «Косвенные» карточка показывает тогда же, когда страница «Факт»
    // (Factual._renderDetail): администратору, App.isAdmin(). Остальные видят разбивку без них;
    // общая сумма реальной себестоимости и реальная маржа видны всем.
    _canSeeSalaryBreakdown() {
        return typeof App !== 'undefined' && !!App && typeof App.isAdmin === 'function' && !!App.isAdmin();
    },

    // Строки, которые страница «Факт» прячет от не-администраторов: зарплата по этапам и
    // «Косвенные» (часы × косвенные за час). Тот же признак, что у страницы.
    _isSalaryGatedRow(row) {
        return OrderCardLogic.isSalaryRow(row);
    },

    // «Факт» считает заказ по свежему табелю — один раз на открытие карточки (и ещё раз, когда
    // менеджер пересчитывает себестоимость склада). Шапка дорисовывается, когда он ответил.
    async loadRealCost() {
        const orderId = this.currentOrder && this.currentOrder.id;
        if (!orderId || !this._canLoadRealCost()) return null;
        const token = this._honestToken;
        let real = null;
        try {
            real = await Factual.computeOrderRealCost(orderId, { fresh: true });
        } catch (error) {
            console.warn('OrderDetail.loadRealCost failed:', error);
        }
        // Пока «Факт» считал, открыли другую карточку — этот ответ уже не про неё.
        if (token !== this._honestToken || !this.currentOrder || this.currentOrder.id !== orderId) return null;
        if (real && Number.isFinite(Number(real.realTotal)) && Number.isFinite(Number(real.planTotal))) {
            this.currentRealCost = real;
            this.realCostState = 'ready';
        } else if (!this.currentRealCost) {
            // Нет ответа — шапка остаётся плановой. Прошлый удачный ответ при повторе не теряем.
            this.realCostState = 'none';
        }
        this._renderRealCostDependents();
        return this.currentRealCost;
    },

    // «Факт» ответил (или нет): плитки и деньги в раскрытой панели.
    _renderRealCostDependents() {
        this.renderStats();
        if (this.openPanel === 'money') this.renderPanel();
    },

    // Деньги заказа — панель под плитками; второе нажатие её закрывает.
    toggleRealCostDetails() {
        this.togglePanel('money');
    },

    // Из чего сложилась себестоимость заказа: статьи «Факта», план и то, что взято в расчёт (по
    // факту или по плану). Зарплатные строки и «Косвенные» — только при canSeeSalary (см.
    // _canSeeSalaryBreakdown); общая сумма видна всем.
    renderRealCostDetails(breakdown, canSeeSalary) {
        const rows = Array.isArray(breakdown?.rows) ? breakdown.rows : [];
        const hasMoney = row => !!row && ((Number(row.plan) || 0) !== 0 || (Number(row.used) || 0) !== 0);
        const shown = rows.filter(row => hasMoney(row) && (canSeeSalary || !this._isSalaryGatedRow(row)));
        const salaryHidden = !canSeeSalary && rows.some(row => hasMoney(row) && this._isSalaryGatedRow(row));
        const cell = 'padding:8px 12px;font-size:14px;';
        const head = 'padding:8px 12px;font-size:14px;text-transform:none;letter-spacing:0;';
        const body = shown.map(row => `
                    <tr>
                        <td style="${cell}">${this._esc(row.label || row.key || '')}</td>
                        <td class="text-right" style="${cell}">${this._formatWhole(row.plan)}</td>
                        <td class="text-right" style="${cell}font-weight:600;">${this._formatWhole(row.used)}</td>
                        <td style="${cell}color:var(--text-muted);">${row.source === 'plan' ? 'по плану' : 'по факту'}</td>
                    </tr>`).join('');
        const notes = [];
        // Без табеля вся себестоимость плановая (Factual.computeOrderRealCost): итог — план, даже
        // если по какой-то статье «Факт» уже знает больше (например, ФинТабло по фурнитуре).
        if (breakdown && breakdown.hasTimesheet === false) {
            notes.push('Табеля по заказу нет — вся себестоимость взята по плану.');
            if (shown.some(row => row.source === 'fact')) notes.push('Факт по статьям — для справки, в итог не входит.');
        }
        if (salaryHidden) {
            notes.push('Зарплата и косвенные скрыты: их видят только администраторы.');
        }
        return `
        <div class="card" id="od-real-cost-details" style="margin-bottom:0;">
            <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Из чего сложилась себестоимость</div>
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th style="${head}">Статья</th>
                        <th class="text-right" style="${head}">План</th>
                        <th class="text-right" style="${head}">Реально</th>
                        <th style="${head}">Откуда</th>
                    </tr></thead>
                    <tbody>${body}
                        <tr>
                            <td style="${cell}font-weight:700;">Итого</td>
                            <td class="text-right" style="${cell}font-weight:700;">${this._formatWhole(breakdown?.planTotal)}</td>
                            <td class="text-right" style="${cell}font-weight:700;">${this._formatWhole(breakdown?.realTotal)}</td>
                            <td style="${cell}"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            ${notes.map(note => `<div style="font-size:14px;color:var(--text-muted);margin-top:8px;">${this._esc(note)}</div>`).join('')}
        </div>`;
    },

    // ==========================================
    // «ТИРАЖ» — в «Что делаем», под составом
    // ==========================================

    // Блок «Тираж»: как поделён тираж каждой строки изделия и что из «на продажу» лежит на складе
    // готовой продукции. Только просмотр: разметку меняют в калькуляторе. Пустая строка, если у
    // заказа нет разметки (а у B2C, «Переделки», «Стока / образца» и «Сборки из остатков» её нет).
    renderTirageInfo() {
        const lines = this._getTirageLines();
        if (!lines.length) return '';
        const count = value => this._formatQuantity(value);
        const note = value => {
            const text = String(value || '').trim();
            return text ? ` (${this._esc(text)})` : '';
        };
        const rows = lines.map(line => {
            const { split } = line;
            const parts = [`клиенту ${count(split.client)}`];
            if (split.stock > 0) parts.push(`на продажу ${count(split.stock)} по ${formatRub(split.stock_price)}`);
            if (split.partner > 0) parts.push(`партнёру ${count(split.partner)}${note(split.partner_note)}`);
            if (split.gift > 0) parts.push(`в подарок ${count(split.gift)}${note(split.gift_note)}`);
            if (split.sample > 0) parts.push(`образцы ${count(split.sample)}`);
            return `
                <div>
                    <div class="odc-tirage-name">${this._esc(line.name)} · ${count(line.quantity)} шт.</div>
                    <div class="odc-tirage-split">${parts.join(' · ')}</div>
                </div>`;
        }).join('');
        return `
        <div class="odc-tirage" id="od-tirage-card">
            <h3 class="odc-h3">Тираж</h3>
            <div class="odc-tirage-rows">${rows}${this._renderTirageStock()}
            </div>
        </div>`;
    },

    _getTirageLines() {
        const meta = this.buildLiveFinancialMeta();
        return Array.isArray(meta.tirageLines) ? meta.tirageLines : [];
    },

    // «На складе N из M · заморожено X ₽ · продано K на Y ₽» и кнопка пересчёта себестоимости —
    // когда штуки «на продажу» уже стоят на складе готовой продукции.
    _renderTirageStock() {
        const stock = this.tirageStock;
        if (!stock || !(Number(stock.total) > 0)) return '';
        const count = value => this._formatQuantity(value);
        const sold = Number(stock.soldQty) > 0
            ? `продано ${count(stock.soldQty)} на ${this._formatWhole(stock.soldRevenue)}`
            : 'продано 0';
        // Пересчитывать есть что, только пока на складе лежат непроданные штуки.
        const button = Number(stock.inStock) > 0
            ? `<div class="odc-tirage-action"><button type="button" class="odc-btn"
                    onclick="OrderDetail.recalcTirageCost()" ${this.tirageRecalcBusy ? 'disabled' : ''}
                    title="Когда ФинТабло догнал: себестоимость непроданных штук на складе пересчитается, записи продаж останутся как были">${this.tirageRecalcBusy ? 'Пересчитываем…' : 'Пересчитать себестоимость'}</button></div>`
            : '';
        return `
                <div class="odc-tirage-stock">
                    <div class="odc-tirage-name">Склад готовой продукции</div>
                    <div class="odc-tirage-split" title="Заморожено — себестоимость непроданных штук на складе">На складе ${count(stock.inStock)} из ${count(stock.total)} · заморожено ${this._formatWhole(stock.frozen)} · ${sold}</div>
                    ${button}
                </div>`;
    },

    // Блок перерисовывается на месте: «Что делаем» целиком трогать нельзя — в нём пишут ТЗ.
    _renderTirageSlot() {
        const slot = document.getElementById('od-tirage-slot');
        if (slot) slot.innerHTML = this.renderTirageInfo();
    },

    // Склад штук «на продажу» этого заказа: читается, только если у заказа есть что продавать.
    async loadTirageStock() {
        const orderId = this.currentOrder && this.currentOrder.id;
        if (!orderId) return null;
        const forSale = this._getTirageLines().some(line => line.split.stock > 0);
        if (!forSale || typeof Warehouse === 'undefined' || !Warehouse || typeof Warehouse.getOrderTirageStockSummary !== 'function') {
            if (this.tirageStock) {
                this.tirageStock = null;
                this._renderTirageSlot();
            }
            return null;
        }
        const token = this._honestToken;
        let summary;
        try {
            summary = await Warehouse.getOrderTirageStockSummary(orderId);
        } catch (error) {
            // Склад не прочитался — блок остаётся как был, не пропадает.
            console.warn('OrderDetail.loadTirageStock failed:', error);
            return this.tirageStock;
        }
        if (token !== this._honestToken || !this.currentOrder || this.currentOrder.id !== orderId) return null;
        this.tirageStock = summary && Number(summary.total) > 0 ? summary : null;
        this._renderTirageSlot();
        return this.tirageStock;
    },

    // «Пересчитать себестоимость»: непроданные штуки на складе получают сегодняшнюю реальную
    // себестоимость (записи продаж остаются как были); шапка читает «Факт» заново.
    async recalcTirageCost() {
        const orderId = this.currentOrder && this.currentOrder.id;
        if (!orderId || this.tirageRecalcBusy) return;
        if (typeof Warehouse === 'undefined' || !Warehouse || typeof Warehouse.recalcOrderReadyGoodsCost !== 'function') return;
        const token = this._honestToken;
        this.tirageRecalcBusy = true;
        this._renderTirageSlot();
        let recalculated = false;
        try {
            const updated = await Warehouse.recalcOrderReadyGoodsCost(orderId);
            recalculated = true;
            App.toast(updated > 0 ? 'Себестоимость непроданных штук пересчитана' : 'Себестоимость не изменилась');
        } catch (error) {
            console.error('OrderDetail.recalcTirageCost failed:', error);
            // Без «Факта» склад себестоимость не трогает: план не затирает реальную.
            App.toast(String(error && error.message) === 'READY_GOODS_REAL_COST_UNAVAILABLE'
                ? 'Не удалось пересчитать себестоимость — «Факт» сейчас недоступен. Попробуйте позже.'
                : 'Не удалось пересчитать себестоимость — нет связи с общей базой. Попробуйте ещё раз.');
        }
        // Открыли другую карточку — эта уже не на экране (и её состояние сброшено).
        if (token !== this._honestToken) return;
        this.tirageRecalcBusy = false;
        this._renderTirageSlot();
        await this.loadTirageStock();
        // ФинТабло догнал — шапка должна показывать ту же реальную себестоимость, что и склад.
        if (recalculated) await this.loadRealCost();
    },

    // ==========================================
    // STAGES: строка этапов и «Перевести на «…»»
    // ==========================================

    // Что есть в заказе — от этого зависят этапы: печать, сборка, упаковка.
    _stageFlags() {
        const items = Array.isArray(this.currentItems) ? this.currentItems : [];
        const type = item => String(item?.item_type || 'product').trim().toLowerCase();
        const printingsOf = item => {
            const list = typeof parseOrderCalcJson === 'function'
                ? parseOrderCalcJson(item.printings, [])
                : (Array.isArray(item.printings) ? item.printings : []);
            if (!Array.isArray(list)) return [];
            return typeof getActivePrintings === 'function' ? getActivePrintings({ printings: list }) : list;
        };
        return {
            hasPrinting: items.some(item => type(item) === 'product'
                && (printingsOf(item).length > 0 || Number(item.sell_price_printing) > 0)),
            hasHardware: items.some(item => type(item) === 'hardware' || type(item) === 'pendant'),
            hasPackaging: items.some(item => type(item) === 'packaging'),
        };
    },

    _stagesModel() {
        return OrderCardLogic.stages({ status: this.currentOrder && this.currentOrder.status, ...this._stageFlags() });
    },

    renderStages() {
        const o = this.currentOrder || {};
        const model = this._stagesModel();
        const steps = model.list.map(step => {
            const current = step.state === 'current';
            const finished = step.state === 'done' || (current && step.value === 'completed');
            const cls = step.state === 'done' ? 'odc-step-done' : (current ? 'odc-step-current' : 'odc-step-todo');
            return `<li class="odc-step ${cls}${current && step.value === 'completed' ? ' odc-step-final' : ''}"${current ? ' aria-current="step"' : ''}>${finished ? ORDER_CARD_ICONS.check : ''}<span>${this._esc(step.label)}</span></li>`;
        }).join('');
        let action = '';
        if (model.next) {
            action = `
                <button type="button" class="odc-btn odc-btn-primary" onclick="OrderDetail.moveToNextStage()"${this.statusBusy ? ' disabled' : ''}>
                    ${this.statusBusy ? 'Переводим…' : `Перевести на «${this._esc(model.next.label)}» ${ORDER_CARD_ICONS.arrow}`}
                </button>`;
        }
        const note = o.status === 'cancelled' ? '<div class="odc-stages-note">Заказ отменён</div>' : '';
        this._setHtml('od-stages', `<ol class="odc-steps" aria-label="Этапы заказа">${steps}</ol>${note}${action}`);
    },

    moveToNextStage() {
        const next = this._stagesModel().next;
        if (!next) return Promise.resolve();
        return this.changeStatus(next.value);
    },

    // ==========================================
    // «ЧТО ДЕЛАЕМ»: ТЗ для цеха, состав, тираж
    // ==========================================

    renderWhat() {
        const o = this.currentOrder || {};
        const brief = document.getElementById('od-brief');
        if (brief && typeof document !== 'undefined' && document.activeElement === brief) {
            // ТЗ сейчас пишут — его не трогаем: обновляется только состав и тираж.
            this._setHtml('od-what-items', this._renderComposition());
            this._renderTirageSlot();
            return;
        }
        const text = this.briefDraft !== null && this.briefDraft !== undefined ? this.briefDraft : (o.notes || '');
        this._setHtml('od-what', `
            <h2 class="odc-h2">${o.status === 'completed' ? 'Что делали' : 'Что делаем'}</h2>
            <label for="od-brief" class="odc-field-label">ТЗ для цеха — сохраняется само</label>
            <textarea id="od-brief" class="odc-brief" rows="4"
                placeholder="Что и сколько, цвет, нанесение, фурнитура и сборка, упаковка"
                oninput="OrderDetail.briefDraft = this.value"
                onblur="OrderDetail.saveBrief(this.value)"
                onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();this.blur();}">${this._esc(text)}</textarea>
            <div id="od-what-items" class="odc-what-items">${this._renderComposition()}</div>
            <div id="od-tirage-slot">${this.renderTirageInfo()}</div>`);
    },

    // ТЗ сохраняется само, когда уходят из поля, — если изменилось. Не сохранилось — текст остаётся.
    async saveBrief(value) {
        const order = this.currentOrder;
        if (!order) return false;
        const typed = String(value ?? '');
        if (typed.trim() === String(order.notes || '').trim()) {
            this.briefDraft = null;
            return true;
        }
        this.briefDraft = typed;
        const saved = await this.saveField('notes', typed.trim());
        if (saved && this.currentOrder === order && this.briefDraft === typed) this.briefDraft = null;
        return saved;
    },

    // Состав заказа: изделия и подвесы.
    _renderComposition() {
        const items = Array.isArray(this.currentItems) ? this.currentItems : [];
        const lines = items.filter(item => ['product', 'pendant'].includes(String(item?.item_type || 'product')));
        if (!lines.length) return '<div class="odc-muted">В заказе нет изделий.</div>';
        return lines.map(item => `
            <div class="odc-product">
                <div class="odc-product-head">
                    <span class="odc-product-name">${this._esc(item.product_name || 'Изделие')} — ${this._formatQuantity(item.quantity)} шт.</span>
                </div>
            </div>`).join('');
    },

    // ==========================================
    // «КАК ИДЁТ»: сроки, часы, график сдачи
    // ==========================================

    renderProgress() {
        const o = this.currentOrder || {};
        this._setHtml('od-progress', `
            <section class="odc-card" aria-label="${o.status === 'completed' ? 'Как шло' : 'Как идёт'}">
                <h2 class="odc-h2">${o.status === 'completed' ? 'Как шло' : 'Как идёт'}</h2>
                ${this._renderDeliveryRow()}
            </section>`);
    },

    // «Сдаём одной партией» / «Сдаём в 3 партии» — раскрывает «График сдачи» под собой.
    _renderDeliveryRow() {
        const schedule = normalizeDeliverySchedule(this.currentOrder && this.currentOrder.delivery_schedule, 0).schedule;
        const count = schedule.length;
        const label = count > 1 ? `Сдаём в ${count} ${this._plural(count, 'партию', 'партии', 'партий')}` : 'Сдаём одной партией';
        const dates = schedule.map(entry => OrderCardLogic.formatDayMonth(entry.date)).filter(Boolean).join(', ');
        const open = !!this.deliveryOpen;
        return `
            <div class="odc-delivery">
                <button type="button" class="odc-row-btn" aria-expanded="${open ? 'true' : 'false'}" aria-controls="od-delivery-slot"
                    onclick="OrderDetail.toggleDelivery()">
                    <span class="odc-row-title">${this._esc(label)}</span>
                    <span class="odc-row-sum">${this._esc(dates)}</span>
                    ${ORDER_CARD_ICONS.chevron}
                </button>
                <div id="od-delivery-slot"${open ? '' : ' hidden'}>${open ? this._renderDeliveryScheduleCard() : ''}</div>
            </div>`;
    },

    toggleDelivery() {
        this.deliveryOpen = !this.deliveryOpen;
        this.renderProgress();
    },

    _renderDeliveryScheduleCard() {
        const totalQuantity = getOrderProductionQuantity(this.currentItems);
        const validation = normalizeDeliverySchedule(this.deliveryScheduleDraft, totalQuantity);
        const hasRows = validation.schedule.length > 0;
        const statusTone = !hasRows ? 'muted' : (validation.valid ? 'green' : 'red');
        const statusText = !hasRows
            ? `Тираж: ${this._formatQuantity(totalQuantity)} шт. · сдаётся одной частью`
            : validation.valid
                ? `Распределено ${this._formatQuantity(validation.total)} из ${this._formatQuantity(totalQuantity)} шт.`
                : validation.errors[validation.errors.length - 1];
        const rows = this.deliveryScheduleDraft.map((entry, index) => `
            <div class="odc-delivery-line" data-delivery-row="${index}">
                <input type="date" class="odc-input" aria-label="Дата партии ${index + 1}" value="${this._escAttr(entry.date || '')}"
                    onchange="OrderDetail.updateDeliveryScheduleDraft(${index}, 'date', this.value)">
                <input type="number" class="odc-input" min="1" step="1" aria-label="Количество в партии ${index + 1}" value="${this._escAttr(entry.quantity || '')}"
                    placeholder="Количество"
                    onchange="OrderDetail.updateDeliveryScheduleDraft(${index}, 'quantity', this.value)">
                <button class="odc-btn odc-btn-icon" type="button" aria-label="Удалить партию ${index + 1}"
                    onclick="OrderDetail.removeDeliveryScheduleRow(${index})">${ORDER_CARD_ICONS.close}</button>
            </div>
        `).join('');

        return `
        <div class="odc-delivery-card" id="od-delivery-schedule-card">
            <div class="odc-delivery-head">
                <div>
                    <h3 class="odc-h3">График сдачи</h3>
                    <div class="odc-caption odc-tone-${statusTone}">${this._esc(statusText)}</div>
                </div>
                <button class="odc-btn" type="button" onclick="OrderDetail.addDeliveryScheduleRow()">+ Партия</button>
            </div>
            ${hasRows
                ? `<div class="odc-delivery-lines">${rows}</div>`
                : '<div class="odc-caption">Добавьте даты и количество, если тираж нужно сдавать частями.</div>'}
            ${validation.errors.length
                ? `<div class="odc-caption odc-tone-red">${validation.errors.map(error => this._esc(error)).join('<br>')}</div>`
                : ''}
            <div class="odc-delivery-actions">
                <button class="odc-btn odc-btn-primary" type="button" onclick="OrderDetail.saveDeliverySchedule()">Сохранить график</button>
            </div>
        </div>`;
    },

    _renderDeliveryScheduleOnly() {
        const previous = document.getElementById('od-delivery-schedule-card');
        if (!previous || typeof previous.replaceWith !== 'function') {
            this.deliveryOpen = true;
            this.renderProgress();
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this._renderDeliveryScheduleCard();
        const next = wrapper.firstElementChild;
        if (next) previous.replaceWith(next);
    },

    updateDeliveryScheduleDraft(index, field, value) {
        if (!this.deliveryScheduleDraft[index]) return;
        this.deliveryScheduleDraft[index][field] = field === 'quantity' ? Number(value) : value;
    },

    addDeliveryScheduleRow() {
        this.deliveryScheduleDraft.push({
            date: '',
            quantity: '',
        });
        this._renderDeliveryScheduleOnly();
    },

    removeDeliveryScheduleRow(index) {
        this.deliveryScheduleDraft.splice(index, 1);
        this._renderDeliveryScheduleOnly();
    },

    async saveDeliverySchedule() {
        const order = this.currentOrder;
        if (!order) return;
        const totalQuantity = getOrderProductionQuantity(this.currentItems);
        const validation = normalizeDeliverySchedule(this.deliveryScheduleDraft, totalQuantity);
        if (!validation.valid) {
            App.toast(validation.errors[0] || 'Проверьте график сдачи');
            this._renderDeliveryScheduleOnly();
            return;
        }

        const siblingUpdates = {};
        if (validation.schedule.length > 0) {
            siblingUpdates.deadline_end = validation.schedule[validation.schedule.length - 1].date;
        }
        try {
            const snapshot = await updateOrderCalculatorData(
                order.id,
                { delivery_schedule: validation.schedule },
                siblingUpdates
            );
            order.calculator_data = JSON.stringify(snapshot);
            order.delivery_schedule = validation.schedule;
            if (siblingUpdates.deadline_end) order.deadline_end = siblingUpdates.deadline_end;
            if (this.currentOrder === order) {
                this.deliveryScheduleDraft = validation.schedule.map(entry => ({ ...entry }));
                // Срок мог сдвинуться на последнюю партию: шапка, плитки и «Как идёт» — заново.
                this.renderHeader();
                this.renderStats();
                this.renderProgress();
                this.renderInfoTab();
            }
            App.toast(validation.schedule.length ? 'График сдачи сохранён' : 'График сдачи удалён');
        } catch (error) {
            console.error('OrderDetail.saveDeliverySchedule error:', error);
            App.toast(error?.message || 'Не удалось сохранить график сдачи');
        }
    },

    _formatQuantity(value) {
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value) || 0);
    },

    // 1 партию, 2 партии, 5 партий.
    _plural(value, one, few, many) {
        const n = Math.abs(Math.round(Number(value) || 0));
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    },

    // ==========================================
    // ВНИЗУ: строки, которые раскрываются под собой
    // ==========================================

    MORE_ROWS: [
        { key: 'items', title: 'Состав подробно' },
        { key: 'info', title: 'Данные заказа и контакты' },
        { key: 'tasks', title: 'Задачи' },
        { key: 'china', title: 'Закупки в Китае' },
    ],

    // Строки и контейнеры под ними рисуются раз на открытие карточки: содержимое контейнеров
    // (#od-tab-items, #od-tab-info, #od-tab-tasks, #od-tab-china) рисуют прежние функции.
    renderMore() {
        const rows = this.MORE_ROWS.map(row => {
            const open = !!this.moreOpen[row.key];
            return `
            <div class="odc-more-row">
                <button type="button" class="odc-row-btn odc-more-btn" id="od-more-btn-${row.key}"
                    aria-expanded="${open ? 'true' : 'false'}" aria-controls="od-tab-${row.key}"
                    onclick="OrderDetail.toggleMore('${row.key}')">
                    <span class="odc-row-title">${this._esc(row.title)}</span>
                    <span class="odc-row-sum" id="od-more-sum-${row.key}">${this._esc(this._moreSummary(row.key))}</span>
                    ${ORDER_CARD_ICONS.chevron}
                </button>
                <div id="od-tab-${row.key}" class="odc-more-body"${open ? '' : ' hidden'}></div>
            </div>`;
        }).join('');
        this._setHtml('od-more', rows);
    },

    toggleMore(key) {
        if (!this.MORE_ROWS.some(row => row.key === key)) return;
        const open = !this.moreOpen[key];
        this.moreOpen = { ...this.moreOpen, [key]: open };
        const button = document.getElementById(`od-more-btn-${key}`);
        if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
        const body = document.getElementById(`od-tab-${key}`);
        if (body) body.hidden = !open;
    },

    // Сводка справа от строки: «3 позиции», «Telegram, CRM», «нет», «2».
    _moreSummary(key) {
        const o = this.currentOrder || {};
        if (key === 'items') {
            const count = (Array.isArray(this.currentItems) ? this.currentItems : [])
                .filter(item => ['product', 'pendant', 'hardware', 'packaging'].includes(String(item?.item_type || 'product'))).length;
            return count ? `${count} ${this._plural(count, 'позиция', 'позиции', 'позиций')}` : 'нет';
        }
        if (key === 'info') {
            const filled = [
                ['delivery_address', 'адрес'], ['telegram', 'Telegram'], ['crm_link', 'CRM'], ['fintablo_link', 'Финтабло'],
            ].filter(([field]) => String(o[field] || '').trim()).map(([, label]) => label);
            return filled.length ? filled.join(', ') : 'контактов и ссылок нет';
        }
        const count = this.moreCounts[key];
        if (count === undefined || count === null) return '…';
        return count > 0 ? String(count) : 'нет';
    },

    _setMoreSummary(key) {
        const el = document.getElementById(`od-more-sum-${key}`);
        if (el) el.textContent = this._moreSummary(key);
    },

    // ==========================================
    // «ДАННЫЕ ЗАКАЗА И КОНТАКТЫ»
    // ==========================================

    renderInfoTab() {
        const o = this.currentOrder || {};
        const container = document.getElementById('od-tab-info');
        if (!container) return;

        container.innerHTML = `
        <div class="od-detail-grid">
            <div class="odc-fields">
                <h3 class="odc-h3">Заказ</h3>
                ${this._fieldRow('order_name', 'Название', o.order_name, 'text')}
                ${this._fieldRow('client_name', 'Клиент', o.client_name, 'text')}
                ${this._fieldRow('manager_name', 'Менеджер', o.manager_name, 'text')}
                ${this._fieldRowDateRange('deadline_start', 'deadline_end', 'Начало → Дедлайн', o.deadline_start || o.deadline, o.deadline_end)}
            </div>
            <div class="odc-fields">
                <h3 class="odc-h3">Контакты и ссылки</h3>
                ${this._fieldRow('delivery_address', 'Адрес доставки', o.delivery_address, 'text')}
                ${this._fieldRow('telegram', 'Telegram', o.telegram, 'text')}
                ${this._fieldRow('crm_link', 'CRM', o.crm_link, 'url')}
                ${this._fieldRow('fintablo_link', 'Финтабло', o.fintablo_link, 'url')}
            </div>
        </div>`;
        this._setMoreSummary('info');
    },

    // ==========================================
    // ITEMS TAB
    // ==========================================

    renderItemsTab() {
        const container = document.getElementById('od-tab-items');
        if (!container) return;
        this._setMoreSummary('items');
        const products = this.currentItems.filter(i => i.item_type === 'product' || !i.item_type);
        const allHardware = this.currentItems.filter(i => i.item_type === 'hardware');
        const allPackaging = this.currentItems.filter(i => i.item_type === 'packaging');
        const pendantItems = this.currentItems.filter(i => i.item_type === 'pendant');

        // Build pendant HTML (used in both grouped and non-grouped paths)
        let pendantHtml = '';
        pendantItems.forEach(pndItem => {
            let pnd;
            try { pnd = typeof pndItem.item_data === 'string' ? JSON.parse(pndItem.item_data) : pndItem.item_data; } catch(e) { return; }
            if (!pnd) return;
            pendantHtml += this._renderPendantDetail(pnd, pndItem);
        });

        // Separate order-level vs per-item hw/pkg
        const orderHardware = allHardware.filter(i => i.hardware_parent_item_index === null || i.hardware_parent_item_index === undefined);
        const orderPackaging = allPackaging.filter(i => i.packaging_parent_item_index === null || i.packaging_parent_item_index === undefined);

        // Check if items have marketplace_set_name for grouping
        const hasSetNames = [...products, ...orderHardware, ...orderPackaging].some(i => i.marketplace_set_name);

        let html = '';

        if (hasSetNames) {
            // Group all items by marketplace_set_name
            const setGroups = new Map();
            const noSetProducts = [];
            products.forEach((item, idx) => {
                const sn = item.marketplace_set_name || '';
                if (sn) {
                    if (!setGroups.has(sn)) setGroups.set(sn, { products: [], hw: [], pkg: [] });
                    setGroups.get(sn).products.push({ item, idx });
                } else {
                    noSetProducts.push({ item, idx });
                }
            });
            orderHardware.forEach(item => {
                const sn = item.marketplace_set_name || '';
                if (sn) {
                    if (!setGroups.has(sn)) setGroups.set(sn, { products: [], hw: [], pkg: [] });
                    setGroups.get(sn).hw.push(item);
                }
            });
            orderPackaging.forEach(item => {
                const sn = item.marketplace_set_name || '';
                if (sn) {
                    if (!setGroups.has(sn)) setGroups.set(sn, { products: [], hw: [], pkg: [] });
                    setGroups.get(sn).pkg.push(item);
                }
            });

            // Render grouped by set
            for (const [setName, group] of setGroups) {
                const setQty = group.products.reduce((s, p) => s + (parseFloat(p.item.quantity) || 0), 0);
                html += `<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;padding:12px;">`;
                html += `<h3 style="margin:0 0 8px;display:flex;align-items:center;gap:6px;">${this._esc(setName)} <span class="text-muted" style="font-size:14px;font-weight:400;">(${setQty} шт)</span></h3>`;

                if (group.products.length > 0) {
                    html += '<div style="margin-bottom:6px;font-size:14px;font-weight:600;color:var(--odc-text-soft);">Изделия:</div>';
                    group.products.forEach(({ item, idx }) => {
                        html += this._renderItemCard(item, 'product');
                        const itemHw = allHardware.filter(h => h.hardware_parent_item_index === idx);
                        const itemPkg = allPackaging.filter(p => p.packaging_parent_item_index === idx);
                        if (itemHw.length > 0 || itemPkg.length > 0) {
                            html += '<div style="margin-left:16px;border-left:2px solid var(--border);padding-left:12px;margin-bottom:8px">';
                            itemHw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                            itemPkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                            html += '</div>';
                        }
                    });
                }
                if (group.hw.length > 0) {
                    html += '<div style="margin-top:8px;font-size:14px;font-weight:600;color:var(--odc-text-soft);">Фурнитура:</div>';
                    group.hw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                }
                if (group.pkg.length > 0) {
                    html += '<div style="margin-top:8px;font-size:14px;font-weight:600;color:var(--odc-text-soft);">Упаковка:</div>';
                    group.pkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                }
                html += '</div>';
            }

            // Products without set name
            if (noSetProducts.length > 0) {
                html += '<h3 style="margin:12px 0 12px">Прочие изделия</h3>';
                noSetProducts.forEach(({ item, idx }) => {
                    html += this._renderItemCard(item, 'product');
                    const itemHw = allHardware.filter(h => h.hardware_parent_item_index === idx);
                    const itemPkg = allPackaging.filter(p => p.packaging_parent_item_index === idx);
                    if (itemHw.length > 0 || itemPkg.length > 0) {
                        html += '<div style="margin-left:16px;border-left:2px solid var(--border);padding-left:12px;margin-bottom:8px">';
                        itemHw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                        itemPkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                        html += '</div>';
                    }
                });
            }

            // HW/PKG without set name
            const noSetHw = orderHardware.filter(i => !i.marketplace_set_name);
            const noSetPkg = orderPackaging.filter(i => !i.marketplace_set_name);
            if (noSetHw.length > 0) {
                html += '<h3 style="margin:16px 0 12px">Общая фурнитура</h3>';
                html += noSetHw.map(item => this._renderItemCard(item, 'hardware')).join('');
            }
            if (noSetPkg.length > 0) {
                html += '<h3 style="margin:16px 0 12px">Общая упаковка</h3>';
                html += noSetPkg.map(item => this._renderItemCard(item, 'packaging')).join('');
            }

            // Pendant items
            html += pendantHtml;

        } else {
            // Fallback: old display (no set grouping)
            if (products.length > 0) {
                html += '<h3 style="margin:0 0 12px">Изделия</h3>';
                products.forEach((item, idx) => {
                    html += this._renderItemCard(item, 'product');
                    const itemHw = allHardware.filter(h => h.hardware_parent_item_index === idx);
                    const itemPkg = allPackaging.filter(p => p.packaging_parent_item_index === idx);
                    if (itemHw.length > 0 || itemPkg.length > 0) {
                        html += '<div style="margin-left:16px;border-left:2px solid var(--border);padding-left:12px;margin-bottom:8px">';
                        itemHw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                        itemPkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                        html += '</div>';
                    }
                });
            }
            if (orderHardware.length > 0) {
                html += '<h3 style="margin:16px 0 12px">Общая фурнитура</h3>';
                html += orderHardware.map(item => this._renderItemCard(item, 'hardware')).join('');
            }
            if (orderPackaging.length > 0) {
                html += '<h3 style="margin:16px 0 12px">Общая упаковка</h3>';
                html += orderPackaging.map(item => this._renderItemCard(item, 'packaging')).join('');
            }

            // Pendant items
            html += pendantHtml;
        }

        if (!html) {
            html = '<div class="empty-state"><p>Нет позиций. Откройте в калькуляторе для добавления.</p></div>';
        }

        container.innerHTML = html;
    },

    // Склад фурнитуры читается, когда есть Warehouse с нужными функциями.
    _canLoadHardwareRows() {
        return !!(this.currentOrder && this.currentOrder.id)
            && typeof Warehouse !== 'undefined' && !!Warehouse
            && typeof Warehouse._collectWarehouseDemandFromOrderItems === 'function';
    },

    // Фурнитура и упаковка заказа со склада: по строке на позицию склада — план, цель, факт, резерв,
    // свободно и «собрано». Читает склад, резервы и историю; Warehouse.allItems / allReservations
    // обновляются, как раньше в renderHardwareTab. Ошибка чтения — исключение.
    async _buildHardwareRows() {
        const orderId = Number(this.currentOrder && this.currentOrder.id || 0);
        if (!orderId) return [];
        const items = this.currentItems || [];
        await Warehouse._ensureProjectHardwareStateLoaded();
        const [warehouseItems, reservations, history] = await Promise.all([
            loadWarehouseItems(),
            loadWarehouseReservations(),
            loadWarehouseHistory(),
        ]);

        Warehouse.allItems = Array.isArray(warehouseItems) ? warehouseItems : [];
        Warehouse.allReservations = Array.isArray(reservations) ? reservations : [];

        const byItemId = new Map((warehouseItems || []).map(item => [Number(item.id), item]));
        const historyDeltaMap = Warehouse._buildProjectHardwareHistoryDeltaMap(history || []);
        const demandRows = Warehouse._collectWarehouseDemandFromOrderItems(items);
        const activeReservations = reservations || [];

        return demandRows
            .map(row => {
                const itemId = Number(row.warehouse_item_id || 0);
                const whItem = byItemId.get(itemId) || {};
                const plannedQty = round2(Math.max(0, parseFloat(row.qty) || 0));
                const targetQty = Warehouse._buildProjectHardwareTargetQty(orderId, itemId, plannedQty, historyDeltaMap);
                const actualQty = Warehouse._getProjectHardwareDisplayActualQty(orderId, itemId, plannedQty, historyDeltaMap, history || []);
                const ready = Warehouse._computeProjectHardwareReadyState(orderId, itemId, plannedQty, history || [], historyDeltaMap);
                const currentReserveQty = Warehouse._getProjectHardwareReservedQtyForOrderItem(activeReservations, orderId, itemId);
                const totalReservedQty = round2(Warehouse._getActiveReservationsForItem(itemId)
                    .reduce((sum, reservation) => sum + (parseFloat(reservation.qty) || 0), 0));
                const stockQty = round2(parseFloat(whItem.qty || 0) || 0);
                const availableQty = Math.max(0, round2(stockQty - totalReservedQty));
                const reserveHint = ready
                    ? 'Уже собрано'
                    : (Math.abs(currentReserveQty - targetQty) <= 0.000001
                        ? 'Резерв совпадает'
                        : (currentReserveQty < targetQty ? 'Резерв неполный' : 'Резерв скорректирован'));
                return {
                    itemId,
                    itemName: whItem.name || (Array.isArray(row.names) ? row.names.find(Boolean) : '') || 'Позиция со склада',
                    itemSku: whItem.sku || '',
                    itemKind: Warehouse._projectSupplyKindLabel(row.material_type || whItem.category || 'hardware'),
                    plannedQty,
                    targetQty,
                    actualQty,
                    ready,
                    unit: String(whItem.unit || 'шт').trim() || 'шт',
                    stockTruth: this._buildProjectHardwareStockTruth({
                        orderId,
                        itemId,
                        item: whItem,
                        currentReserveQty,
                        totalReservedQty,
                        stockQty,
                        availableQty,
                        reservations: activeReservations,
                        history: history || [],
                    }),
                    currentReserveQty,
                    availableQty,
                    reserveHint,
                };
            })
            .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName), 'ru'));
    },

    // Склад для плитки «Склад», меток в составе и причин вердикта — в фоне, после показа карточки.
    async loadHardwareRows() {
        const order = this.currentOrder;
        if (!order || !this._canLoadHardwareRows()) return null;
        const token = this._honestToken;
        let rows;
        try {
            rows = await this._buildHardwareRows();
        } catch (error) {
            console.warn('OrderDetail.loadHardwareRows failed:', error);
            if (token !== this._honestToken || this.currentOrder !== order) return null;
            this.hardwareState = 'error';
            this._renderHardwareDependents();
            return null;
        }
        if (token !== this._honestToken || this.currentOrder !== order) return null;
        this._setHardwareRows(rows);
        return rows;
    },

    _setHardwareRows(rows) {
        this.hardwareRows = Array.isArray(rows) ? rows : [];
        this.hardwareState = 'ready';
        this._renderHardwareDependents();
    },

    // Склад пришёл: шапка (чего не хватает), плитка «Склад», метки в составе.
    _renderHardwareDependents() {
        this.renderHeader();
        this.renderStats();
        this.renderWhat();
    },

    async renderHardwareTab() {
        const container = document.getElementById('od-tab-hardware');
        if (!container || !this.currentOrder) return;

        const orderId = Number(this.currentOrder.id || 0);
        if (!orderId) {
            container.innerHTML = '<div class="empty-state"><p>Заказ не найден</p></div>';
            return;
        }

        const order = this.currentOrder;
        const token = this._honestToken;
        container.innerHTML = '<p class="odc-muted">Загружаем фурнитуру заказа…</p>';

        let rows;
        try {
            rows = await this._buildHardwareRows();
        } catch (error) {
            console.error('renderHardwareTab error', error);
            container.innerHTML = '<p class="odc-muted">Не удалось загрузить фурнитуру заказа.</p>';
            return;
        }
        // Таблица свежее, чем то, что видят плитка и состав, — они перерисовываются по ней.
        if (token === this._honestToken && this.currentOrder === order) {
            this.hardwareRows = rows;
            this.hardwareState = 'ready';
            this.renderHeader();
            this.renderStats();
            this.renderWhat();
        }

        if (!rows.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>В заказе пока нет складской фурнитуры или упаковки.</p>
                    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                        <button type="button" class="odc-btn" onclick="OrderDetail.openInCalculator()">Открыть в калькуляторе</button>
                        <button type="button" class="odc-btn" onclick="Warehouse.setView('project-hardware'); App.navigate('warehouse')">Открыть фурнитуру для проектов</button>
                    </div>
                </div>
            `;
            return;
        }

        const totalPlanned = round2(rows.reduce((sum, row) => sum + row.plannedQty, 0));
        const totalTarget = round2(rows.reduce((sum, row) => sum + row.targetQty, 0));
        const totalReserved = round2(rows.reduce((sum, row) => sum + row.currentReserveQty, 0));
        const totalReady = rows.filter(row => row.ready).length;

        container.innerHTML = `
            <div class="odc-hw-head">
                <div>
                    <h3 class="odc-h3">Фурнитура и упаковка заказа</h3>
                    <div class="odc-caption">
                        Меняйте здесь фактическое количество и сборку по заказу. Резерв на складе пересчитается автоматически.
                    </div>
                </div>
                <div class="odc-hw-actions">
                    <button type="button" class="odc-btn" onclick="OrderDetail.openInCalculator()">Открыть в калькуляторе</button>
                    <button type="button" class="odc-btn" onclick="Warehouse.setView('project-hardware'); App.navigate('warehouse')">Открыть на складе</button>
                </div>
            </div>
            <div class="odc-hw-totals">
                <span>Позиций: <b>${rows.length}</b></span>
                <span>План: <b>${totalPlanned} шт</b></span>
                <span>Факт / цель: <b>${totalTarget} шт</b></span>
                <span>В резерве: <b>${totalReserved} шт</b></span>
                <span>Собрано: <b>${totalReady} / ${rows.length}</b></span>
            </div>
            <div class="table-wrap">
                <table class="odc-hw-table">
                    <thead>
                        <tr>
                            <th>Комплектующая</th>
                            <th class="text-right">План</th>
                            <th class="text-right">Резерв</th>
                            <th class="text-right">Факт</th>
                            <th class="text-right">Доступно сейчас</th>
                            <th>Собрано</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td>
                                    <div style="font-weight:600;">${this._esc(row.itemName)}</div>
                                    <div class="odc-caption">${this._esc(row.itemKind)}</div>
                                    ${row.itemSku ? `<div class="odc-caption">${this._esc(row.itemSku)}</div>` : ''}
                                    ${this._renderProjectHardwareStockTruth(row.stockTruth, row)}
                                </td>
                                <td class="text-right" style="font-weight:700;">${row.plannedQty}</td>
                                <td class="text-right">
                                    <div style="font-weight:700;">${row.currentReserveQty}</div>
                                    <div class="odc-caption">${this._esc(row.reserveHint)}</div>
                                </td>
                                <td class="text-right">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        class="odc-input odc-input-qty"
                                        aria-label="Факт: ${this._escAttr(row.itemName)}"
                                        value="${row.actualQty === null || row.actualQty === undefined ? '' : row.actualQty}"
                                        placeholder="${row.plannedQty}"
                                        onblur="OrderDetail.setProjectHardwareActualQty(${row.itemId}, this.value)"
                                        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                                    >
                                    <div class="odc-caption">если пусто — по плану</div>
                                </td>
                                <td class="text-right" style="font-weight:700;">${row.availableQty}</td>
                                <td>
                                    <label class="odc-check">
                                        <input type="checkbox" ${row.ready ? 'checked' : ''} onchange="OrderDetail.toggleProjectHardwareReady(${row.itemId}, this.checked)">
                                        <span>собрано</span>
                                    </label>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async setProjectHardwareActualQty(itemId, rawValue) {
        if (!this.currentOrder) return;
        await Warehouse.setProjectHardwareActualQty(this.currentOrder.id, itemId, rawValue);
        const data = await loadOrder(this.currentOrder.id);
        if (data && data.order) {
            this.currentOrder = data.order;
            this.currentItems = data.items || [];
        }
        await this.renderHardwareTab();
    },

    async toggleProjectHardwareReady(itemId, checked) {
        if (!this.currentOrder) return;
        await Warehouse.toggleProjectHardwareReady(this.currentOrder.id, itemId, checked);
        const data = await loadOrder(this.currentOrder.id);
        if (data && data.order) {
            this.currentOrder = data.order;
            this.currentItems = data.items || [];
        }
        await this.renderHardwareTab();
    },

    _formatProjectHardwareQty(value, unitOrItem) {
        if (typeof Warehouse !== 'undefined' && Warehouse && typeof Warehouse._formatWarehouseQtyDisplay === 'function') {
            return Warehouse._formatWarehouseQtyDisplay(value, unitOrItem);
        }
        const parsed = round2(Math.max(0, parseFloat(value || 0) || 0));
        return parsed.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    },

    _buildProjectHardwareHistoryEntryLabel(entry, item) {
        const qty = round2(parseFloat(entry && entry.qty_change || 0) || 0);
        const sign = qty > 0 ? '+' : (qty < 0 ? '−' : '');
        const title = String(entry && (entry.notes || entry.order_name) || '').trim()
            || (String(entry && entry.type || '').trim() || 'движение');
        const dateLabel = (typeof Warehouse !== 'undefined' && Warehouse && typeof Warehouse._formatDateCompact === 'function')
            ? Warehouse._formatDateCompact(entry && entry.created_at)
            : App.formatDate(entry && entry.created_at);
        return `${dateLabel} · ${title} · ${sign}${this._formatProjectHardwareQty(Math.abs(qty), item)} ${String(item && item.unit || 'шт').trim() || 'шт'}`;
    },

    _buildProjectHardwareStockTruth({ orderId, itemId, item, currentReserveQty, totalReservedQty, stockQty, availableQty, reservations, history }) {
        const itemUnit = String(item && item.unit || 'шт').trim() || 'шт';
        const activeReservations = (Array.isArray(reservations) ? reservations : []).filter(reservation =>
            Number(reservation && reservation.item_id || 0) === Number(itemId || 0)
            && String(reservation && reservation.status || '') === 'active'
        );
        const otherReservations = activeReservations.filter(reservation => Number(reservation && reservation.order_id || 0) !== Number(orderId || 0));
        const otherReservedQty = round2(otherReservations.reduce((sum, reservation) => sum + (parseFloat(reservation.qty) || 0), 0));
        const manualReservedQty = round2(otherReservations
            .filter(reservation => Warehouse._isManualReservationRecord(reservation))
            .reduce((sum, reservation) => sum + (parseFloat(reservation.qty) || 0), 0));
        const itemHistory = (Array.isArray(history) ? history : [])
            .filter(entry => Number(entry && entry.item_id || 0) === Number(itemId || 0))
            .sort((a, b) => {
                const byDate = new Date(String(b && b.created_at || '')).getTime() - new Date(String(a && a.created_at || '')).getTime();
                if (byDate !== 0) return byDate;
                return Number(b && b.id || 0) - Number(a && a.id || 0);
            });
        const correctionEntries = itemHistory.filter(entry => Warehouse._isStockCorrectionHistoryEntry(entry));
        const correctionNet = round2(correctionEntries.reduce((sum, entry) => sum + (parseFloat(entry.qty_change) || 0), 0));
        const correctionSign = correctionNet > 0 ? '+' : (correctionNet < 0 ? '−' : '');
        const recentEntries = itemHistory.slice(0, 3).map(entry => this._buildProjectHardwareHistoryEntryLabel(entry, item));
        const otherReservationLabels = otherReservations.slice(0, 3).map(reservation => {
            const meta = Warehouse._getReservationDisplayMeta(reservation);
            return `${meta.primaryLabel} ${this._formatProjectHardwareQty(meta.qty, item)} ${itemUnit}`;
        });

        return {
            itemUnit,
            stockQty: round2(stockQty),
            totalReservedQty: round2(totalReservedQty),
            currentReserveQty: round2(currentReserveQty),
            otherReservedQty,
            manualReservedQty,
            availableQty: round2(availableQty),
            correctionEntriesCount: correctionEntries.length,
            correctionNet,
            correctionSign,
            otherReservationLabels,
            hasMoreOtherReservations: otherReservations.length > otherReservationLabels.length,
            recentEntries,
        };
    },

    _renderProjectHardwareStockTruth(truth, row) {
        if (!truth) return '';
        const unit = String(truth.itemUnit || row.unit || 'шт').trim() || 'шт';
        const summaryBits = [
            `На складе ${this._formatProjectHardwareQty(truth.stockQty, row)} ${unit}`,
            `резерв всего ${this._formatProjectHardwareQty(truth.totalReservedQty, row)} ${unit}`,
            `свободно ${this._formatProjectHardwareQty(truth.availableQty, row)} ${unit}`,
        ];
        if (truth.correctionEntriesCount > 0) {
            summaryBits.push(`корр. ${truth.correctionSign}${this._formatProjectHardwareQty(Math.abs(truth.correctionNet), row)} ${unit}`);
        }

        const detailLines = [];
        if (truth.currentReserveQty > 0) {
            detailLines.push(`Этот заказ держит ${this._formatProjectHardwareQty(truth.currentReserveQty, row)} ${unit}.`);
        }
        if (truth.otherReservationLabels.length > 0) {
            detailLines.push(`Другие резервы: ${truth.otherReservationLabels.map(label => this._esc(label)).join('; ')}${truth.hasMoreOtherReservations ? ' …' : ''}.`);
        } else if (truth.manualReservedQty > 0) {
            detailLines.push(`Есть ручной резерв ${this._formatProjectHardwareQty(truth.manualReservedQty, row)} ${unit}.`);
        } else {
            detailLines.push('Других активных резервов сейчас нет.');
        }
        if (truth.recentEntries.length > 0) {
            detailLines.push(`Последние движения: ${truth.recentEntries.map(line => this._esc(line)).join('; ')}.`);
        }

        return `
            <div class="od-hardware-truth">
                <div class="od-hardware-truth-summary">${summaryBits.map(bit => this._esc(bit)).join(' · ')}</div>
                <details class="od-hardware-truth-details">
                    <summary>Почему такой остаток</summary>
                    <div class="od-hardware-truth-details-body">
                        ${detailLines.map(line => `<div>${line}</div>`).join('')}
                    </div>
                </details>
            </div>
        `;
    },

    _renderPendantDetail(pnd, dbItem) {
        const qty = pnd.quantity || 0;
        const elements = pnd.elements || [];
        const elemPrice = pnd.element_price_per_unit || 0;
        const getAttachmentAllocatedQty = (entry) => {
            if (typeof getPendantAttachmentAllocatedQty === 'function') {
                return getPendantAttachmentAllocatedQty(pnd, entry);
            }
            const allocatedQty = parseFloat(entry?.allocated_qty);
            if (Number.isFinite(allocatedQty) && allocatedQty >= 0) return allocatedQty;
            return qty > 0 ? qty : 0;
        };
        const normalizeAttachments = (type) => {
            const collectionKey = type === 'cord' ? 'cords' : 'carabiners';
            const legacyKey = type === 'cord' ? 'cord' : 'carabiner';
            const fallbackLengthCm = type === 'cord' ? (parseFloat(pnd.cord_length_cm) || 0) : 0;
            let entries = Array.isArray(pnd[collectionKey]) ? pnd[collectionKey] : [];
            if ((!entries || entries.length === 0) && pnd[legacyKey]) {
                entries = [pnd[legacyKey]];
            }
            return (entries || [])
                .map((entry, index) => {
                    const normalized = { ...(entry || {}) };
                    const qtyPerPendant = parseFloat(normalized.qty_per_pendant);
                    const lengthCm = parseFloat(normalized.length_cm);
                    const allocatedQty = parseFloat(normalized.allocated_qty);
                    const hasExplicitAllocatedQty = normalized.allocated_qty !== undefined && normalized.allocated_qty !== null && normalized.allocated_qty !== '';
                    normalized.qty_per_pendant = qtyPerPendant > 0 ? qtyPerPendant : 1;
                    normalized.length_cm = Number.isFinite(lengthCm) ? lengthCm : (type === 'cord' && index === 0 ? fallbackLengthCm : 0);
                    normalized.unit = normalized.unit || 'шт';
                    normalized.allocated_qty = Number.isFinite(allocatedQty)
                        ? Math.max(0, Math.round(allocatedQty))
                        : ((
                            normalized.name
                            || normalized.warehouse_item_id
                            || normalized.warehouse_sku
                            || (parseFloat(normalized.price_per_unit) || 0) > 0
                            || (parseFloat(normalized.delivery_price) || 0) > 0
                            || (parseFloat(normalized.sell_price) || 0) > 0
                            || normalized.source === 'custom'
                        ) && !hasExplicitAllocatedQty && qty > 0 ? qty : 0);
                    return normalized;
                })
                .filter(entry => entry && (
                    entry.name
                    || entry.warehouse_item_id
                    || entry.warehouse_sku
                    || (parseFloat(entry.price_per_unit) || 0) > 0
                    || (parseFloat(entry.delivery_price) || 0) > 0
                    || (parseFloat(entry.sell_price) || 0) > 0
                    || entry.source === 'custom'
                ));
        };
        const attachmentCostPerPendant = (type, entry) => {
            if (type === 'cord' && (entry.unit === 'м' || entry.unit === 'см')) {
                const metricFactor = typeof getPendantMetricRateFactor === 'function'
                    ? getPendantMetricRateFactor(entry)
                    : ((entry.unit === 'см') ? (parseFloat(entry.length_cm) || 0) : ((parseFloat(entry.length_cm) || 0) / 100));
                return round2(((entry.price_per_unit || 0) * metricFactor) + (entry.delivery_price || 0));
            }
            return round2(((entry.price_per_unit || 0) + (entry.delivery_price || 0)) * (entry.qty_per_pendant || 1));
        };
        const cords = normalizeAttachments('cord');
        const carabiners = normalizeAttachments('carabiner');

        // Group elements by color
        const groups = {};
        elements.forEach(el => {
            const key = el.color || 'без цвета';
            if (!groups[key]) groups[key] = [];
            groups[key].push(el);
        });

        let rows = '';
        cords.forEach(cord => {
            const isMetric = cord.unit === 'м' || cord.unit === 'см';
            const allocatedQty = getAttachmentAllocatedQty(cord);
            const totalQtyLabel = isMetric
                ? `${round2((cord.length_cm || 0) * allocatedQty / 100)} м${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}`
                : `${round2(allocatedQty * (cord.qty_per_pendant || 1))} шт${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}`;
            const titleSuffix = isMetric && cord.length_cm > 0 ? ` (${cord.length_cm} см/подвес)` : ((cord.qty_per_pendant || 1) > 1 ? ` × ${cord.qty_per_pendant}` : '');
            const pricePerPendant = attachmentCostPerPendant('cord', cord);
            rows += `<tr><td style="padding-left:24px;">${this._esc(cord.name || 'Шнур')}${titleSuffix}</td><td>${totalQtyLabel}</td><td>${formatRub(pricePerPendant)}</td><td>${formatRub(allocatedQty * pricePerPendant)}</td></tr>`;
        });
        carabiners.forEach(carabiner => {
            const allocatedQty = getAttachmentAllocatedQty(carabiner);
            const titleSuffix = (carabiner.qty_per_pendant || 1) > 1 ? ` × ${carabiner.qty_per_pendant}` : '';
            const pricePerPendant = attachmentCostPerPendant('carabiner', carabiner);
            rows += `<tr><td style="padding-left:24px;">${this._esc(carabiner.name || 'Фурнитура')}${titleSuffix}</td><td>${round2(allocatedQty * (carabiner.qty_per_pendant || 1))} шт${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}</td><td>${formatRub(pricePerPendant)}</td><td>${formatRub(allocatedQty * pricePerPendant)}</td></tr>`;
        });
        // Element groups by color
        Object.entries(groups).forEach(([color, els]) => {
            const chars = els.map(e => e.char).join(', ');
            const groupQty = els.length * qty;
            rows += `<tr><td style="padding-left:24px;">${this._esc(chars)} (${this._esc(color)})</td><td>${groupQty}</td><td>${formatRub(elemPrice)}</td><td>${formatRub(groupQty * elemPrice)}</td></tr>`;
        });
        // Print items
        elements.filter(el => el.has_print).forEach(el => {
            rows += `<tr><td style="padding-left:24px;">Печать на ${this._esc(el.char)}</td><td>${qty}</td><td>${formatRub(el.print_price)}</td><td>${formatRub(qty * (el.print_price || 0))}</td></tr>`;
        });
        // Packaging
        if (pnd.packaging?.name) {
            rows += `<tr><td style="padding-left:24px;">${this._esc(pnd.packaging.name)}</td><td>${qty}</td><td>${formatRub(pnd.packaging.price_per_unit)}</td><td>${formatRub(qty * (pnd.packaging.price_per_unit || 0))}</td></tr>`;
        }

        const sellPrice = dbItem.sell_price_item || 0;
        const totalRevenue = sellPrice * qty;

        return `
            <div class="card" style="border-left:3px solid var(--accent);margin-bottom:12px;">
                <div class="card-header">
                    <h3 style="margin:0;">Подвес "${this._esc(pnd.name)}" × ${qty} шт</h3>
                    <span style="font-size:14px;font-weight:700;">${formatRub(totalRevenue)}</span>
                </div>
                <table style="width:100%;font-size:14px;border-collapse:collapse;padding:8px 16px;">
                    <tr style="color:var(--text-muted);font-size:14px;"><td>Позиция</td><td>Кол-во</td><td>Цена/шт</td><td>Итого</td></tr>
                    ${rows}
                </table>
            </div>
        `;
    },

    _renderItemCard(item, type) {
        const name = item.product_name || '—';
        const qty = item.quantity || 0;
        let costPerUnit = 0;
        let sellPrice = 0;

        if (type === 'product') {
            costPerUnit = item.cost_total || 0;
            sellPrice = item.sell_price_item || 0;
        } else if (type === 'hardware') {
            costPerUnit = item.cost_total || 0;
            sellPrice = item.sell_price_hardware || 0;
        } else if (type === 'packaging') {
            costPerUnit = item.cost_total || 0;
            sellPrice = item.sell_price_packaging || 0;
        }

        const revenue = sellPrice * qty;
        const cost = costPerUnit * qty;
        const margin = revenue > 0 ? ((revenue - cost) / revenue * 100) : 0;
        const productMeta = type === 'product' ? this._renderProductMeta(item) : '';

        return `
        <div class="od-item-card">
            <div class="od-item-header">
                <b>${this._esc(name)}</b>
                <span class="text-muted">${qty} шт</span>
            </div>
            <div class="form-row" style="margin:0;gap:24px;font-size:14px;">
                <div><span class="text-muted">Себестоимость:</span> ${formatRub(costPerUnit)}/шт</div>
                <div><span class="text-muted">Продажа:</span> ${formatRub(sellPrice)}/шт</div>
                <div><span class="text-muted">Выручка:</span> ${formatRub(revenue)}</div>
                <div><span class="text-muted">Маржа:</span> <span class="${margin >= 30 ? 'text-green' : 'text-red'}">${margin.toFixed(1)}%</span></div>
            </div>
            ${productMeta}
        </div>`;
    },

    _renderProductMeta(item) {
        const colors = this._normalizeProductColors(item);
        const attachments = this._normalizeColorAttachments(item);
        const sections = [];

        if (colors.length > 0) {
            sections.push(`
                <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                    <span class="text-muted" style="min-width:62px;">Цвета:</span>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${colors.map(color => `<span class="badge badge-blue">${this._esc(color.name || color.number || `#${color.id || '—'}`)}</span>`).join('')}
                    </div>
                </div>
            `);
        }

        if (attachments.length > 0) {
            const linkHtml = attachments.map(attachment => {
                const label = this._esc(attachment.name || 'Файл цветового решения');
                return attachment.data_url
                    ? `<a href="${this._escAttr(attachment.data_url)}" download="${this._escAttr(attachment.name || 'color-solution')}" class="od-url-link">${label}</a>`
                    : label;
            }).join('<br>');
            sections.push(`
                <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                    <span class="text-muted" style="min-width:62px;">${attachments.length > 1 ? 'Файлы:' : 'Файл:'}</span>
                    <span>${linkHtml}</span>
                </div>
            `);
        }

        if (sections.length === 0) return '';

        return `
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;font-size:14px;">
                ${sections.join('')}
            </div>
        `;
    },

    _normalizeProductColors(item) {
        let colors = item?.colors;
        if (typeof colors === 'string') {
            try {
                colors = JSON.parse(colors);
            } catch (e) {
                colors = [];
            }
        }
        if (!Array.isArray(colors)) colors = [];
        colors = colors.filter(color => color && typeof color === 'object');
        if (colors.length > 0) return colors;

        if (item?.color_name) {
            return [{
                id: item.color_id || null,
                name: item.color_name,
            }];
        }

        if (item?.color_id) {
            return [{
                id: item.color_id,
                name: `#${item.color_id}`,
            }];
        }

        return [];
    },

    _normalizeColorAttachments(item) {
        return normalizeColorAttachments(item);
    },

    // ==========================================
    // TASKS TAB (v33: linked tasks)
    // ==========================================

    async renderTasksTab() {
        const order = this.currentOrder;
        if (!order) return;
        const token = this._honestToken;
        const orderId = order.id;
        let bundle;
        try {
            bundle = await loadWorkBundle();
        } catch (error) {
            console.warn('OrderDetail.renderTasksTab failed:', error);
            if (token !== this._honestToken || this.currentOrder !== order) return;
            this._setHtml('od-tab-tasks', '<p class="odc-muted">Задачи не загрузились. Обновите страницу.</p>');
            return;
        }
        // Пока задачи читались, открыли другую карточку.
        if (token !== this._honestToken || this.currentOrder !== order) return;
        const container = document.getElementById('od-tab-tasks');
        if (!container) return;
        bundle = bundle || {};
        const projects = (bundle.projects || []).filter(project => String(project.linked_order_id || '') === String(orderId));
        const projectIds = new Set(projects.map(project => String(project.id)));
        const tasks = (bundle.tasks || []).filter(task =>
            String(task.order_id || '') === String(orderId)
            || projectIds.has(String(task.project_id || ''))
        );

        const projectCards = projects.length === 0
            ? '<div class="text-muted" style="font-size:14px;">Связанных проектов пока нет</div>'
            : projects.map(project => {
                const projectTasks = tasks.filter(task => String(task.project_id || '') === String(project.id));
                return `
                    <button class="od-project-card" onclick="App.navigate('projects', true, ${project.id})">
                        <div style="font-weight:700">${this._esc(project.title)}</div>
                        <div class="text-muted" style="font-size:14px">${this._esc(project.type || 'Другое')} · ${this._esc(WorkManagementCore.getProjectStatusLabel(project.status))}</div>
                        <div class="text-muted" style="font-size:14px">Задач: ${projectTasks.length} · Владелец: ${this._esc(project.owner_name || '—')}</div>
                    </button>
                `;
            }).join('');

        const taskRows = tasks.map(task => {
            const project = task.project_id ? projects.find(item => String(item.id) === String(task.project_id)) : null;
            return `
                <tr onclick="App.navigate('tasks', true, ${task.id})" style="cursor:pointer">
                    <td>
                        <div style="font-weight:600">${this._esc(task.title)}</div>
                        <div class="text-muted" style="font-size:14px">${this._esc(project ? `Проект: ${project.title}` : 'Прямая задача заказа')}</div>
                    </td>
                    <td><span class="badge">${this._esc(WorkManagementCore.getTaskStatusLabel(task.status))}</span></td>
                    <td style="font-size:14px">${this._esc(task.assignee_name || '—')}</td>
                    <td style="font-size:14px" class="${WorkManagementCore.isTaskOverdue(task) ? 'text-red' : ''}">${this._esc(task.due_date ? App.formatDate(task.due_date) + (task.due_time ? ' ' + task.due_time : '') : '—')}</td>
                </tr>
            `;
        }).join('');

        const inProgress = tasks.filter(task => task.status === 'in_progress').length;
        const done = tasks.filter(task => task.status === 'done').length;
        const total = tasks.length;
        this.moreCounts = { ...this.moreCounts, tasks: total };
        this._setMoreSummary('tasks');

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap;">
                <div style="font-size:14px;color:var(--text-muted)">
                    Всего задач: <b>${total}</b> &nbsp;|&nbsp; В работе: <b>${inProgress}</b> &nbsp;|&nbsp; Готово: <b>${done}</b> &nbsp;|&nbsp; Проектов: <b>${projects.length}</b>
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-sm btn-outline" onclick="Projects.openCreate({ linked_order_id: ${orderId} })">+ Проект</button>
                    <button class="btn btn-sm btn-success" onclick="Tasks.openCreate({ order_id: ${orderId}, primary_context_kind: 'order' })">+ Задача</button>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h3>Связанные проекты</h3></div>
                <div class="od-project-grid">${projectCards}</div>
            </div>

            ${tasks.length === 0
                ? `<div class="card"><div class="empty-state">
                        <p>В этом заказе пока нет задач</p>
                        <button class="btn btn-sm btn-outline" onclick="Tasks.openCreate({ order_id: ${orderId}, primary_context_kind: 'order' })">Создать первую задачу</button>
                   </div></div>`
                : `<div class="card" style="padding:0"><div class="table-wrap"><table>
                    <thead><tr>
                        <th>Задача</th>
                        <th>Статус</th>
                        <th>Ответственный</th>
                        <th>Дедлайн</th>
                    </tr></thead>
                    <tbody>${taskRows}</tbody>
                   </table></div></div>`
            }`;
    },

    // ==========================================
    // CHINA TAB
    // ==========================================

    async renderChinaTab() {
        const order = this.currentOrder;
        if (!order) return;
        const token = this._honestToken;
        const orderId = order.id;
        const stale = () => token !== this._honestToken || this.currentOrder !== order;
        try {
            const purchases = await loadChinaPurchases({ order_id: orderId });
            if (stale()) return;
            const container = document.getElementById('od-tab-china');
            if (!container) return;
            this.moreCounts = { ...this.moreCounts, china: Array.isArray(purchases) ? purchases.length : 0 };
            this._setMoreSummary('china');

            const addBtn = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
                <button class="btn btn-sm btn-success" onclick="App.navigate('china', true); setTimeout(() => { if(typeof ChinaPurchases!=='undefined') { ChinaPurchases.openNewForm(${orderId}); }}, 200);">+ Создать закупку для этого заказа</button>
            </div>`;

            if (!purchases || purchases.length === 0) {
                container.innerHTML = `
                    ${addBtn}
                    <div class="card">
                        <div class="empty-state">
                            <p>Нет привязанных закупок из Китая</p>
                        </div>
                    </div>`;
                return;
            }
            container.innerHTML = `
                ${addBtn}
                <div class="card" style="padding:0">
                    <div class="table-wrap">
                        <table>
                            <thead><tr>
                                <th>Закупка</th>
                                <th>Поставщик</th>
                                <th>Статус</th>
                                <th>Сумма CNY</th>
                                <th>Трек</th>
                            </tr></thead>
                            <tbody>
                                ${purchases.map(p => {
                                    const st = (typeof ChinaPurchases !== 'undefined' && ChinaPurchases.STATUSES)
                                        ? ChinaPurchases.STATUSES.find(s => s.key === p.status)
                                        : null;
                                    return `<tr style="cursor:pointer" onclick="App.navigate('china', true); setTimeout(() => { if(typeof ChinaPurchases!=='undefined') { ChinaPurchases.openDetail(${p.id}); } }, 250);">
                                        <td><b>${this._esc(p.purchase_name || '')}</b></td>
                                        <td>${this._esc(p.supplier_name || '')}</td>
                                        <td>${st ? '<span class="badge badge-' + st.color + '">' + this._esc(st.label) + '</span>' : this._esc(p.status || '')}</td>
                                        <td class="text-right">${(p.total_cny || 0).toFixed(2)}</td>
                                        <td>${this._esc(p.tracking_number || '')}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        } catch (e) {
            console.warn('OrderDetail.renderChinaTab failed:', e);
            if (stale()) return;
            this._setHtml('od-tab-china', '<p class="odc-muted">Ошибка загрузки закупок</p>');
        }
    },

    // ==========================================
    // ACTIONS
    // ==========================================

    // Смена этапа без системных окон. Без аргумента — раскрывает список этапов в меню «⋯». С этапом —
    // те же проверки, что у списка заказов (Orders._ensureStatusTransitionAllowed), запись,
    // завершение перехода (склад, готовая продукция, история) от имени того, кто вошёл.
    async changeStatus(targetStatus) {
        const order = this.currentOrder;
        if (!order) return;
        if (!targetStatus) {
            this.showMenu('stages');
            return;
        }
        const newStatus = String(targetStatus);
        if (newStatus === 'deleted' || this.statusBusy) return;
        if (newStatus === order.status) {
            this.closeMenu();
            return;
        }
        const oldStatus = order.status;
        this.statusBusy = true;
        this.menuOpen = false;
        this.menuView = 'main';
        this.renderHeader();
        this.renderStages();
        try {
            if (typeof Orders !== 'undefined' && Orders && typeof Orders._ensureStatusTransitionAllowed === 'function') {
                const guard = await Orders._ensureStatusTransitionAllowed(order.id, newStatus, { oldStatus });
                // Нельзя — Orders уже сказал почему.
                if (!guard || !guard.ok) return;
            }
            try {
                await updateOrderStatus(order.id, newStatus);
            } catch (error) {
                console.error('OrderDetail.changeStatus updateOrderStatus failed:', error);
                App.toast('Не удалось сохранить статус. Обновите страницу и попробуйте ещё раз.');
                return;
            }

            // Запись удалась — карточка показывает новый этап сразу, до медленной работы со складом.
            order.status = newStatus;
            this.statusBusy = false;
            if (this.currentOrder === order) this._renderAfterStatusChange();
            App.toast(`Статус сохранён: ${App.statusLabel(newStatus)}`);

            const managerName = (typeof App.getCurrentEmployeeName === 'function' && App.getCurrentEmployeeName()) || 'Неизвестный';
            if (typeof Orders !== 'undefined' && Orders && typeof Orders._finishStatusTransition === 'function') {
                await Orders._finishStatusTransition(order.id, order, oldStatus, newStatus, managerName);
            }
            // «Готово» ставит штуки «на продажу» на склад готовой продукции (или снимает их при
            // возврате) — блок «Тираж» показывает, что там теперь.
            if (this.currentOrder === order) await this.loadTirageStock();
        } finally {
            if (this.statusBusy) {
                this.statusBusy = false;
                if (this.currentOrder === order) {
                    this.renderHeader();
                    this.renderStages();
                }
            }
        }
    },

    // Этап сменился: шапка, этапы, плитки и «Как идёт».
    _renderAfterStatusChange() {
        this.renderHeader();
        this.renderStages();
        this.renderStats();
        this.renderWhat();
        this.renderProgress();
    },

    openInCalculator() {
        if (this.currentOrder) {
            Calculator.loadOrder(this.currentOrder.id);
        }
    },

    cloneOrder() {
        this.closeMenu();
        if (this.currentOrder) {
            Orders.cloneOrder(this.currentOrder.id);
        }
    },

    // ==========================================
    // INLINE EDIT HELPERS
    // ==========================================

    // Запись поля заказа. Не записалось — тост, и введённое не пропадает (это решает тот, кто
    // позвал: поле остаётся открытым, ТЗ — в поле). true — сохранено.
    async saveField(field, value) {
        const order = this.currentOrder;
        if (!order || !order.id) return false;
        try {
            await updateOrderFields(order.id, { [field]: value });
        } catch (error) {
            console.error('OrderDetail.saveField failed:', field, error);
            App.toast('Не сохранилось — проверьте связь и повторите');
            return false;
        }
        order[field] = value;
        if (this.currentOrder === order) this._renderAfterFieldSave(field);
        App.toast('Сохранено');
        return true;
    },

    // Перерисовать то, что показывает поле.
    _renderAfterFieldSave(field) {
        const headFields = ['order_name', 'client_name', 'manager_name', 'deadline_start', 'deadline_end', 'notes', 'payment_status'];
        const summaryFields = ['client_name', 'deadline_start', 'deadline_end', 'payment_status'];
        if (headFields.includes(field)) this.renderHeader();
        if (summaryFields.includes(field)) {
            this.renderStats();
            this.renderStages();
            this.renderProgress();
            if (this.openPanel === 'payment' || this.openPanel === 'money') this.renderPanel();
        }
        if (field !== 'notes' && field !== 'payment_status') this.renderInfoTab();
    },

    startEdit(field, currentValue, inputType) {
        const cell = document.getElementById('od-val-' + field);
        if (!cell) return;
        // Щелчок по уже открытому полю всплывает до строки — поле не пересоздаётся (и не теряет текст).
        if (typeof cell.querySelector === 'function' && cell.querySelector('.od-inline-input')) return;
        this._editing = { field, inputType: inputType || 'text', kind: 'text' };
        if (cell.classList) cell.classList.add('od-editing');

        if (inputType === 'textarea') {
            cell.innerHTML = `<textarea class="od-inline-input odc-input" onblur="OrderDetail.finishEdit('${field}', this.value)" style="width:100%;min-height:88px;resize:vertical;">${this._esc(currentValue || '')}</textarea>`;
        } else {
            cell.innerHTML = `<input class="od-inline-input odc-input" type="${inputType === 'url' ? 'url' : 'text'}" value="${this._escAttr(currentValue || '')}" onblur="OrderDetail.finishEdit('${field}', this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" style="width:100%;">`;
        }
        const input = typeof cell.querySelector === 'function' ? cell.querySelector('.od-inline-input') : null;
        if (input && typeof input.focus === 'function') input.focus();
    },

    async finishEdit(field, value) {
        if (!this.currentOrder) return false;
        const trimmed = String(value ?? '').trim();
        const editing = this._editing && this._editing.field === field ? this._editing : null;
        if (trimmed === String(this.currentOrder[field] ?? '').trim()) {
            this._editing = null;
            this.renderInfoTab();
            return true;
        }
        this._savingFields = this._savingFields || {};
        if (this._savingFields[field]) return false;
        this._savingFields[field] = true;
        let saved = false;
        try {
            saved = await this.saveField(field, trimmed);
        } finally {
            this._savingFields[field] = false;
        }
        if (saved) {
            this._editing = null;
        } else if (editing && editing.kind === 'date') {
            // Не записалось — поле снова открыто с тем, что ввели.
            this.startEditDate(field, trimmed);
        } else {
            this.startEdit(field, trimmed, editing ? editing.inputType : 'text');
        }
        return saved;
    },

    startEditDate(field, currentValue) {
        const cell = document.getElementById('od-val-' + field);
        if (!cell) return;
        if (typeof cell.querySelector === 'function' && cell.querySelector('input')) return;
        this._editing = { field, inputType: 'date', kind: 'date' };
        cell.innerHTML = `<input type="date" class="odc-input" value="${this._escAttr(currentValue || '')}" onblur="OrderDetail.finishEdit('${field}', this.value)" onchange="OrderDetail.finishEdit('${field}', this.value)">`;
        const input = typeof cell.querySelector === 'function' ? cell.querySelector('input') : null;
        if (input && typeof input.focus === 'function') input.focus();
    },

    onCheckboxChange(field, checked) {
        this.saveField(field, checked);
    },

    // ==========================================
    // FIELD RENDERERS
    // ==========================================

    // Строка поля, которое правится щелчком. Значение уходит в startEdit через data-value: в
    // атрибут onclick пользовательский текст не попадает (кавычки в нём его не обрывают).
    _fieldRow(field, label, value, inputType) {
        let displayValue = '';
        if (inputType === 'url' && value) {
            const shortUrl = value.length > 50 ? value.substring(0, 50) + '...' : value;
            displayValue = `<a href="${this._escAttr(value)}" target="_blank" rel="noopener" class="od-url-link" onclick="event.stopPropagation()">${this._esc(shortUrl)}</a>`;
        } else {
            displayValue = this._esc(value || '') || '<span class="text-muted">—</span>';
        }

        return `
        <div class="od-field-row" role="button" tabindex="0" data-value="${this._escAttr(value || '')}"
            onclick="OrderDetail.startEdit('${field}', this.dataset.value, '${inputType}')"
            onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();OrderDetail.startEdit('${field}', this.dataset.value, '${inputType}');}"
            title="Нажмите для редактирования">
            <div class="od-field-label">${this._esc(label)}</div>
            <div class="od-field-value" id="od-val-${field}">${displayValue}</div>
        </div>`;
    },

    _fieldRowDateRange(fieldStart, fieldEnd, label, valueStart, valueEnd) {
        const fmtStart = valueStart ? this._esc(App.formatDate(valueStart)) : '—';
        const fmtEnd = valueEnd ? this._esc(App.formatDate(valueEnd)) : '';
        const dateButton = (field, value, shown) => `
                <span class="odc-date-btn" role="button" tabindex="0" id="od-val-${field}" data-value="${this._escAttr(value || '')}"
                    onclick="OrderDetail.startEditDate('${field}', this.dataset.value)"
                    onkeydown="if(event.target===this&&event.key==='Enter'){event.preventDefault();OrderDetail.startEditDate('${field}', this.dataset.value);}"
                    title="Нажмите для изменения">${shown}</span>`;

        return `
        <div class="od-field-row">
            <div class="od-field-label">${this._esc(label)}</div>
            <div class="od-field-value od-field-dates">
                ${dateButton(fieldStart, valueStart, fmtStart)}
                <span aria-hidden="true">→</span>
                ${dateButton(fieldEnd, valueEnd, fmtEnd || '<span class="text-muted">—</span>')}
            </div>
        </div>`;
    },

    _fieldRowCheckbox(field, label, checked) {
        return `
        <div class="od-field-row">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="OrderDetail.onCheckboxChange('${field}', this.checked)" style="width:18px;height:18px;cursor:pointer;">
            </div>
        </div>`;
    },

    // ==========================================
    // UTILS
    // ==========================================

    _esc(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _escAttr(str) {
        if (!str && str !== 0) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
};
