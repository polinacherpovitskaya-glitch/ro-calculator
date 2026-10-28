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
    // Час цеха, когда зарплата этапа неизвестна, ₽ (ставка по плану), и полный час цеха с
    // косвенными, ₽ — им сортируются причины без рублей (их рубли видит только администратор).
    FALLBACK_SALARY_PER_HOUR: 550,
    HOUR_COST_FOR_SORT: 4772,
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

        if (overdue) red.push(`Срок прошёл ${L.formatDayMonth(input.deadlineEnd)}.`);
        if (hoursRed) red.push(hoursText);
        if (!overdue && daysLeft !== null && daysLeft <= 3 && L.BEFORE_PACKAGING.includes(status)) {
            yellow.push(`До срока ${daysLeft} дн., а заказ ещё на этапе «${stageLabel}».`);
        }
        if (hoursYellow) yellow.push(hoursText);
        if (shortage.length) yellow.push(`На складе не хватает: ${shortage.join(', ')}.`);
        if (input.timesheetStageLabel) yellow.push(`По табелю уже идёт «${input.timesheetStageLabel}», а в статусе — «${stageLabel}».`);
        if (input.notesEmpty) yellow.push('Нет ТЗ для цеха.');
        if (L._num(input.clientQty) > 0 && (!paymentStatus || paymentStatus === 'not_sent')) yellow.push('Счёт клиенту не выставлен.');
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
        const unpaid = L._num(input.clientQty) > 0 && !L.PAID_STATUSES.includes(paymentStatus);
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
                    weight: canSeeSalary ? Math.abs(rub) : Math.abs(deltaHours) * L.HOUR_COST_FOR_SORT,
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

const OrderDetail = {
    currentOrder: null,
    currentItems: [],
    currentFinancial: null,
    currentTab: 'info',
    deliveryScheduleDraft: [],
    // Честная шапка: реальная себестоимость заказа из «Факта» и склад его штук «на продажу».
    // Приходят после показа карточки (см. _beginHonestNumbers). realCostState: 'none' — не нужна
    // или не пришла, 'loading' — ждём «Факт», 'ready' — ответ в currentRealCost.
    currentRealCost: null,
    realCostState: 'none',
    realCostDetailsOpen: false,
    tirageStock: null,
    tirageRecalcBusy: false,

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
        this.currentFinancial = this.buildLiveFinancialMeta();
        this.currentTab = 'info';

        this.renderHeader();
        this.renderStats();
        this.renderInfoTab();
        // Реальная себестоимость и склад приходят позже и дорисовываются сами: карточка их не ждёт.
        void this.loadRealCost();
        void this.loadTirageStock();
        this.renderProductionTab();
        this.renderFilesTab();
        this.renderItemsTab();
        await this.renderHardwareTab();
        await this.renderTasksTab();
        this.renderChinaTab();

        // Show first tab
        this.switchTab('info');
        if (data.repaired_duplicates) {
            App.toast('Дубли позиций в заказе были автоматически исправлены');
        }
    },

    // ==========================================
    // TABS
    // ==========================================

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.od-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        document.querySelectorAll('.od-tab-content').forEach(c => {
            c.style.display = c.id === 'od-tab-' + tab ? '' : 'none';
        });
        if (tab === 'hardware') {
            void this.renderHardwareTab();
        }
    },

    // ==========================================
    // HEADER
    // ==========================================

    renderHeader() {
        const o = this.currentOrder;
        document.getElementById('od-title').textContent = o.order_name || 'Без названия';

        const st = STATUS_OPTIONS.find(s => s.value === o.status);
        const badge = document.getElementById('od-status-badge');
        badge.textContent = st ? st.label : o.status;
        badge.className = 'badge badge-' + this._statusColor(o.status);
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
        const o = this.currentOrder;
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

        // Крупная цифра в карточке и списке — живой пересчёт по текущим
        // параметрам. Историческую маржу при продаже сохраняем подписью, когда
        // она отличается, чтобы финансовый контекст заказа не терялся.
        const storedMarginPct = Number(o.margin_percent_plan ?? o.margin_percent ?? 0);
        const marginNote = !isNonCommercial && (storedMarginPct && Math.abs(storedMarginPct - marginPercent) >= 1)
            ? `<div class="text-muted" style="font-size:11px;margin-top:2px;" title="Зафиксировано при сохранении заказа — по ценам и ставкам того дня. Крупная цифра — пересчёт по сегодняшним параметрам.">при продаже: ${formatPercent(storedMarginPct)}</div>`
            : '';

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

        const revenueCaption = stockQty > 0
            ? this._caption(`ожидаем, если продадим ${this._formatQuantity(stockQty)} шт.`)
            : '';
        // Подпись говорит, чья это цифра: пока «Факт» не ответил (или табеля нет) маржа плановая.
        let marginCaption = '';
        if (honest) {
            if (!hasRealMargin) marginCaption = this._caption('план');
            else if (!real.hasTimesheet) marginCaption = this._caption('по плану');
            else marginCaption = this._caption(`план ${formatPercent(marginPercent)}`);
        }
        let costCard = '';
        if (honest && this.realCostState === 'loading') {
            costCard = `
            <div class="stat-card">
                <div class="stat-label">Себестоимость</div>
                <div class="stat-value text-muted">…</div>
                ${this._caption('считаем по факту')}
            </div>`;
        } else if (real && (real.realTotal > 0 || real.planTotal > 0)) {
            costCard = `
            <div class="stat-card" role="button" tabindex="0" style="cursor:pointer;"
                 title="Показать, из чего сложилась себестоимость"
                 onclick="OrderDetail.toggleRealCostDetails()"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OrderDetail.toggleRealCostDetails();}">
                <div class="stat-label">Себестоимость</div>
                <div class="stat-value">${this._formatWhole(real.realTotal)}</div>
                ${this._caption(real.hasTimesheet ? `план ${this._formatWhole(real.planTotal)}` : 'по плану')}
                ${this._caption(`Разбивка ${this.realCostDetailsOpen ? '▴' : '▾'}`, 'color:var(--accent);')}
            </div>`;
        }
        let hoursCaption = '';
        if (real) {
            hoursCaption = this._caption(real.hasTimesheet
                ? `план ${this._formatHours(hours)} · табель ${this._formatHours(real.hoursFact)}`
                : `план ${this._formatHours(hours)} · табеля нет`);
        }
        const freeLine = freeQty > 0
            ? `<div style="grid-column:1 / -1;font-size:14px;color:var(--text-secondary);">Отдаём бесплатно: ${this._formatQuantity(freeQty)} шт. на ${this._formatWhole(financial.freeCost)} себестоимости</div>`
            : '';
        const details = real && this.realCostDetailsOpen
            ? `<div style="grid-column:1 / -1;">${this.renderRealCostDetails(this.currentRealCost, this._canSeeSalaryBreakdown())}</div>`
            : '';

        document.getElementById('od-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Выручка</div>
                <div class="stat-value">${formatRub(revenue)}</div>
                ${revenueCaption}
            </div>
            <div class="stat-card">
                <div class="stat-label">${isNonCommercial ? (purpose === 'marketing' ? 'Расход на маркетинг' : 'Некоммерческие расходы') : 'Маржа'}</div>
                <div class="stat-value ${isNonCommercial || shownMargin < 30 ? 'text-red' : 'text-green'}">${isNonCommercial ? '−' + formatRub(loss) : formatPercent(shownMargin)}</div>
                ${marginCaption}
                ${marginNote}
            </div>
            ${costCard}
            <div class="stat-card">
                <div class="stat-label">Часы</div>
                <div class="stat-value">${hours.toFixed(1)} ч</div>
                ${hoursCaption}
            </div>
            <div class="stat-card">
                <div class="stat-label">${isNonCommercial || isLeftoverAssembly ? 'Тип работ' : 'Оплата'}</div>
                <div class="stat-value">${isNonCommercial
                    ? `${purposeMeta.icon} ${purposeMeta.shortLabel}`
                    : isLeftoverAssembly
                        ? '↙ Сборка из остатков'
                        : `<span class="badge badge-${ps.color}">${ps.label}</span>`}</div>
            </div>
            ${freeLine}
            ${details}
        `;
    },

    // Подпись под крупной цифрой карточки: читаемого размера (14 px), приглушённая.
    _caption(text, extraStyle = '') {
        return `<div style="font-size:14px;color:var(--text-muted);margin-top:4px;line-height:1.35;${extraStyle}">${this._esc(text)}</div>`;
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
        this.renderStats();
        return this.currentRealCost;
    },

    toggleRealCostDetails() {
        this.realCostDetailsOpen = !this.realCostDetailsOpen;
        this.renderStats();
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
    // «ТИРАЖ» ON THE INFO TAB
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
                    <div style="font-size:15px;font-weight:600;">${this._esc(line.name)} · ${count(line.quantity)} шт.</div>
                    <div style="font-size:14px;margin-top:2px;">${parts.join(' · ')}</div>
                </div>`;
        }).join('');
        return `
        <div class="card" id="od-tirage-card" style="margin-top:16px;">
            <div class="card-header"><h3>Тираж</h3></div>
            <div style="display:grid;gap:14px;">${rows}${this._renderTirageStock()}
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
            ? `<div style="margin-top:10px;"><button type="button" class="btn btn-outline" style="font-size:14px;"
                    onclick="OrderDetail.recalcTirageCost()" ${this.tirageRecalcBusy ? 'disabled' : ''}
                    title="Когда ФинТабло догнал: себестоимость непроданных штук на складе пересчитается, записи продаж останутся как были">${this.tirageRecalcBusy ? 'Пересчитываем…' : 'Пересчитать себестоимость'}</button></div>`
            : '';
        return `
                <div style="border-top:1px solid var(--border);padding-top:12px;">
                    <div style="font-size:15px;font-weight:600;">Склад готовой продукции</div>
                    <div style="font-size:14px;margin-top:2px;" title="Заморожено — себестоимость непроданных штук на складе">На складе ${count(stock.inStock)} из ${count(stock.total)} · заморожено ${this._formatWhole(stock.frozen)} · ${sold}</div>
                    ${button}
                </div>`;
    },

    // Блок перерисовывается на месте: вкладку «Информация» целиком трогать нельзя — в ней могут
    // править поле.
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
    // INFO TAB
    // ==========================================

    renderInfoTab() {
        const o = this.currentOrder;
        const container = document.getElementById('od-tab-info');

        container.innerHTML = `
        <div class="od-detail-grid">
            <div class="card">
                <div class="card-header"><h3>Основное</h3></div>
                ${this._fieldRow('order_name', 'Название', o.order_name, 'text')}
                ${this._fieldRow('client_name', 'Клиент', o.client_name, 'text')}
                ${this._fieldRow('manager_name', 'Менеджер', o.manager_name, 'text')}
                ${this._fieldRowDateRange('deadline_start', 'deadline_end', 'Начало → Дедлайн', o.deadline_start || o.deadline, o.deadline_end)}
                ${this._fieldRow('notes', 'Заметки', o.notes, 'textarea')}
            </div>
            <div class="card">
                <div class="card-header"><h3>Контакты и ссылки</h3></div>
                ${this._fieldRow('delivery_address', 'Адрес доставки', o.delivery_address, 'text')}
                ${this._fieldRow('telegram', 'Telegram', o.telegram, 'text')}
                ${this._fieldRow('crm_link', 'CRM', o.crm_link, 'url')}
                ${this._fieldRow('fintablo_link', 'Финтабло', o.fintablo_link, 'url')}
            </div>
        </div>
        <div id="od-tirage-slot">${this.renderTirageInfo()}</div>
        ${this._renderDeliveryScheduleCard()}
        `;
    },

    _renderDeliveryScheduleCard() {
        const totalQuantity = getOrderProductionQuantity(this.currentItems);
        const validation = normalizeDeliverySchedule(this.deliveryScheduleDraft, totalQuantity);
        const hasRows = validation.schedule.length > 0;
        const statusColor = !hasRows ? 'var(--text-muted)' : (validation.valid ? 'var(--green)' : 'var(--red)');
        const statusText = !hasRows
            ? `Тираж: ${this._formatQuantity(totalQuantity)} шт. · сдаётся одной частью`
            : validation.valid
                ? `Распределено ${this._formatQuantity(validation.total)} из ${this._formatQuantity(totalQuantity)} шт.`
                : validation.errors[validation.errors.length - 1];
        const rows = this.deliveryScheduleDraft.map((entry, index) => `
            <div data-delivery-row="${index}" style="display:grid;grid-template-columns:minmax(150px,1fr) minmax(120px,.7fr) auto;gap:8px;align-items:center;">
                <input type="date" class="od-status-select" value="${this._escAttr(entry.date || '')}"
                    onchange="OrderDetail.updateDeliveryScheduleDraft(${index}, 'date', this.value)">
                <input type="number" class="od-status-select" min="1" step="1" value="${this._escAttr(entry.quantity || '')}"
                    placeholder="Количество"
                    onchange="OrderDetail.updateDeliveryScheduleDraft(${index}, 'quantity', this.value)">
                <button class="btn btn-sm btn-outline" type="button"
                    onclick="OrderDetail.removeDeliveryScheduleRow(${index})" title="Удалить партию">✕</button>
            </div>
        `).join('');

        return `
        <div class="card" id="od-delivery-schedule-card" style="margin-top:16px;">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                    <h3>График сдачи</h3>
                    <div style="font-size:12px;color:${statusColor};margin-top:3px;">${this._esc(statusText)}</div>
                </div>
                <button class="btn btn-sm btn-outline" type="button" onclick="OrderDetail.addDeliveryScheduleRow()">+ Партия</button>
            </div>
            <div style="padding:12px 16px 16px;">
                ${hasRows
                    ? `<div style="display:grid;gap:8px;">${rows}</div>`
                    : '<div class="text-muted" style="font-size:12px;">Добавьте даты и количество, если тираж нужно сдавать частями.</div>'}
                ${validation.errors.length
                    ? `<div style="font-size:12px;color:var(--red);margin-top:10px;">${validation.errors.map(error => this._esc(error)).join('<br>')}</div>`
                    : ''}
                <div style="display:flex;justify-content:flex-end;margin-top:12px;">
                    <button class="btn btn-sm btn-success" type="button" onclick="OrderDetail.saveDeliverySchedule()">Сохранить график</button>
                </div>
            </div>
        </div>`;
    },

    _renderDeliveryScheduleOnly() {
        const previous = document.getElementById('od-delivery-schedule-card');
        if (!previous) {
            this.renderInfoTab();
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
                this.currentOrder.id,
                { delivery_schedule: validation.schedule },
                siblingUpdates
            );
            this.currentOrder.calculator_data = JSON.stringify(snapshot);
            this.currentOrder.delivery_schedule = validation.schedule;
            if (siblingUpdates.deadline_end) this.currentOrder.deadline_end = siblingUpdates.deadline_end;
            this.deliveryScheduleDraft = validation.schedule.map(entry => ({ ...entry }));
            this.renderInfoTab();
            App.toast(validation.schedule.length ? 'График сдачи сохранён' : 'График сдачи удалён');
        } catch (error) {
            console.error('OrderDetail.saveDeliverySchedule error:', error);
            App.toast(error?.message || 'Не удалось сохранить график сдачи');
        }
    },

    _formatQuantity(value) {
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value) || 0);
    },

    // ==========================================
    // PRODUCTION TAB
    // ==========================================

    renderProductionTab() {
        const o = this.currentOrder;
        const container = document.getElementById('od-tab-production');

        container.innerHTML = `
        <div class="od-detail-grid">
            <div class="card">
                <div class="card-header"><h3>Статусы</h3></div>
                ${this._fieldRowSelect('payment_status', 'Статус оплаты', o.payment_status || 'not_sent', PAYMENT_STATUSES)}
            </div>
        </div>
        `;
    },

    // ==========================================
    // FILES TAB
    // ==========================================

    renderFilesTab() {
        const o = this.currentOrder;
        const container = document.getElementById('od-tab-files');

        container.innerHTML = `
        <div class="od-detail-grid">
            <div class="card">
                <div class="card-header"><h3>Файлы проекта</h3></div>
                ${this._fieldRow('print_file_url', 'Файл печати', o.print_file_url, 'url')}
                ${this._fieldRow('cutting_file_url', 'Файл резки/формы', o.cutting_file_url, 'url')}
                ${this._fieldRow('delivery_documents_url', 'Документы доставки', o.delivery_documents_url, 'url')}
            </div>
            <div class="card">
                <div class="card-header"><h3>Референсы</h3></div>
                ${this._fieldRow('reference_urls', 'URL референсов', o.reference_urls, 'textarea')}
                ${this._renderReferenceLinks(o.reference_urls)}
            </div>
        </div>
        `;
    },

    _renderReferenceLinks(urls) {
        if (!urls) return '<p class="text-muted" style="padding:8px 16px;font-size:12px;">Нет референсов</p>';
        const links = urls.split(',').map(u => u.trim()).filter(Boolean);
        if (links.length === 0) return '';
        return `<div style="padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px;">
            ${links.map((u, i) => `<a href="${this._escAttr(u)}" target="_blank" class="od-url-link" title="${this._escAttr(u)}">Референс ${i + 1}</a>`).join('')}
        </div>`;
    },

    // ==========================================
    // ITEMS TAB
    // ==========================================

    renderItemsTab() {
        const container = document.getElementById('od-tab-items');
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
                html += `<h3 style="margin:0 0 8px;display:flex;align-items:center;gap:6px;">&#128230; ${this._esc(setName)} <span class="text-muted" style="font-size:13px;font-weight:400;">(${setQty} шт)</span></h3>`;

                if (group.products.length > 0) {
                    html += '<div style="margin-bottom:6px;font-size:12px;font-weight:600;color:#6b7280;">Изделия:</div>';
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
                    html += '<div style="margin-top:8px;font-size:12px;font-weight:600;color:#6b7280;">&#128297; Фурнитура:</div>';
                    group.hw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                }
                if (group.pkg.length > 0) {
                    html += '<div style="margin-top:8px;font-size:12px;font-weight:600;color:#6b7280;">&#128230; Упаковка:</div>';
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
                html += '<h3 style="margin:16px 0 12px">&#128297; Общая фурнитура</h3>';
                html += noSetHw.map(item => this._renderItemCard(item, 'hardware')).join('');
            }
            if (noSetPkg.length > 0) {
                html += '<h3 style="margin:16px 0 12px">&#128230; Общая упаковка</h3>';
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
                html += '<h3 style="margin:16px 0 12px">&#128297; Общая фурнитура</h3>';
                html += orderHardware.map(item => this._renderItemCard(item, 'hardware')).join('');
            }
            if (orderPackaging.length > 0) {
                html += '<h3 style="margin:16px 0 12px">&#128230; Общая упаковка</h3>';
                html += orderPackaging.map(item => this._renderItemCard(item, 'packaging')).join('');
            }

            // Pendant items
            html += pendantHtml;
        }

        if (!html) {
            html = '<div class="empty-state"><div class="empty-icon">&#128230;</div><p>Нет позиций. Откройте в калькуляторе для добавления.</p></div>';
        }

        container.innerHTML = html;
    },

    async renderHardwareTab() {
        const container = document.getElementById('od-tab-hardware');
        if (!container || !this.currentOrder) return;

        const orderId = Number(this.currentOrder.id || 0);
        if (!orderId) {
            container.innerHTML = '<div class="empty-state"><p>Заказ не найден</p></div>';
            return;
        }

        container.innerHTML = `<div class="card"><p class="text-muted" style="padding:16px">Загружаем фурнитуру заказа…</p></div>`;

        try {
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
            const demandRows = Warehouse._collectWarehouseDemandFromOrderItems(this.currentItems || []);
            const activeReservations = reservations || [];

            if (!demandRows.length) {
                container.innerHTML = `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">&#128295;</div>
                            <p>В заказе пока нет складской фурнитуры или упаковки.</p>
                            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                                <button class="btn btn-outline btn-sm" onclick="OrderDetail.openInCalculator()">Открыть в калькуляторе</button>
                                <button class="btn btn-outline btn-sm" onclick="Warehouse.setView('project-hardware'); App.navigate('warehouse')">Открыть фурнитуру для проектов</button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            const rows = demandRows
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

            const totalPlanned = round2(rows.reduce((sum, row) => sum + row.plannedQty, 0));
            const totalTarget = round2(rows.reduce((sum, row) => sum + row.targetQty, 0));
            const totalReserved = round2(rows.reduce((sum, row) => sum + row.currentReserveQty, 0));
            const totalReady = rows.filter(row => row.ready).length;

            container.innerHTML = `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                        <div>
                            <h3 style="margin:0 0 6px;">Фурнитура и упаковка заказа</h3>
                            <div class="text-muted" style="font-size:13px;">
                                Меняйте здесь фактическое количество и сборку по заказу. Резерв на складе пересчитается автоматически.
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-outline btn-sm" onclick="OrderDetail.openInCalculator()">Открыть в калькуляторе</button>
                            <button class="btn btn-outline btn-sm" onclick="Warehouse.setView('project-hardware'); App.navigate('warehouse')">Открыть на складе</button>
                        </div>
                    </div>
                    <div class="stats-grid" style="margin-top:12px;">
                        <div class="stat-card"><div class="stat-label">Позиций</div><div class="stat-value">${rows.length}</div></div>
                        <div class="stat-card"><div class="stat-label">План</div><div class="stat-value">${totalPlanned} шт</div></div>
                        <div class="stat-card"><div class="stat-label">Факт / цель</div><div class="stat-value">${totalTarget} шт</div></div>
                        <div class="stat-card"><div class="stat-label">В резерве</div><div class="stat-value">${totalReserved} шт</div></div>
                        <div class="stat-card"><div class="stat-label">Собрано</div><div class="stat-value">${totalReady} / ${rows.length}</div></div>
                    </div>
                </div>

                <div class="card" style="padding:0;">
                    <div class="table-wrap">
                        <table>
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
                                            <div style="font-size:11px;color:var(--text-muted);">${this._esc(row.itemKind)}</div>
                                            ${row.itemSku ? `<div style="font-size:11px;color:var(--text-muted);">${this._esc(row.itemSku)}</div>` : ''}
                                            ${this._renderProjectHardwareStockTruth(row.stockTruth, row)}
                                        </td>
                                        <td class="text-right" style="font-weight:700;">${row.plannedQty}</td>
                                        <td class="text-right">
                                            <div style="font-weight:700;">${row.currentReserveQty}</div>
                                            <div style="font-size:11px;color:var(--text-muted);">${this._esc(row.reserveHint)}</div>
                                        </td>
                                        <td class="text-right">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value="${row.actualQty === null || row.actualQty === undefined ? '' : row.actualQty}"
                                                placeholder="${row.plannedQty}"
                                                style="width:96px;text-align:right;"
                                                onblur="OrderDetail.setProjectHardwareActualQty(${row.itemId}, this.value)"
                                                onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                                            >
                                            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">если пусто — по плану</div>
                                        </td>
                                        <td class="text-right" style="font-weight:700;">${row.availableQty}</td>
                                        <td>
                                            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                                                <input type="checkbox" ${row.ready ? 'checked' : ''} onchange="OrderDetail.toggleProjectHardwareReady(${row.itemId}, this.checked)">
                                                <span style="font-size:12px;color:var(--text-secondary);">собрано</span>
                                            </label>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('renderHardwareTab error', error);
            container.innerHTML = `
                <div class="card">
                    <p class="text-muted" style="padding:16px;">Не удалось загрузить фурнитуру заказа.</p>
                </div>
            `;
        }
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
            rows += `<tr><td style="padding-left:24px;">&#129525; ${this._esc(cord.name || 'Шнур')}${titleSuffix}</td><td>${totalQtyLabel}</td><td>${formatRub(pricePerPendant)}</td><td>${formatRub(allocatedQty * pricePerPendant)}</td></tr>`;
        });
        carabiners.forEach(carabiner => {
            const allocatedQty = getAttachmentAllocatedQty(carabiner);
            const titleSuffix = (carabiner.qty_per_pendant || 1) > 1 ? ` × ${carabiner.qty_per_pendant}` : '';
            const pricePerPendant = attachmentCostPerPendant('carabiner', carabiner);
            rows += `<tr><td style="padding-left:24px;">&#128279; ${this._esc(carabiner.name || 'Фурнитура')}${titleSuffix}</td><td>${round2(allocatedQty * (carabiner.qty_per_pendant || 1))} шт${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}</td><td>${formatRub(pricePerPendant)}</td><td>${formatRub(allocatedQty * pricePerPendant)}</td></tr>`;
        });
        // Element groups by color
        Object.entries(groups).forEach(([color, els]) => {
            const chars = els.map(e => e.char).join(', ');
            const groupQty = els.length * qty;
            rows += `<tr><td style="padding-left:24px;">&#128292; ${this._esc(chars)} (${this._esc(color)})</td><td>${groupQty}</td><td>${formatRub(elemPrice)}</td><td>${formatRub(groupQty * elemPrice)}</td></tr>`;
        });
        // Print items
        elements.filter(el => el.has_print).forEach(el => {
            rows += `<tr><td style="padding-left:24px;">&#128424; Печать на ${this._esc(el.char)}</td><td>${qty}</td><td>${formatRub(el.print_price)}</td><td>${formatRub(qty * (el.print_price || 0))}</td></tr>`;
        });
        // Packaging
        if (pnd.packaging?.name) {
            rows += `<tr><td style="padding-left:24px;">&#128230; ${this._esc(pnd.packaging.name)}</td><td>${qty}</td><td>${formatRub(pnd.packaging.price_per_unit)}</td><td>${formatRub(qty * (pnd.packaging.price_per_unit || 0))}</td></tr>`;
        }

        const sellPrice = dbItem.sell_price_item || 0;
        const totalRevenue = sellPrice * qty;

        return `
            <div class="card" style="border-left:3px solid var(--accent);margin-bottom:12px;">
                <div class="card-header">
                    <h3 style="margin:0;">&#128292; Подвес "${this._esc(pnd.name)}" × ${qty} шт</h3>
                    <span style="font-size:14px;font-weight:700;">${formatRub(totalRevenue)}</span>
                </div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;padding:8px 16px;">
                    <tr style="color:var(--text-muted);font-size:11px;"><td>Позиция</td><td>Кол-во</td><td>Цена/шт</td><td>Итого</td></tr>
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
            <div class="form-row" style="margin:0;gap:24px;font-size:13px;">
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
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;font-size:12px;">
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
        const container = document.getElementById('od-tab-tasks');
        const orderId = this.currentOrder.id;
        const bundle = await loadWorkBundle();
        const projects = (bundle.projects || []).filter(project => String(project.linked_order_id || '') === String(orderId));
        const projectIds = new Set(projects.map(project => String(project.id)));
        const tasks = (bundle.tasks || []).filter(task =>
            String(task.order_id || '') === String(orderId)
            || projectIds.has(String(task.project_id || ''))
        );

        const projectCards = projects.length === 0
            ? '<div class="text-muted" style="font-size:13px;">Связанных проектов пока нет</div>'
            : projects.map(project => {
                const projectTasks = tasks.filter(task => String(task.project_id || '') === String(project.id));
                return `
                    <button class="od-project-card" onclick="App.navigate('projects', true, ${project.id})">
                        <div style="font-weight:700">${this._esc(project.title)}</div>
                        <div class="text-muted" style="font-size:12px">${this._esc(project.type || 'Другое')} · ${this._esc(WorkManagementCore.getProjectStatusLabel(project.status))}</div>
                        <div class="text-muted" style="font-size:12px">Задач: ${projectTasks.length} · Владелец: ${this._esc(project.owner_name || '—')}</div>
                    </button>
                `;
            }).join('');

        const taskRows = tasks.map(task => {
            const project = task.project_id ? projects.find(item => String(item.id) === String(task.project_id)) : null;
            return `
                <tr onclick="App.navigate('tasks', true, ${task.id})" style="cursor:pointer">
                    <td>
                        <div style="font-weight:600">${this._esc(task.title)}</div>
                        <div class="text-muted" style="font-size:12px">${this._esc(project ? `Проект: ${project.title}` : 'Прямая задача заказа')}</div>
                    </td>
                    <td><span class="badge">${this._esc(WorkManagementCore.getTaskStatusLabel(task.status))}</span></td>
                    <td style="font-size:12px">${this._esc(task.assignee_name || '—')}</td>
                    <td style="font-size:12px" class="${WorkManagementCore.isTaskOverdue(task) ? 'text-red' : ''}">${this._esc(task.due_date ? App.formatDate(task.due_date) + (task.due_time ? ' ' + task.due_time : '') : '—')}</td>
                </tr>
            `;
        }).join('');

        const inProgress = tasks.filter(task => task.status === 'in_progress').length;
        const done = tasks.filter(task => task.status === 'done').length;
        const total = tasks.length;

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap;">
                <div style="font-size:13px;color:var(--text-muted)">
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
                        <div class="empty-icon">&#9745;</div>
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
        const container = document.getElementById('od-tab-china');
        const orderId = this.currentOrder.id;
        const orderName = this._esc(this.currentOrder.order_name || '');
        try {
            const purchases = await loadChinaPurchases({ order_id: orderId });

            const addBtn = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
                <button class="btn btn-sm btn-success" onclick="App.navigate('china', true); setTimeout(() => { if(typeof ChinaPurchases!=='undefined') { ChinaPurchases.openNewForm(${orderId}); }}, 200);">+ Создать закупку для этого заказа</button>
            </div>`;

            if (!purchases || purchases.length === 0) {
                container.innerHTML = `
                    ${addBtn}
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">&#127464;&#127475;</div>
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
                                        <td>${st ? '<span class="badge badge-' + st.color + '">' + st.label + '</span>' : (p.status || '')}</td>
                                        <td class="text-right">${(p.total_cny || 0).toFixed(2)}</td>
                                        <td>${this._esc(p.tracking_number || '')}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        } catch (e) {
            container.innerHTML = '<div class="card"><p class="text-muted" style="padding:16px">Ошибка загрузки закупок</p></div>';
        }
    },

    // ==========================================
    // ACTIONS
    // ==========================================

    async changeStatus() {
        const o = this.currentOrder;
        const opts = STATUS_OPTIONS.filter(s => s.value !== 'deleted' && s.value !== o.status);
        const labels = opts.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
        const choice = prompt(`Текущий статус: ${App.statusLabel(o.status)}\n\nВыберите новый:\n${labels}\n\nВведите номер:`);
        if (!choice) return;

        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= opts.length) {
            App.toast('Неверный выбор');
            return;
        }

        const newStatus = opts[idx].value;
        if (typeof Orders !== 'undefined' && Orders && typeof Orders._ensureStatusTransitionAllowed === 'function') {
            const guard = await Orders._ensureStatusTransitionAllowed(this.currentOrder.id, newStatus);
            if (!guard.ok) return;
        }
        const managerName = prompt('Имя менеджера (для истории):') || 'Неизвестный';

        const oldStatus = o.status;
        try {
            await updateOrderStatus(this.currentOrder.id, newStatus);
        } catch (error) {
            console.error('OrderDetail.changeStatus updateOrderStatus failed:', error);
            App.toast('Не удалось сохранить статус. Обновите страницу и попробуйте ещё раз.');
            return;
        }

        // Confirm the successful primary write before any slower warehouse work.
        this.currentOrder.status = newStatus;
        this.renderHeader();
        App.toast(`Статус сохранён: ${App.statusLabel(newStatus)}`);

        if (typeof Orders !== 'undefined' && Orders && typeof Orders._finishStatusTransition === 'function') {
            await Orders._finishStatusTransition(this.currentOrder.id, this.currentOrder, oldStatus, newStatus, managerName);
        }
        // «Готово» ставит штуки «на продажу» на склад готовой продукции (или снимает их при возврате) —
        // блок «Тираж» показывает, что там теперь.
        await this.loadTirageStock();
    },

    openInCalculator() {
        if (this.currentOrder) {
            Calculator.loadOrder(this.currentOrder.id);
        }
    },

    cloneOrder() {
        if (this.currentOrder) {
            Orders.cloneOrder(this.currentOrder.id);
        }
    },

    // ==========================================
    // INLINE EDIT HELPERS
    // ==========================================

    async saveField(field, value) {
        await updateOrderFields(this.currentOrder.id, { [field]: value });
        this.currentOrder[field] = value;

        // Re-render current tab
        const tabRenderers = {
            info: () => this.renderInfoTab(),
            production: () => this.renderProductionTab(),
            files: () => this.renderFilesTab(),
            hardware: () => this.renderHardwareTab(),
        };
        if (tabRenderers[this.currentTab]) tabRenderers[this.currentTab]();
        if (['payment_status'].includes(field)) this.renderStats();

        App.toast('Сохранено');
    },

    startEdit(field, currentValue, inputType) {
        const cell = document.getElementById('od-val-' + field);
        if (!cell) return;
        cell.classList.add('od-editing');

        if (inputType === 'textarea') {
            cell.innerHTML = `<textarea class="od-inline-input" onblur="OrderDetail.finishEdit('${field}', this.value)" style="width:100%;min-height:60px;font-size:13px;padding:6px 8px;border:1px solid var(--accent);border-radius:6px;resize:vertical;">${this._esc(currentValue || '')}</textarea>`;
        } else {
            cell.innerHTML = `<input class="od-inline-input" type="${inputType === 'url' ? 'url' : 'text'}" value="${this._escAttr(currentValue || '')}" onblur="OrderDetail.finishEdit('${field}', this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" style="width:100%;font-size:13px;padding:6px 8px;border:1px solid var(--accent);border-radius:6px;">`;
        }
        cell.querySelector('.od-inline-input').focus();
    },

    finishEdit(field, value) {
        const trimmed = value.trim();
        if (trimmed !== (this.currentOrder[field] || '').toString().trim()) {
            this.saveField(field, trimmed);
        } else {
            // Revert — re-render tab
            const tabRenderers = {
                info: () => this.renderInfoTab(),
                production: () => this.renderProductionTab(),
                files: () => this.renderFilesTab(),
                hardware: () => this.renderHardwareTab(),
            };
            if (tabRenderers[this.currentTab]) tabRenderers[this.currentTab]();
        }
    },

    startEditDate(field, currentValue) {
        const cell = document.getElementById('od-val-' + field);
        if (!cell) return;
        cell.innerHTML = `<input type="date" value="${currentValue || ''}" onblur="OrderDetail.finishEdit('${field}', this.value)" onchange="OrderDetail.finishEdit('${field}', this.value)" style="font-size:13px;padding:4px 8px;border:1px solid var(--accent);border-radius:6px;">`;
        cell.querySelector('input').focus();
    },

    onSelectChange(field, value) {
        this.saveField(field, value);
    },

    onCheckboxChange(field, checked) {
        this.saveField(field, checked);
    },

    // ==========================================
    // FIELD RENDERERS
    // ==========================================

    _fieldRow(field, label, value, inputType) {
        let displayValue = '';
        if (inputType === 'url' && value) {
            const shortUrl = value.length > 50 ? value.substring(0, 50) + '...' : value;
            displayValue = `<a href="${this._escAttr(value)}" target="_blank" class="od-url-link">${this._esc(shortUrl)}</a>`;
        } else {
            displayValue = this._esc(value || '') || '<span class="text-muted">—</span>';
        }

        return `
        <div class="od-field-row" onclick="OrderDetail.startEdit('${field}', ${JSON.stringify(value || '').replace(/'/g, "\\'")}, '${inputType}')" style="cursor:pointer" title="Нажмите для редактирования">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value" id="od-val-${field}">${displayValue}</div>
        </div>`;
    },

    _fieldRowDateRange(fieldStart, fieldEnd, label, valueStart, valueEnd) {
        const fmtStart = valueStart ? App.formatDate(valueStart) : '—';
        const fmtEnd = valueEnd ? App.formatDate(valueEnd) : '';
        const display = fmtEnd ? `${fmtStart} → ${fmtEnd}` : fmtStart;

        return `
        <div class="od-field-row">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">
                <span id="od-val-${fieldStart}" onclick="OrderDetail.startEditDate('${fieldStart}', '${valueStart || ''}')" style="cursor:pointer" title="Нажмите для изменения">${fmtStart}</span>
                <span>→</span>
                <span id="od-val-${fieldEnd}" onclick="OrderDetail.startEditDate('${fieldEnd}', '${valueEnd || ''}')" style="cursor:pointer" title="Нажмите для изменения">${fmtEnd || '<span class=text-muted>—</span>'}</span>
            </div>
        </div>`;
    },

    _fieldRowSelect(field, label, value, options) {
        const opts = options.map(o =>
            `<option value="${o.key}" ${o.key === value ? 'selected' : ''}>${o.label}</option>`
        ).join('');

        return `
        <div class="od-field-row">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value">
                <select class="od-status-select" onchange="OrderDetail.onSelectChange('${field}', this.value)">
                    ${opts}
                </select>
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

    _statusColor(status) {
        const map = { draft: 'gray', calculated: 'blue', in_production: 'orange', production_printing: 'orange', completed: 'green', cancelled: 'red', deleted: 'red' };
        return map[status] || 'gray';
    },

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _escAttr(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
};
