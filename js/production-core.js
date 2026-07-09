// =============================================
// Recycle Object — Production Core
// Pure, environment-agnostic production-scheduling model.
// Extracted from js/gantt.js so the browser calendar and a headless
// Node publisher compute identical numbers.
//
// Self-contained: depends only on buildProductionSchedule (from
// js/calculator.js) and the standard primitives available in a bare
// vm context {console, Math, Intl, JSON, Array, Object, String,
// Number, Boolean, RegExp, Set, Map, Date}. Load order: calculator.js
// then production-core.js then gantt.js.
// =============================================

(function (global) {
    'use strict';

    // ---- small local helpers (kept private so the module is self-contained) ----

    function pcRound2(n) {
        // Mirror round2 from js/calculator.js so the module works even if
        // that global is unavailable in a bare vm context.
        if (typeof round2 === 'function') return round2(n);
        return Math.round((Number(n) || 0) * 100) / 100;
    }

    function pcFormatIsoDateLocal(date) {
        const value = date instanceof Date ? date : new Date(date);
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }

    function pcParseLocalDate(value) {
        if (value instanceof Date) return new Date(value.getTime());
        const raw = String(value || '').trim();
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }
        return new Date(value);
    }

    function getEmptyOrderActuals() {
        return {
            molding: 0,
            assembly: 0,
            packaging: 0,
            other: 0,
            total: 0,
            employeeCount: 0,
            entryCount: 0,
            resolvedByNameCount: 0,
        };
    }

    function normalizePersonName(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .trim();
    }

    function getPersonShortKey(name) {
        return normalizePersonName(name).split(' ').filter(Boolean)[0] || '';
    }

    function tokenizeSearchText(value) {
        return normalizePersonName(value)
            .split(' ')
            .map(token => token.trim())
            .filter(token => token.length >= 2);
    }

    function mapStageToProductionPhase(stage) {
        const value = normalizePersonName(stage);
        if (!value) return 'other';
        if (value.includes('casting') || value.includes('trim') || value.includes('вылив') || value.includes('срез') || value.includes('литник') || value.includes('лейник')) {
            return 'molding';
        }
        if (value.includes('assembly') || value.includes('сбор')) return 'assembly';
        if (value.includes('packaging') || value.includes('упаков')) return 'packaging';
        return 'other';
    }

    function getTimeEntryPhase(entry) {
        if (!entry) return 'other';
        const description = String(entry.task_description || entry.description || '');
        const metaMatch = description.match(/^\[meta\](\{.*?\})\[\/meta\]/);
        if (metaMatch) {
            try {
                const parsed = JSON.parse(metaMatch[1]);
                const phase = mapStageToProductionPhase(parsed?.stage || parsed?.stage_key || '');
                if (phase !== 'other') return phase;
            } catch (e) {
                // ignore invalid meta payloads
            }
        }
        const stage = mapStageToProductionPhase(entry.stage || '');
        if (stage !== 'other') return stage;
        const stageLine = description.match(/(?:^|\n)Этап:\s*([^\n]+)/i);
        return mapStageToProductionPhase(stageLine ? stageLine[1] : '');
    }

    function findProductionEmployeeForEntry(entry, employees = []) {
        if (!entry) return null;
        const employeeId = entry.employee_id != null ? String(entry.employee_id) : '';
        if (employeeId) {
            const byId = (employees || []).find(emp => String(emp.id) === employeeId && emp.role === 'production');
            if (byId) return byId;
        }
        const normalizedWorker = normalizePersonName(entry.worker_name || entry.employee_name || '');
        if (!normalizedWorker) return null;
        const exactMatches = (employees || []).filter(emp =>
            emp.role === 'production' && normalizePersonName(emp.name) === normalizedWorker
        );
        if (exactMatches.length === 1) return exactMatches[0];
        const shortKey = getPersonShortKey(entry.worker_name || entry.employee_name || '');
        if (!shortKey) return null;
        const shortMatches = (employees || []).filter(emp =>
            emp.role === 'production' && getPersonShortKey(emp.name) === shortKey
        );
        return shortMatches.length === 1 ? shortMatches[0] : null;
    }

    function resolveEntryOrder(entry, indexedOrders = []) {
        if (!entry) return null;
        const directOrderId = Number(entry.order_id);
        if (Number.isFinite(directOrderId) && directOrderId > 0) {
            const exact = indexedOrders.find(order => order.id === directOrderId);
            if (exact) return { id: exact.id, source: 'order_id' };
        }

        const projectKey = normalizePersonName(entry.project_name || entry.project || '');
        if (!projectKey) return null;

        const exactMatches = indexedOrders.filter(order => order.nameKey === projectKey);
        if (exactMatches.length === 1) return { id: exactMatches[0].id, source: 'name' };

        const containsMatches = indexedOrders.filter(order =>
            order.nameKey && (order.nameKey.includes(projectKey) || projectKey.includes(order.nameKey))
        );
        if (containsMatches.length === 1) return { id: containsMatches[0].id, source: 'name' };

        const tokens = tokenizeSearchText(projectKey);
        if (!tokens.length) return null;
        const tokenMatches = indexedOrders.filter(order =>
            tokens.every(token => order.tokens.includes(token) || order.nameKey.includes(token))
        );
        return tokenMatches.length === 1 ? { id: tokenMatches[0].id, source: 'name' } : null;
    }

    // ---- readiness classifier helpers ----

    function isTrueLike(value) {
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function isChinaPurchaseReceived(purchase) {
        return String(purchase?.status || '').trim().toLowerCase() === 'received';
    }

    function describeBlockedByMold(items = []) {
        const names = Array.from(new Set((items || [])
            .map(item => String(item?.product_name || '').trim())
            .filter(Boolean)));
        if (names.length === 1) {
            return `Ждет молд: ${names[0]}`;
        }
        if (names.length > 1) {
            return `Ждет молды для ${names.length} позиций`;
        }
        return 'Ждет молд';
    }

    function describeChinaBlocked(purchases = []) {
        const names = Array.from(new Set((purchases || [])
            .map(purchase => String(purchase?.purchase_name || '').trim())
            .filter(Boolean)));
        if (names.length === 1) {
            return `Ждет Китай: ${names[0]}`;
        }
        if (names.length > 1) {
            return `Ждет Китай: ${names.length} закупки`;
        }
        return 'Ждет Китай / молд';
    }

    function describeReviewAfterChinaReceipt(purchases = []) {
        const names = Array.from(new Set((purchases || [])
            .map(purchase => String(purchase?.purchase_name || '').trim())
            .filter(Boolean)));
        if (names.length === 1) {
            return `Проверьте молд: Китай уже принят (${names[0]})`;
        }
        return 'Проверьте молд: Китай уже принят';
    }

    // ---- exported pure functions ----

    // Moved verbatim from Gantt.buildOrderActuals (js/gantt.js).
    function buildOrderActuals(entries = [], employees = [], orders = []) {
        const buckets = new Map();
        const indexedOrders = (orders || [])
            .map(order => ({
                id: Number(order.id),
                nameKey: normalizePersonName(order.order_name || ''),
                tokens: tokenizeSearchText(order.order_name || ''),
            }))
            .filter(order => Number.isFinite(order.id) && order.id > 0);

        indexedOrders.forEach(order => {
            buckets.set(order.id, { ...getEmptyOrderActuals(), _employees: new Set() });
        });

        (entries || []).forEach(entry => {
            const employee = findProductionEmployeeForEntry(entry, employees);
            if (!employee) return;
            const resolved = resolveEntryOrder(entry, indexedOrders);
            if (!resolved) return;
            const bucket = buckets.get(resolved.id);
            if (!bucket) return;
            const hours = pcRound2(parseFloat(entry?.hours) || 0);
            if (hours <= 0) return;
            const phase = getTimeEntryPhase(entry);
            if (phase === 'molding') bucket.molding = pcRound2(bucket.molding + hours);
            else if (phase === 'assembly') bucket.assembly = pcRound2(bucket.assembly + hours);
            else if (phase === 'packaging') bucket.packaging = pcRound2(bucket.packaging + hours);
            else bucket.other = pcRound2(bucket.other + hours);
            bucket.total = pcRound2(bucket.total + hours);
            bucket.entryCount += 1;
            bucket._employees.add(String(employee.id || employee.name || entry.worker_name || ''));
            if (resolved.source === 'name') bucket.resolvedByNameCount += 1;
        });

        buckets.forEach(bucket => {
            bucket.employeeCount = bucket._employees.size;
            delete bucket._employees;
        });

        return buckets;
    }

    // Readiness classifier — moved verbatim from Gantt.getOrderReadiness.
    // Signature matches the plan: deriveReadyState(order, orderItems, chinaPurchases).
    function deriveReadyState(order, items = [], chinaPurchases = []) {
        const productItems = (items || []).filter(item => String(item?.item_type || 'product') === 'product');
        const customMoldItems = productItems.filter(item => item && item.is_blank_mold === false);
        const blockedItems = customMoldItems.filter(item => !isTrueLike(item.base_mold_in_stock));
        if (blockedItems.length > 0) {
            const pendingChinaPurchases = (chinaPurchases || []).filter(purchase => !isChinaPurchaseReceived(purchase));
            if (pendingChinaPurchases.length > 0) {
                return {
                    production_ready_state: 'blocked',
                    production_blocked_reason: describeChinaBlocked(pendingChinaPurchases),
                    production_blocked_items: blockedItems.length,
                };
            }
            const receivedChinaPurchases = (chinaPurchases || []).filter(purchase => isChinaPurchaseReceived(purchase));
            if (receivedChinaPurchases.length > 0) {
                return {
                    production_ready_state: 'needs_review',
                    production_blocked_reason: describeReviewAfterChinaReceipt(receivedChinaPurchases),
                    production_blocked_items: blockedItems.length,
                };
            }
            return {
                production_ready_state: 'blocked',
                production_blocked_reason: describeBlockedByMold(blockedItems),
                production_blocked_items: blockedItems.length,
            };
        }
        return {
            production_ready_state: 'ready',
            production_blocked_reason: '',
            production_blocked_items: 0,
        };
    }

    // Overload/capacity risk calc — moved verbatim from Gantt.buildCapacityRiskSummary.
    function computeOverloadSummary(days = [], dailyCapacity = 0, referenceDate = new Date()) {
        const point = referenceDate instanceof Date ? referenceDate : pcParseLocalDate(referenceDate);
        const today = pcFormatIsoDateLocal(point);
        const futureDays = (days || []).filter(day => String(day?.date || '') >= today);
        const overloadedDays = futureDays.filter(day => Number(day?.totalUsed || 0) > Number(dailyCapacity || 0));
        const firstOverload = overloadedDays[0] || null;
        return {
            overloadDays: overloadedDays.length,
            firstOverloadDate: firstOverload?.date || '',
            firstOverloadHours: firstOverload ? pcRound2((firstOverload.totalUsed || 0) - Number(dailyCapacity || 0)) : 0,
        };
    }

    // Orchestrator: data -> production model. Mirrors the pipeline inlined
    // in Gantt.applyLoadedData (called from Gantt.load).
    //
    // data: {
    //   orders,        // ordered/priority-tagged schedulable orders (as Gantt.buildOrderedOrders produces)
    //   orderItems,    // raw order item snapshots (unfiltered)
    //   planState,     // NORMALIZED plan state { order_ids, manual_start_dates, active_workers_count, parallel_workers }
    //   settings,      // EFFECTIVE planning settings passed to buildProductionSchedule
    //   timeEntries, employees, chinaPurchases
    // }
    // Returns { queue, days, dailyCapacity, blocked, review, overload, actuals }.
    function buildProductionModel(data = {}) {
        const orders = data.orders || [];
        const orderItems = data.orderItems || [];
        const planState = data.planState || { manual_start_dates: {}, parallel_workers: {} };
        const settings = data.settings || {};
        const timeEntries = data.timeEntries || [];
        const employees = data.employees || [];
        const chinaPurchases = data.chinaPurchases || [];

        const manualStartDates = (planState && planState.manual_start_dates) || {};
        const parallelWorkers = (planState && planState.parallel_workers) || {};

        const getOrderParallelWorkers = (orderId) => {
            const normalizedId = String(Number(orderId) || 0);
            const stored = Math.round(Number(parallelWorkers?.[normalizedId] || 0));
            return stored >= 1 ? stored : 1;
        };

        const itemsByOrderId = new Map();
        (orderItems || []).forEach(item => {
            const key = Number(item.order_id);
            if (!itemsByOrderId.has(key)) itemsByOrderId.set(key, []);
            itemsByOrderId.get(key).push(item);
        });

        const chinaPurchasesByOrderId = new Map();
        (chinaPurchases || []).forEach(purchase => {
            const key = Number(purchase.order_id);
            if (!Number.isFinite(key) || key <= 0) return;
            if (!chinaPurchasesByOrderId.has(key)) chinaPurchasesByOrderId.set(key, []);
            chinaPurchasesByOrderId.get(key).push(purchase);
        });

        const orderActuals = buildOrderActuals(timeEntries, employees, orders);
        const enrichedOrders = orders.map(order => {
            const actuals = orderActuals.get(Number(order.id)) || getEmptyOrderActuals();
            const plannedMolding = pcRound2(order.production_hours_plastic || 0);
            const plannedAssembly = pcRound2(order.production_hours_hardware || 0);
            const plannedPackaging = pcRound2(order.production_hours_packaging || 0);
            const plannedTotal = pcRound2(plannedMolding + plannedAssembly + plannedPackaging);
            const remainingTotal = pcRound2(
                Math.max(plannedMolding - actuals.molding, 0)
                + Math.max(plannedAssembly - actuals.assembly, 0)
                + Math.max(plannedPackaging - actuals.packaging, 0)
            );
            const actualTotalForPlan = pcRound2(actuals.molding + actuals.assembly + actuals.packaging);
            const progressPercent = plannedTotal > 0
                ? pcRound2(Math.min((actualTotalForPlan / plannedTotal) * 100, 999))
                : 0;

            return {
                ...order,
                production_not_before: manualStartDates[String(order.id)] || '',
                production_parallel_workers: getOrderParallelWorkers(Number(order.id)),
                actual_hours_molding: actuals.molding,
                actual_hours_assembly: actuals.assembly,
                actual_hours_packaging: actuals.packaging,
                actual_hours_other: actuals.other,
                actual_hours_total: actualTotalForPlan,
                actual_hours_employee_count: actuals.employeeCount,
                actual_hours_entry_count: actuals.entryCount,
                actual_hours_resolved_by_name: actuals.resolvedByNameCount,
                planned_hours_total: plannedTotal,
                remaining_hours_total: remainingTotal,
                progress_percent: progressPercent,
                ...deriveReadyState(
                    order,
                    itemsByOrderId.get(Number(order.id)) || [],
                    chinaPurchasesByOrderId.get(Number(order.id)) || []
                ),
            };
        });

        const blocked = enrichedOrders.filter(order => order.production_ready_state === 'blocked');
        const review = enrichedOrders.filter(order => order.production_ready_state === 'needs_review');
        const schedule = buildProductionSchedule(
            enrichedOrders.filter(order => order.production_ready_state === 'ready'),
            settings
        );
        const days = schedule.days || [];
        const dailyCapacity = schedule.dailyCapacity;
        const overload = computeOverloadSummary(days, dailyCapacity, new Date());

        return {
            queue: schedule.queue,
            days,
            dailyCapacity,
            blocked,
            review,
            overload,
            actuals: orderActuals,
            orders: enrichedOrders,
        };
    }

    const api = {
        buildProductionModel,
        buildOrderActuals,
        deriveReadyState,
        computeOverloadSummary,
    };

    // Attach individual functions to the global so gantt.js delegators and a
    // headless Node publisher can both reach them in a bare vm context.
    global.buildProductionModel = buildProductionModel;
    global.buildOrderActuals = buildOrderActuals;
    global.deriveReadyState = deriveReadyState;
    global.computeOverloadSummary = computeOverloadSummary;
    global.ProductionCore = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
