// =============================================
// Recycle Object — календарная загрузка производства
// Единый источник мощности: люди × смена − нерабочие дни − отпуска.
// Спека: docs/specs/2026-07-17-calendar-availability-load-bar.md
// =============================================

const RO_QUARTER_LABELS = ['', 'I квартал', 'II квартал', 'III квартал', 'IV квартал'];
const RO_MONTH_LABELS = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function roLoadNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function _roundLoad(value) {
    return Math.round(roLoadNum(value) * 100) / 100;
}

function _clampLoad(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Парсит дату КАК ЛОКАЛЬНУЮ, чтобы YYYY-MM-DD не уезжал из квартала из-за UTC.
function _parseLocalDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return new Date(raw.getTime());
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function _startOfLoadDay(value) {
    const d = _parseLocalDate(value) || new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function _ymdLoad(value) {
    const d = _startOfLoadDay(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _parseLoadJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
}

// Границы текущего квартала по локальной дате now.
function getQuarterBounds(now) {
    const d = _startOfLoadDay(now);
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    const startMonth = (q - 1) * 3;
    const from = new Date(y, startMonth, 1, 0, 0, 0, 0);
    const to = new Date(y, startMonth + 3, 0, 23, 59, 59, 999);
    return { q, from, to, label: RO_QUARTER_LABELS[q] };
}

function getQuarterMonthMarkers(now) {
    const d = _startOfLoadDay(now);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const startMonth = (q - 1) * 3;
    const currentIndex = _clampLoad(d.getMonth() - startMonth, 0, 2);
    return [0, 1, 2].map(index => ({
        label: RO_MONTH_LABELS[startMonth + index],
        startPercent: index * 100 / 3,
        state: index < currentIndex ? 'past' : (index === currentIndex ? 'current' : 'future'),
    }));
}

function _holidaySet(settings) {
    const raw = String(settings?.production_holidays || '').trim();
    if (!raw) return new Set();
    return new Set(raw.split(/[\s,;]+/).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)));
}

function _isLoadWorkingDay(date, holidays) {
    const day = date.getDay();
    return day !== 0 && day !== 6 && !holidays.has(_ymdLoad(date));
}

function _availabilityConfig(settings = {}, planState = {}) {
    const overrideWorkers = roLoadNum(planState?.active_workers_count);
    const configuredWorkers = roLoadNum(settings?.planning_workers_count);
    const pricingWorkers = roLoadNum(settings?.workers_count);
    const workersCount = overrideWorkers > 0 ? overrideWorkers
        : (configuredWorkers > 0 ? configuredWorkers : (pricingWorkers > 0 ? Math.min(pricingWorkers, 2) : 2));
    const hoursPerDay = roLoadNum(settings?.planning_hours_per_day, 8) > 0
        ? roLoadNum(settings?.planning_hours_per_day, 8) : 8;
    return { workersCount: _roundLoad(workersCount), hoursPerDay: _roundLoad(hoursPerDay) };
}

function _vacationRows(rawVacations) {
    const source = Array.isArray(rawVacations) ? rawVacations
        : (Array.isArray(rawVacations?.vacations) ? rawVacations.vacations
            : (Array.isArray(rawVacations?.items) ? rawVacations.items : []));
    const dateOf = (row, keys) => {
        for (const key of keys) {
            const date = _parseLocalDate(row?.[key]);
            if (date) return _startOfLoadDay(date);
        }
        return null;
    };
    const personValues = row => {
        const values = [];
        ['employee_ids', 'employeeIds', 'worker_ids', 'workerIds', 'people', 'employees'].forEach(key => {
            const value = row?.[key];
            if (Array.isArray(value)) values.push(...value);
        });
        ['employee_id', 'employeeId', 'worker_id', 'workerId', 'person_id', 'personId', 'employee_name', 'employeeName', 'worker_name', 'workerName', 'name'].forEach(key => {
            if (row?.[key] !== undefined && row?.[key] !== null && row[key] !== '') values.push(row[key]);
        });
        return values.map(value => String(value?.id || value?.name || value).trim()).filter(Boolean);
    };
    return source.map((row, index) => {
        const start = dateOf(row, ['start_date', 'startDate', 'date_from', 'dateFrom', 'from', 'start', 'date']);
        const end = dateOf(row, ['end_date', 'endDate', 'date_to', 'dateTo', 'to', 'end']) || start;
        if (!start || !end) return null;
        const people = new Set(personValues(row));
        // A numeric count is accepted only when it was explicitly stored. We do
        // not invent absent people for a partial record.
        const explicitCount = people.size ? 0 : Math.max(0, Math.floor(roLoadNum(row?.workers_count ?? row?.workersCount ?? row?.employee_count ?? row?.employeeCount)));
        return { start: start <= end ? start : end, end: start <= end ? end : start, people, explicitCount, index };
    }).filter(Boolean);
}

function _vacationAbsenceForDay(rows, date) {
    const people = new Set();
    let anonymous = 0;
    rows.forEach(row => {
        if (date < row.start || date > row.end) return;
        row.people.forEach(person => people.add(person));
        anonymous += row.explicitCount;
    });
    return people.size + anonymous;
}

// Единственный источник доступных часов для полосы. Возвращает и дневные
// значения, чтобы квартальный темп и месяцы никогда не расходились.
function buildProductionAvailabilityCalendar({ settings = {}, planState = {}, vacations = [], from, to, now = new Date() } = {}) {
    const bounds = from && to ? { from: _startOfLoadDay(from), to: _startOfLoadDay(to) } : getQuarterBounds(now);
    const today = _startOfLoadDay(now);
    const holidays = _holidaySet(settings);
    const config = _availabilityConfig(settings, planState);
    const dailyFullCapacity = _roundLoad(config.workersCount * config.hoursPerDay);
    const vacationRows = _vacationRows(vacations);
    const months = {};
    const days = [];
    let totalHours = 0;
    let elapsedHours = 0;
    let remainingHours = 0;
    let workingDays = 0;
    let elapsedWorkingDays = 0;
    let remainingWorkingDays = 0;
    let vacationHours = 0;

    for (let cursor = new Date(bounds.from); cursor <= bounds.to; cursor.setDate(cursor.getDate() + 1)) {
        const date = _startOfLoadDay(cursor);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!months[key]) {
            months[key] = {
                key,
                label: RO_MONTH_LABELS[date.getMonth()],
                totalHours: 0, elapsedHours: 0, remainingHours: 0,
                workingDays: 0, elapsedWorkingDays: 0, remainingWorkingDays: 0,
                vacationHours: 0,
            };
        }
        const month = months[key];
        const working = _isLoadWorkingDay(date, holidays);
        const absentWorkers = working ? _vacationAbsenceForDay(vacationRows, date) : 0;
        const availableWorkers = working ? Math.max(0, config.workersCount - absentWorkers) : 0;
        const hours = _roundLoad(availableWorkers * config.hoursPerDay);
        const isElapsed = date <= today;
        const isRemaining = date > today;
        const vacationLoss = working ? _roundLoad(Math.max(0, dailyFullCapacity - hours)) : 0;
        const day = { date: _ymdLoad(date), hours, working, absentWorkers, availableWorkers, isElapsed, isRemaining };
        days.push(day);
        totalHours += hours;
        vacationHours += vacationLoss;
        month.totalHours += hours;
        month.vacationHours += vacationLoss;
        if (hours > 0) {
            workingDays += 1;
            month.workingDays += 1;
        }
        if (isElapsed) {
            elapsedHours += hours;
            month.elapsedHours += hours;
            if (hours > 0) { elapsedWorkingDays += 1; month.elapsedWorkingDays += 1; }
        }
        if (isRemaining) {
            remainingHours += hours;
            month.remainingHours += hours;
            if (hours > 0) { remainingWorkingDays += 1; month.remainingWorkingDays += 1; }
        }
    }

    const value = n => _roundLoad(n);
    return {
        from: bounds.from,
        to: bounds.to,
        today,
        workersCount: config.workersCount,
        hoursPerDay: config.hoursPerDay,
        dailyFullCapacity,
        vacationRecordCount: vacationRows.length,
        vacationHours: value(vacationHours),
        totalHours: value(totalHours),
        elapsedHours: value(elapsedHours),
        remainingHours: value(remainingHours),
        workingDays,
        elapsedWorkingDays,
        remainingWorkingDays,
        days,
        months: Object.values(months).map(month => ({ ...month, totalHours: value(month.totalHours), elapsedHours: value(month.elapsedHours), remainingHours: value(month.remainingHours), vacationHours: value(month.vacationHours) })),
    };
}

function getSeasonalLoadRatio(settings, now) {
    const { q } = getQuarterBounds(now);
    const percentages = _parseLoadJson(settings?.seasonal_load_percent_json);
    const quarterPercent = roLoadNum(percentages?.['Q' + q], NaN);
    if (Number.isFinite(quarterPercent)) return _clampLoad(quarterPercent / 100, 0, 1);
    return _clampLoad(roLoadNum(settings?.work_load_ratio), 0, 1);
}

// Совместимый публичный помощник. В контексте полосы ему передают availability:
// только тогда цель считается от физически доступных людей, а не pricing-часов.
function quarterTargetHours(settings, now, availability = null) {
    if (availability && Number.isFinite(Number(availability.totalHours))) {
        return _roundLoad(roLoadNum(availability.totalHours) * getSeasonalLoadRatio(settings, now));
    }
    const { q } = getQuarterBounds(now);
    const stored = _parseLoadJson(settings?.seasonal_load_plan_json);
    if (stored && roLoadNum(stored['Q' + q]) > 0) return _roundLoad(stored['Q' + q]);
    return Math.round(roLoadNum(settings?.workers_count) * roLoadNum(settings?.hours_per_worker) * roLoadNum(settings?.work_load_ratio) * 3);
}

// Чистый расчёт одного режима полосы. availability задаёт темп по рабочим
// часам, иначе сохраняется безопасный календарный fallback для старых вызовов.
function computeQuarterLoad({ planHours, soldHours = 0, nonCommercialHours = 0, doneHours = 0, now, from, to, availability = null }) {
    const plan = Math.max(0, roLoadNum(planHours));
    const sold = Math.max(0, roLoadNum(soldHours));
    const nonCommercial = Math.max(0, roLoadNum(nonCommercialHours));
    const done = Math.max(0, roLoadNum(doneHours));
    const booked = sold + nonCommercial;
    const gap = Math.max(0, plan - sold);
    const freeCapacity = Math.max(0, plan - booked);
    const nowT = _startOfLoadDay(now).getTime();
    const fromT = _startOfLoadDay(from).getTime();
    const toT = _startOfLoadDay(to).getTime();
    const fallbackRatio = _clampLoad((nowT - fromT) / Math.max(1, toT - fromT), 0, 1);
    const elapsedRatio = availability && roLoadNum(availability.totalHours) > 0
        ? _clampLoad(roLoadNum(availability.elapsedHours) / roLoadNum(availability.totalHours), 0, 1)
        : fallbackRatio;
    const expected = plan * elapsedRatio;
    const variance = done - expected;
    const dailyAvailability = availability && roLoadNum(availability.remainingWorkingDays) > 0
        ? roLoadNum(availability.remainingHours) / roLoadNum(availability.remainingWorkingDays)
        : (availability && roLoadNum(availability.workingDays) > 0
            ? roLoadNum(availability.totalHours) / roLoadNum(availability.workingDays) : 0);
    const varianceDays = dailyAvailability > 0 ? Math.abs(variance) / dailyAvailability : 0;
    const tolerance = Math.max(1, expected * 0.05);
    const status = variance > tolerance ? 'ahead' : (variance < -tolerance ? 'behind' : 'on_track');
    const scale = Math.max(plan, done, sold, nonCommercial, 1);
    const pct = value => _clampLoad(value / scale * 100, 0, 100);
    return {
        plan: _roundLoad(plan), sold: _roundLoad(sold), nonCommercial: _roundLoad(nonCommercial), booked: _roundLoad(booked), done: _roundLoad(done),
        gap: _roundLoad(gap), freeCapacity: _roundLoad(freeCapacity), expected: _roundLoad(expected), variance: _roundLoad(variance), varianceDays: _roundLoad(varianceDays),
        dailyAvailability: _roundLoad(dailyAvailability), elapsedRatio, status,
        scale: _roundLoad(scale), donePct: pct(done), expectedPct: pct(expected), scheduledPct: pct(booked),
    };
}

// Какие заказы считаем коммерческими и уже подтверждёнными для загрузки.
function _isSoldOrder(order) {
    if (!order || order.deleted_at || _isNonCommercialOrder(order)) return false;
    if (order.status === 'cancelled') return false;
    if (order.status === 'draft' && (!order.payment_status || order.payment_status === 'not_sent')) return false;
    return true;
}

function _orderProductionPurpose(order) {
    return typeof normalizeProductionPurpose === 'function'
        ? normalizeProductionPurpose(order?.production_purpose)
        : (['rework', 'stock_sample'].includes(String(order?.production_purpose || '')) ? String(order.production_purpose) : 'commercial');
}

function _isNonCommercialOrder(order) {
    const purpose = _orderProductionPurpose(order);
    return purpose === 'rework' || purpose === 'stock_sample';
}

function _isScheduledNonCommercialOrder(order) {
    return !!order && !order.deleted_at && order.status !== 'cancelled' && _isNonCommercialOrder(order);
}

function _orderProdDate(order) {
    return order && (order.deadline_start || order.deadline || order.created_at);
}

function _entryDate(entry) {
    return _parseLocalDate(entry && (entry.date || entry.work_date || entry.created_at));
}

function _isProductionEntry(entry) {
    return (typeof Factual !== 'undefined' && typeof Factual._isProductionLoadEntry === 'function')
        ? Factual._isProductionLoadEntry(entry) : true;
}

function doneHoursForRange(entries, from, to) {
    return _roundLoad((entries || []).reduce((sum, entry) => {
        const d = _entryDate(entry);
        return (!d || d < from || d > to || !_isProductionEntry(entry)) ? sum : sum + roLoadNum(entry.hours);
    }, 0));
}

function _scopeForOrder(order) {
    return _isNonCommercialOrder(order) ? 'noncommercial' : 'commercial';
}

function _emptyScopeBreakdown() {
    return { doneRows: [], remainingRows: [], orders: [], plannedHours: 0, doneHours: 0 };
}

// Собирает два честных слоя: коммерцию и некоммерческие работы. Фактическая
// запись без известного order_id остаётся неразмеченной, а не «угадывается».
function collectQuarterLoad(orders, entries, settings, now, calendarSource = {}) {
    const { from, to, label } = getQuarterBounds(now);
    const availability = buildProductionAvailabilityCalendar({
        settings,
        planState: calendarSource?.planState || {},
        vacations: calendarSource?.vacations || [],
        from,
        to,
        now,
    });
    const seasonalRatio = getSeasonalLoadRatio(settings, now);
    const commercialTarget = quarterTargetHours(settings, now, availability);
    const orderById = {};
    (orders || []).forEach(order => { if (order?.id != null) orderById[String(order.id)] = order; });
    const scopeBreakdown = { commercial: _emptyScopeBreakdown(), noncommercial: _emptyScopeBreakdown() };
    const doneByOrder = {};
    const unassignedRows = [];

    (entries || []).forEach(entry => {
        const d = _entryDate(entry);
        if (!d || d < from || d > to || !_isProductionEntry(entry)) return;
        const hours = roLoadNum(entry.hours);
        if (hours <= 0) return;
        const order = entry.order_id != null ? orderById[String(entry.order_id)] : null;
        if (!order) {
            unassignedRows.push({ orderId: null, name: entry.project_name || entry.order_name || 'неразмеченная запись табеля', hours });
            return;
        }
        const scope = _scopeForOrder(order);
        const key = String(order.id);
        doneByOrder[key] = (doneByOrder[key] || 0) + hours;
        scopeBreakdown[scope].doneHours += hours;
    });

    const monthsByKey = {};
    availability.months.forEach(month => {
        monthsByKey[month.key] = {
            ...month,
            scopes: {
                commercial: { remainingHours: 0, orders: [] },
                noncommercial: { remainingHours: 0, orders: [] },
            },
        };
    });

    let nonCommercialLoss = 0;
    (orders || []).forEach(order => {
        const date = _parseLocalDate(_orderProdDate(order));
        if (!date || date < from || date > to) return;
        const scope = _scopeForOrder(order);
        if (scope === 'commercial' && !_isSoldOrder(order)) return;
        if (scope === 'noncommercial' && !_isScheduledNonCommercialOrder(order)) return;
        const plan = Math.max(0, roLoadNum(order.total_hours_plan));
        const done = roLoadNum(doneByOrder[String(order.id)]);
        const remaining = Math.max(0, plan - done);
        const row = { id: order.id, orderId: order.id, name: order.order_name || ('заказ #' + order.id), plan: _roundLoad(plan), done: _roundLoad(done), remain: _roundLoad(remaining), purpose: _orderProductionPurpose(order) };
        const breakdown = scopeBreakdown[scope];
        breakdown.plannedHours += plan;
        breakdown.orders.push(row);
        if (remaining > 0.05) breakdown.remainingRows.push({ orderId: row.orderId, name: row.name, hours: row.remain });
        const month = monthsByKey[`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`];
        if (month && remaining > 0.05) {
            month.scopes[scope].remainingHours += remaining;
            month.scopes[scope].orders.push({ orderId: row.orderId, name: row.name, hours: row.remain });
        }
        if (scope === 'noncommercial') nonCommercialLoss += Math.max(0, roLoadNum(order.total_cost_plan, Math.max(0, -roLoadNum(order.total_margin_plan))));
    });

    Object.keys(scopeBreakdown).forEach(scope => {
        const breakdown = scopeBreakdown[scope];
        // Fact may be logged in this quarter for an order whose deadline lies
        // outside it. It must still appear under the green segment instead of
        // disappearing from the detailed list.
        breakdown.doneRows = Object.entries(doneByOrder)
            .map(([id, hours]) => ({ id, order: orderById[id], hours }))
            .filter(row => row.order && _scopeForOrder(row.order) === scope && row.hours > 0.05)
            .map(row => ({ orderId: row.order.id, name: row.order.order_name || ('заказ #' + row.order.id), hours: _roundLoad(row.hours) }))
            .sort((a, b) => b.hours - a.hours);
        breakdown.remainingRows.sort((a, b) => b.hours - a.hours);
        breakdown.plannedHours = _roundLoad(breakdown.plannedHours);
        breakdown.doneHours = _roundLoad(breakdown.doneHours);
    });
    unassignedRows.sort((a, b) => b.hours - a.hours);

    const commercial = computeQuarterLoad({
        planHours: commercialTarget,
        soldHours: scopeBreakdown.commercial.plannedHours,
        doneHours: scopeBreakdown.commercial.doneHours,
        now, from, to, availability,
    });
    const noncommercial = computeQuarterLoad({
        planHours: scopeBreakdown.noncommercial.plannedHours,
        nonCommercialHours: scopeBreakdown.noncommercial.plannedHours,
        doneHours: scopeBreakdown.noncommercial.doneHours,
        now, from, to, availability,
    });
    const months = Object.values(monthsByKey).map(month => ({
        ...month,
        scopes: {
            commercial: { ...month.scopes.commercial, remainingHours: _roundLoad(month.scopes.commercial.remainingHours) },
            noncommercial: { ...month.scopes.noncommercial, remainingHours: _roundLoad(month.scopes.noncommercial.remainingHours) },
        },
    }));

    // `load` keeps the pre-existing top-level contract for callers, while
    // `scopes` carries the explicit toggle data used by the new rendering.
    return {
        load: {
            ...commercial,
            scopes: { commercial, noncommercial },
            availability,
            commercialTarget,
            seasonalRatio,
        },
        label,
        breakdown: {
            ...scopeBreakdown.commercial,
            scopes: scopeBreakdown,
            months,
            unassignedRows,
            nonCommercialLoss: _roundLoad(nonCommercialLoss),
        },
    };
}

function _hrsLoad(value) { return Math.round(roLoadNum(value)).toLocaleString('ru-RU'); }
function _oneDecimalLoad(value) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(roLoadNum(value)); }

function _ensureProductionLoadStyles() {
    if (typeof document === 'undefined' || document.getElementById('pl-styles')) return;
    const style = document.createElement('style');
    style.id = 'pl-styles';
    style.textContent = `
.pl-wrap{font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--text-secondary,#57606a);margin:0 0 14px;padding:12px 20px;background:var(--bg-card,#fff);border:1px solid var(--border,#d0d7de);border-radius:10px;}
.pl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}.pl-title{font-weight:700;color:var(--text-primary,#24292f);}.pl-source{font-size:12px;}.pl-mode-switch{display:inline-flex;gap:4px;padding:3px;background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;}.pl-mode-btn{border:0;background:transparent;border-radius:5px;padding:5px 8px;font:inherit;color:var(--text-secondary,#57606a);cursor:pointer;}.pl-mode-btn[aria-pressed="true"]{background:#fff;color:#24292f;box-shadow:0 1px 2px rgba(0,0,0,.12);font-weight:700;}
.pl-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:8px;margin:12px 0 10px;}.pl-stat{border-radius:7px;background:#f6f8fa;padding:8px 10px;}.pl-stat .label{display:block;font-size:11px;color:#6e7781;}.pl-stat strong{display:block;font-size:16px;color:#24292f;font-variant-numeric:tabular-nums;}.pl-stat.pl-ahead strong{color:#1a7f37;}.pl-stat.pl-behind strong{color:#cf222e;}
.pl-trackwrap{position:relative;padding-top:16px;}.pl-months{position:relative;height:15px;margin:0 3px 3px;font-size:11px;color:#57606a;}.pl-month-label{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;}.pl-month-label.pl-month-first{transform:none;}.pl-month-label.pl-month-current{font-weight:700;color:#24292f;}.pl-track{position:relative;height:14px;border-radius:999px;background:#eaeef2;border:1px solid rgba(0,0,0,.08);overflow:visible;}.pl-seg{position:absolute;inset:0 auto 0 0;border-radius:999px;background:#2da44e;transition:width .5s ease;}.pl-month-boundary{position:absolute;top:-4px;bottom:-4px;width:1px;background:#57606a;opacity:.6;z-index:3;pointer-events:none;}.pl-expected{position:absolute;top:-6px;bottom:-6px;width:3px;background:#cf222e;border-radius:2px;z-index:5;}.pl-expected::after{content:'';position:absolute;top:-4px;left:-3px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #cf222e;}
.pl-track-note{display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;font-size:12px;}.pl-dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;}.pl-dot.pl-done{background:#2da44e;}.pl-dot.pl-expected{background:#cf222e;}.pl-tip{position:absolute;z-index:8;width:min(680px,calc(100vw - 48px));min-width:260px;max-width:calc(100vw - 24px);background:var(--pl-tip-bg,#fff);border:1px solid rgba(0,0,0,.12);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.12);padding:8px 10px;font-size:12px;line-height:1.5;color:#24292f;pointer-events:auto;display:none;}.pl-tip b{display:block;margin-bottom:4px;}.pl-tip .row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px;width:100%;padding:3px 4px;text-align:left;color:inherit;}.pl-tip .pl-tip-order{border:0;border-radius:4px;background:transparent;cursor:pointer;font:inherit;}.pl-tip .pl-tip-order:hover{background:#f6f8fa;}.pl-tip .pl-tip-order:focus-visible{outline:2px solid #388bfd;outline-offset:1px;}.pl-tip .pl-tip-name{min-width:0;overflow-wrap:anywhere;}.pl-tip .row span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap;}.pl-tip .muted{color:#57606a;}
.pl-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px;}.pl-month-card{padding:9px 10px;border:1px solid #d8dee4;border-radius:7px;background:#fff;}.pl-month-card.pl-month-current{border-color:#388bfd;}.pl-month-title{font-weight:700;color:#24292f;text-transform:capitalize;}.pl-month-values{font-variant-numeric:tabular-nums;margin:5px 0;color:#57606a;}.pl-month-values b{color:#24292f;}.pl-month-track{height:6px;border-radius:999px;background:#eaeef2;overflow:hidden;}.pl-month-fill{height:100%;background:#388bfd;border-radius:inherit;}.pl-month-fill.over{background:#cf222e;}.pl-month-note{font-size:11px;color:#6e7781;margin-top:4px;}.pl-warning{margin-top:10px;padding:7px 9px;border-radius:6px;background:#fff8c5;color:#633c01;font-size:12px;}.pl-subtle{margin-top:8px;font-size:12px;color:#6e7781;}@media(max-width:720px){.pl-wrap{padding:12px;}.pl-stat-grid,.pl-month-grid{grid-template-columns:1fr;}.pl-source{width:100%;}.pl-mode-switch{width:100%;}.pl-mode-btn{flex:1;}}@media(prefers-color-scheme:dark){.pl-wrap,.pl-month-card{background:#1c2128;border-color:#30363d;}.pl-stat,.pl-mode-switch{background:#21262d;border-color:#30363d;}.pl-mode-btn[aria-pressed="true"]{background:#30363d;color:#f0f6fc;}.pl-title,.pl-stat strong,.pl-month-title,.pl-month-values b{color:#f0f6fc;}.pl-track,.pl-month-track{background:#30363d;}.pl-tip{--pl-tip-bg:#1c2128;color:#f0f6fc;border-color:rgba(255,255,255,.14);}}
`;
    document.head.appendChild(style);
}

function _escLoad(value) {
    return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function _tipHtml(title, rows) {
    let html = `<b>${_escLoad(title)}</b>`;
    if (!rows.length) return html + '<div class="muted">пока пусто</div>';
    rows.forEach(row => {
        const rowHtml = `<span class="pl-tip-name">${_escLoad(row.name)}</span><span>${row.hours < 10 ? row.hours.toFixed(1) : Math.round(row.hours)} ч</span>`;
        const orderId = Number(row.orderId);
        html += Number.isFinite(orderId) && orderId > 0
            ? `<button type="button" class="row pl-tip-order" data-order-id="${orderId}" title="Открыть карточку заказа: ${_escLoad(row.name)}">${rowHtml}</button>`
            : `<div class="row muted">${rowHtml}</div>`;
    });
    return html;
}

function _scopeText(scope) { return scope === 'noncommercial' ? 'Образцы и переделки' : 'Коммерческие заказы'; }

function _monthCardHtml(month, scope) {
    const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const remaining = roLoadNum(month.scopes?.[scope]?.remainingHours);
    const available = roLoadNum(month.remainingHours);
    const ratio = available > 0 ? remaining / available : (remaining > 0 ? 1 : 0);
    const pct = _clampLoad(ratio * 100, 0, 100);
    const note = available > 0
        ? `осталось ${_hrsLoad(available)} ч календаря`
        : (remaining > 0 ? 'срок уже наступил — ёмкости не осталось' : 'месяц завершён');
    return `<article class="pl-month-card${month.key === currentKey ? ' pl-month-current' : ''}">
      <div class="pl-month-title">${_escLoad(month.label)}</div>
      <div class="pl-month-values"><b>${_hrsLoad(remaining)} ч</b> по дедлайнам / ${_hrsLoad(available)} ч</div>
      <div class="pl-month-track"><div class="pl-month-fill${ratio > 1 ? ' over' : ''}" style="width:${pct}%"></div></div>
      <div class="pl-month-note">${note}</div>
    </article>`;
}

function renderProductionLoadBar(container, load, label, breakdown) {
    if (!container || !load) return;
    _ensureProductionLoadStyles();
    const scope = container.dataset.plScope === 'noncommercial' ? 'noncommercial' : 'commercial';
    const view = load.scopes?.[scope] || load;
    const availability = load.availability || {};
    const scopedBreakdown = breakdown?.scopes?.[scope] || breakdown || _emptyScopeBreakdown();
    const expectedPct = _clampLoad(roLoadNum(view.expectedPct), 0, 100);
    const donePct = _clampLoad(roLoadNum(view.donePct), 0, 100);
    const variance = roLoadNum(view.variance);
    const varianceText = Math.abs(variance) < 0.05 ? 'в темпе' : (variance > 0 ? `запас +${_hrsLoad(variance)} ч` : `дефицит ${_hrsLoad(Math.abs(variance))} ч`);
    const varianceClass = variance > 0.05 ? 'pl-ahead' : (variance < -0.05 ? 'pl-behind' : '');
    const dayText = roLoadNum(view.varianceDays) > 0.04
        ? `≈ ${_oneDecimalLoad(view.varianceDays)} раб. дн.`
        : 'меньше 0,1 раб. дн.';
    const months = (breakdown?.months || []).map(month => _monthCardHtml(month, scope)).join('');
    const monthMarkers = getQuarterMonthMarkers(availability.today || new Date());
    const labels = monthMarkers.map((month, index) => `<span class="pl-month-label pl-month-${month.state}${index === 0 ? ' pl-month-first' : ''}" style="left:${month.startPercent}%">${month.label}</span>`).join('');
    const boundaries = monthMarkers.slice(1).map(month => `<i class="pl-month-boundary" style="left:${month.startPercent}%"></i>`).join('');
    const ratioPercent = Math.round(roLoadNum(load.seasonalRatio) * 100);
    const commercialPlanText = scope === 'commercial'
        ? `цель квартала: ${_hrsLoad(view.plan)} ч (${ratioPercent}% доступности)`
        : `утверждено в квартале: ${_hrsLoad(view.plan)} ч`;
    const unassigned = breakdown?.unassignedRows || [];
    const unassignedHours = unassigned.reduce((sum, row) => sum + roLoadNum(row.hours), 0);
    const vacationLabel = availability.vacationHours > 0
        ? `отпуска: −${_hrsLoad(availability.vacationHours)} ч`
        : 'отпуска: нет';

    container.innerHTML = `<div class="pl-wrap">
      <div class="pl-head">
        <span class="pl-title">Загрузка производства · ${_escLoad(label || '')}</span>
        <div class="pl-mode-switch" role="group" aria-label="Тип загрузки">
          <button type="button" class="pl-mode-btn" data-pl-scope="commercial" aria-pressed="${scope === 'commercial'}">Коммерческие заказы</button>
          <button type="button" class="pl-mode-btn" data-pl-scope="noncommercial" aria-pressed="${scope === 'noncommercial'}">Образцы и переделки</button>
        </div>
        <span class="pl-source">Календарь: ${_oneDecimalLoad(availability.workersCount)} чел. × ${_oneDecimalLoad(availability.hoursPerDay)} ч; ${vacationLabel}</span>
      </div>
      <div class="pl-stat-grid">
        <div class="pl-stat"><span class="label">Ожидалось к концу сегодня</span><strong>${_hrsLoad(view.expected)} ч</strong><span>${commercialPlanText}</span></div>
        <div class="pl-stat"><span class="label">Факт по табелю</span><strong>${_hrsLoad(view.done)} ч</strong><span>только привязанные к этому типу работ</span></div>
        <div class="pl-stat ${varianceClass}"><span class="label">Темп</span><strong>${varianceText}</strong><span>${dayText} по доступности команды</span></div>
      </div>
      <div class="pl-trackwrap">
        <div class="pl-months" aria-label="Месяцы квартала">${labels}</div>
        <div class="pl-track" aria-label="Зелёный: факт. Красная отметка: ожидаемый объём к концу сегодняшнего рабочего дня.">
          <div class="pl-seg pl-done" style="width:0%"></div>${boundaries}
          <i class="pl-expected" style="left:${expectedPct}%" title="Ожидалось к концу сегодня: ${_hrsLoad(view.expected)} ч"></i>
        </div>
        <div class="pl-tip" aria-hidden="true"></div>
      </div>
      <div class="pl-track-note"><span><i class="pl-dot pl-done"></i>факт ${_hrsLoad(view.done)} ч</span><span><i class="pl-dot pl-expected"></i>ожидалось ${_hrsLoad(view.expected)} ч</span><span>${scope === 'commercial' ? `к цели продать: ещё ${_hrsLoad(Math.max(0, view.plan - view.sold))} ч` : `осталось сделать: ${_hrsLoad(Math.max(0, view.plan - view.done))} ч`}</span></div>
      <div class="pl-month-grid">${months}</div>
      <div class="pl-subtle">По дедлайнам показаны только оставшиеся часы. Доступность месяцев: выходные и праздники исключены${availability.vacationHours > 0 ? `, отпуска убрали ${_hrsLoad(availability.vacationHours)} ч` : ''}.</div>
      ${unassignedHours > 0 ? `<div class="pl-warning">${_hrsLoad(unassignedHours)} ч факта в табеле не привязаны к заказу — они не приписаны ни коммерции, ни образцам/переделкам.</div>` : ''}
    </div>`;

    const doneEl = container.querySelector('.pl-seg.pl-done');
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => fn();
    raf(() => raf(() => { if (doneEl) doneEl.style.width = donePct + '%'; }));

    container.querySelectorAll('[data-pl-scope]').forEach(button => button.addEventListener('click', () => {
        container.dataset.plScope = button.dataset.plScope;
        renderProductionLoadBar(container, load, label, breakdown);
    }));

    const wrap = container.querySelector('.pl-trackwrap');
    const track = container.querySelector('.pl-track');
    const tip = container.querySelector('.pl-tip');
    if (!wrap || !track || !tip) return;
    const zones = [
        { toPct: donePct, html: () => _tipHtml(`Факт · ${_hrsLoad(view.done)} ч`, scopedBreakdown.doneRows || []) },
        { toPct: 101, html: () => _tipHtml(`Осталось по заказам · ${_hrsLoad(Math.max(0, view.plan - view.done))} ч`, scopedBreakdown.remainingRows || []) },
    ];
    const showTip = event => {
        const rect = track.getBoundingClientRect();
        if (!rect.width) return;
        const pct = (event.clientX - rect.left) / rect.width * 100;
        const zone = zones.find(item => pct <= item.toPct) || zones[zones.length - 1];
        tip.innerHTML = zone.html();
        tip.style.display = 'block';
        tip.style.left = '0px';
        tip.style.top = (track.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 4) + 'px';
        tip.setAttribute('aria-hidden', 'false');
    };
    const hideTip = () => { tip.style.display = 'none'; tip.setAttribute('aria-hidden', 'true'); };
    track.addEventListener('mouseenter', showTip);
    track.addEventListener('mousemove', showTip);
    wrap.addEventListener('mouseleave', hideTip);
    tip.addEventListener('click', event => {
        const row = event.target.closest('[data-order-id]');
        const orderId = Number(row?.dataset?.orderId);
        if (!(orderId > 0) || typeof App === 'undefined' || typeof App.navigate !== 'function') return;
        App.navigate('order-detail', true, orderId);
        hideTip();
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getQuarterBounds, getQuarterMonthMarkers, getSeasonalLoadRatio, quarterTargetHours,
        buildProductionAvailabilityCalendar, computeQuarterLoad, doneHoursForRange,
        collectQuarterLoad, renderProductionLoadBar, _isSoldOrder, _orderProdDate, _tipHtml,
    };
}
