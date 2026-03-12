// =============================================
// Recycle Object — Time Tracking
// Учет рабочего времени сотрудников + план/факт по этапам
// =============================================

const TT_STAGE_LABELS = {
    casting: 'Выливание пластика',
    trim: 'Срезание литника',
    assembly: 'Сборка',
    packaging: 'Упаковка',
    other: 'Другое',
};

const TT_STAGE_ORDER = ['casting', 'trim', 'assembly', 'packaging', 'other'];
const TT_PRODUCTION_STATUSES = ['production_casting', 'production_hardware', 'production_packaging', 'in_production'];

const TimeTrack = {
    entries: [],
    employees: [],

    async load() {
        this.entries = (await loadTimeEntries()) || [];
        this.employees = (await loadEmployees()) || [];
        this.populateWorkerSelect();
        this.populateFilters();
        await this.populateProjectSelect();
        this.filterAndRender();
        this.updateStats();
        this.renderDailyStatus();
        this.renderPayrollSummary();
        this.onStageChange();

        const dateInput = document.getElementById('tt-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    },

    // === UI toggles ===

    showBotSetup() {
        document.getElementById('tt-bot-setup').style.display = '';
    },

    hideBotSetup() {
        document.getElementById('tt-bot-setup').style.display = 'none';
    },

    showManualEntry() {
        document.getElementById('tt-manual-form').style.display = '';
        this.onStageChange();
    },

    hideManualEntry() {
        document.getElementById('tt-manual-form').style.display = 'none';
    },

    onStageChange() {
        const stage = (document.getElementById('tt-stage')?.value || 'casting');
        const wrap = document.getElementById('tt-stage-other-wrap');
        if (wrap) wrap.style.display = stage === 'other' ? '' : 'none';
    },

    // === Metadata parser for backward compatibility ===

    parseMeta(entry) {
        if (!entry) return { stage: '', stage_label: '', project: '' };
        if (entry._parsedMeta) return entry._parsedMeta;

        const desc = String(entry.description || entry.task_description || '');
        const meta = { stage: '', stage_label: '', project: '' };

        const markerMatch = desc.match(/^\[meta\](\{.*?\})\[\/meta\]\s*/);
        if (markerMatch) {
            try {
                const parsed = JSON.parse(markerMatch[1]);
                if (parsed && parsed.stage) {
                    meta.stage = parsed.stage;
                    meta.stage_label = parsed.stage_label || TT_STAGE_LABELS[parsed.stage] || parsed.stage;
                }
                if (parsed && parsed.project) meta.project = parsed.project;
            } catch (e) {
                // ignore
            }
        }

        if (!meta.stage) {
            const stageMatch = desc.match(/(?:^|\n)Этап:\s*([^\n]+)/i);
            if (stageMatch) {
                meta.stage_label = stageMatch[1].trim();
                meta.stage = this.labelToStageKey(meta.stage_label);
            }
        }

        if (!meta.stage && entry.stage) {
            meta.stage = entry.stage;
            meta.stage_label = TT_STAGE_LABELS[entry.stage] || entry.stage;
        }

        entry._parsedMeta = meta;
        return meta;
    },

    stripMetaPrefix(description) {
        const raw = String(description || '');
        return raw
            .replace(/^\[meta\]\{.*?\}\[\/meta\]\s*/s, '')
            .replace(/^(?:Этап:\s*[^\n]+\n?)+/i, '')
            .trim();
    },

    labelToStageKey(label) {
        const normalized = String(label || '').trim().toLowerCase();
        if (!normalized) return '';
        if (normalized.includes('вылив')) return 'casting';
        if (normalized.includes('литник') || normalized.includes('лейник') || normalized.includes('срез')) return 'trim';
        if (normalized.includes('сбор')) return 'assembly';
        if (normalized.includes('упаков')) return 'packaging';
        return 'other';
    },

    stageKey(entry) {
        const meta = this.parseMeta(entry);
        return meta.stage || '';
    },

    stageLabel(entry) {
        const meta = this.parseMeta(entry);
        if (meta.stage_label) return meta.stage_label;
        if (meta.stage) return TT_STAGE_LABELS[meta.stage] || meta.stage;
        return '—';
    },

    buildDescriptionWithMeta(stage, stageLabel, description, projectName) {
        const cleanDesc = String(description || '').trim();
        const meta = { stage, stage_label: stageLabel };
        if (projectName) meta.project = projectName;
        const payload = JSON.stringify(meta);
        return `[meta]${payload}[/meta] ${cleanDesc}`.trim();
    },

    // === Populate selects ===

    /** Production employees + anyone with existing time entries */
    _getProductionEmployees() {
        const active = this.employees.filter(e => e.is_active !== false);
        const productionEmp = active.filter(e => e.role === 'production');
        // Also include non-production employees who have time entries (e.g. Леша)
        const entryWorkers = new Set(this.entries.map(e => e.worker_name).filter(Boolean));
        const nonProdWithEntries = active.filter(e => e.role !== 'production' && entryWorkers.has(e.name));
        return [...productionEmp, ...nonProdWithEntries];
    },

    populateWorkerSelect() {
        const select = document.getElementById('tt-worker-name');
        if (!select) return;
        select.innerHTML = '<option value="">-- Выберите --</option>';
        const workers = this._getProductionEmployees();
        workers.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.name;
            opt.textContent = e.name;
            select.appendChild(opt);
        });
    },

    async populateProjectSelect() {
        const select = document.getElementById('tt-project-select');
        if (!select) return;

        while (select.options.length > 2) select.remove(2);

        const orders = await loadOrders({});
        const activeProduction = (orders || []).filter(o => TT_PRODUCTION_STATUSES.includes(o.status));

        activeProduction.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.order_name + (o.client_name ? ` (${o.client_name})` : '');
            select.appendChild(opt);
        });
    },

    // === Daily Status ===

    renderDailyStatus() {
        const container = document.getElementById('tt-daily-status-content');
        const dateEl = document.getElementById('tt-daily-date');
        if (!container) return;

        const today = new Date().toISOString().split('T')[0];
        if (dateEl) dateEl.textContent = today;

        const activeEmployees = this._getProductionEmployees();
        if (activeEmployees.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding:8px;">Нет производственных сотрудников</p>';
            return;
        }

        const todayEntries = this.entries.filter(e => e.date === today);
        const byWorker = {};
        todayEntries.forEach(e => {
            if (!byWorker[e.worker_name]) byWorker[e.worker_name] = [];
            byWorker[e.worker_name].push(e);
        });

        const roleLabels = { production: 'Пр', office: 'Оф', management: 'Рук' };

        const rows = activeEmployees.map(emp => {
            const entries = byWorker[emp.name] || [];
            const totalHours = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
            const totalPct = emp.daily_hours > 0 ? Math.round(totalHours / emp.daily_hours * 100) : 0;

            let icon, statusColor, statusText;
            if (totalPct >= 100) {
                icon = '<span style="color:var(--green);font-size:16px;">&#10004;</span>';
                statusColor = 'var(--green)';
                statusText = `${totalPct}%`;
            } else if (totalPct > 0) {
                icon = '<span style="color:var(--orange);font-size:16px;">&#9888;</span>';
                statusColor = 'var(--orange)';
                statusText = `${totalPct}% — не закончил`;
            } else {
                icon = '<span style="color:var(--text-muted);font-size:16px;">&#10060;</span>';
                statusColor = 'var(--text-muted)';
                statusText = 'не отчитался';
            }

            const projectList = entries.length > 0
                ? entries.map(e => {
                    const stage = this.stageLabel(e);
                    return `<span style="font-size:11px;">${this.esc(e.project_name)} / ${this.esc(stage)} (${parseFloat(e.hours) || 0}ч)</span>`;
                }).join(', ')
                : '';

            const roleBadge = `<span style="font-size:9px;color:var(--text-muted);">${roleLabels[emp.role] || ''}</span>`;

            return `
            <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border);">
                ${icon}
                <div style="min-width:90px;">
                    <span style="font-weight:600; font-size:13px;">${this.esc(emp.name)}</span>
                    ${roleBadge}
                </div>
                <div style="flex:1;">
                    <span style="color:${statusColor}; font-weight:600; font-size:12px;">${statusText}</span>
                    ${projectList ? `<div style="margin-top:2px;">${projectList}</div>` : ''}
                </div>
                <div style="font-size:11px; color:var(--text-muted);">${totalHours.toFixed(1)}ч / ${emp.daily_hours}ч</div>
            </div>`;
        });

        container.innerHTML = rows.join('');
    },

    // === Filters ===

    populateFilters() {
        const productionNames = this._getProductionEmployees().map(e => e.name);
        const entryWorkers = this.entries.map(e => e.worker_name).filter(Boolean);
        const allWorkers = [...new Set([...productionNames, ...entryWorkers])].sort();

        const wSelect = document.getElementById('tt-filter-worker');
        while (wSelect.options.length > 1) wSelect.remove(1);
        allWorkers.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w;
            opt.textContent = w;
            wSelect.appendChild(opt);
        });

        const projects = [...new Set(this.entries.map(e => e.project_name).filter(Boolean))];
        const pSelect = document.getElementById('tt-filter-project');
        while (pSelect.options.length > 1) pSelect.remove(1);
        projects.sort().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            pSelect.appendChild(opt);
        });
    },

    filterAndRender() {
        const period = document.getElementById('tt-filter-period').value;
        const worker = document.getElementById('tt-filter-worker').value;
        const project = document.getElementById('tt-filter-project').value;
        const stage = document.getElementById('tt-filter-stage')?.value || '';

        let filtered = [...this.entries];

        const now = new Date();
        if (period === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filtered = filtered.filter(e => new Date(e.date) >= weekAgo);
        } else if (period === 'month') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            filtered = filtered.filter(e => new Date(e.date) >= monthStart);
        }

        if (worker) filtered = filtered.filter(e => e.worker_name === worker);
        if (project) filtered = filtered.filter(e => e.project_name === project);
        if (stage) filtered = filtered.filter(e => this.stageKey(e) === stage);

        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        this.renderTable(filtered);
        this.renderProjectSummary(filtered);
        this.renderPlanFact(filtered);
        this.renderPayrollSummary();
    },

    parseHolidaySet() {
        const raw = String((App.settings && App.settings.production_holidays) || '').trim();
        if (!raw) return new Set();
        const parts = raw.split(/[,\n;]/).map(s => s.trim()).filter(Boolean);
        const set = new Set();
        parts.forEach(p => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(p)) set.add(p);
        });
        return set;
    },

    isWeekend(dateStr) {
        if (!dateStr) return false;
        const d = new Date(`${dateStr}T00:00:00`);
        const day = d.getDay();
        return day === 0 || day === 6;
    },

    normalizePayrollConfig(emp) {
        const fallbackRate = parseFloat(App.settings?.fot_per_hour) || 0;
        const baseHoursRaw = parseFloat(emp?.pay_base_hours_month);
        const baseSalary = parseFloat(emp?.pay_base_salary_month) || 0;
        const overtimeRateRaw = parseFloat(emp?.pay_overtime_hour_rate);
        const weekendRateRaw = parseFloat(emp?.pay_weekend_hour_rate);
        const holidayRateRaw = parseFloat(emp?.pay_holiday_hour_rate);

        // If no base salary — purely hourly employee, baseHours = 0
        const hasSalary = baseSalary > 0;
        const safeBaseHours = hasSalary ? (baseHoursRaw > 0 ? baseHoursRaw : 176) : 0;
        const baseRateFromSalary = (hasSalary && safeBaseHours > 0) ? (baseSalary / safeBaseHours) : 0;
        const overtimeRate = overtimeRateRaw > 0 ? overtimeRateRaw : (baseRateFromSalary || fallbackRate);
        const weekendRate = weekendRateRaw > 0 ? weekendRateRaw : overtimeRate;
        const holidayRate = holidayRateRaw > 0 ? holidayRateRaw : weekendRate;

        return {
            hasSalary,
            baseSalary,
            baseHours: safeBaseHours,
            baseRate: hasSalary ? (baseRateFromSalary || overtimeRate || fallbackRate) : 0,
            overtimeRate: overtimeRate || fallbackRate,
            weekendRate: weekendRate || fallbackRate,
            holidayRate: holidayRate || fallbackRate,
        };
    },

    formatMoney(v) {
        return `${(parseFloat(v) || 0).toLocaleString('ru-RU')} ₽`;
    },

    calculateProductionPayrollForCurrentMonth() {
        const now = new Date();
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
        const holidaySet = this.parseHolidaySet();
        const employeeByName = new Map((this.employees || []).map(e => [String(e.name || '').trim(), e]));

        const stats = new Map();
        (this.entries || []).forEach(entry => {
            const workerName = String(entry.worker_name || '').trim();
            if (!workerName) return;
            if (!String(entry.date || '').startsWith(monthPrefix)) return;

            const emp = employeeByName.get(workerName);
            if (!emp || emp.role !== 'production' || emp.is_active === false) return;
            const hours = parseFloat(entry.hours) || 0;
            if (hours <= 0) return;

            const isHoliday = holidaySet.has(entry.date);
            const isWeekend = this.isWeekend(entry.date);

            if (!stats.has(workerName)) {
                stats.set(workerName, { employee: emp, regularHours: 0, weekendHours: 0, holidayHours: 0 });
            }
            const row = stats.get(workerName);
            if (isHoliday) row.holidayHours += hours;
            else if (isWeekend) row.weekendHours += hours;
            else row.regularHours += hours;
        });

        const rows = Array.from(stats.values()).map(row => {
            const cfg = this.normalizePayrollConfig(row.employee);
            let inBaseHours, overtimeHours, payBase, payOvertime;

            if (cfg.hasSalary) {
                // Salaried: base salary covers first N hours, then overtime rate
                inBaseHours = Math.min(row.regularHours, cfg.baseHours);
                overtimeHours = Math.max(0, row.regularHours - cfg.baseHours);
                payBase = cfg.baseSalary * (inBaseHours / cfg.baseHours);
                payOvertime = overtimeHours * cfg.overtimeRate;
            } else {
                // Purely hourly: all regular hours at overtime rate
                inBaseHours = 0;
                overtimeHours = row.regularHours;
                payBase = 0;
                payOvertime = row.regularHours * cfg.overtimeRate;
            }

            const payWeekend = row.weekendHours * cfg.weekendRate;
            const payHoliday = row.holidayHours * cfg.holidayRate;
            const totalPay = payBase + payOvertime + payWeekend + payHoliday;

            return {
                employeeName: row.employee.name || 'Сотрудник',
                hasSalary: cfg.hasSalary,
                regularHours: row.regularHours,
                inBaseHours,
                overtimeHours,
                weekendHours: row.weekendHours,
                holidayHours: row.holidayHours,
                totalPay,
            };
        }).sort((a, b) => b.totalPay - a.totalPay);

        const total = rows.reduce((s, r) => s + r.totalPay, 0);
        return { rows, total };
    },

    renderPayrollSummary() {
        const tableBody = document.getElementById('tt-payroll-body');
        const totalEl = document.getElementById('tt-month-pay');
        const payrollCard = document.getElementById('tt-payroll-card');
        if (!tableBody) return;

        // Hide entire payroll section from non-admin
        const admin = App.isAdmin();
        if (payrollCard) payrollCard.style.display = admin ? '' : 'none';
        const payStatCard = document.getElementById('tt-pay-stat-card');
        if (payStatCard) payStatCard.style.display = admin ? '' : 'none';
        if (!admin) {
            if (totalEl) totalEl.textContent = '—';
            return;
        }

        const { rows, total } = this.calculateProductionPayrollForCurrentMonth();
        if (totalEl) totalEl.textContent = this.formatMoney(total);

        if (!rows.length) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Нет данных по производству за текущий месяц</td></tr>';
            return;
        }

        tableBody.innerHTML = rows.map(r => `
            <tr>
                <td style="font-weight:600;">${this.esc(r.employeeName)}</td>
                <td class="text-right">${r.regularHours.toFixed(2)}</td>
                <td class="text-right">${r.inBaseHours.toFixed(2)}</td>
                <td class="text-right">${r.overtimeHours.toFixed(2)}</td>
                <td class="text-right">${r.weekendHours.toFixed(2)}</td>
                <td class="text-right">${r.holidayHours.toFixed(2)}</td>
                <td class="text-right" style="font-weight:700;">${this.formatMoney(r.totalPay)}</td>
            </tr>
        `).join('');
    },

    renderTable(entries) {
        const tbody = document.getElementById('tt-table-body');

        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Нет записей</td></tr>';
            return;
        }

        tbody.innerHTML = entries.map(e => {
            const pctLabel = e.percentage ? ` <span style="color:var(--text-muted);font-size:11px">(${e.percentage}%)</span>` : '';
            const srcIcon = e.source === 'telegram' ? ' <span title="Из Telegram-бота" style="font-size:10px">&#128225;</span>' : '';
            return `
            <tr>
                <td>${App.formatDate(e.date)}</td>
                <td><b>${this.esc(e.worker_name)}</b>${srcIcon}</td>
                <td>${this.esc(e.project_name)}${e.order_id ? ' <span class="badge badge-blue" style="font-size:10px">заказ</span>' : ''}</td>
                <td>${this.esc(this.stageLabel(e))}</td>
                <td class="text-right"><b>${parseFloat(e.hours) || 0}</b> ч${pctLabel}</td>
                <td class="text-muted">${this.esc(this.stripMetaPrefix(e.description || ''))}</td>
                <td><button class="btn btn-sm btn-outline" onclick="TimeTrack.deleteEntry(${e.id})">&#10005;</button></td>
            </tr>`;
        }).join('');
    },

    renderProjectSummary(entries) {
        const container = document.getElementById('tt-project-summary');

        const byProject = {};
        entries.forEach(e => {
            const pn = e.project_name || 'Без проекта';
            if (!byProject[pn]) byProject[pn] = { hours: 0, workers: new Set() };
            byProject[pn].hours += parseFloat(e.hours) || 0;
            byProject[pn].workers.add(e.worker_name);
        });

        const projects = Object.entries(byProject).sort((a, b) => b[1].hours - a[1].hours);

        if (projects.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding:8px">Нет данных</p>';
            return;
        }

        const maxHours = Math.max(...projects.map(([_, v]) => v.hours));

        container.innerHTML = projects.map(([name, data]) => {
            const pct = maxHours > 0 ? (data.hours / maxHours * 100) : 0;
            return `
            <div style="margin-bottom:10px">
                <div class="flex-between" style="margin-bottom:2px">
                    <span style="font-size:13px; font-weight:600">${this.esc(name)}</span>
                    <span style="font-size:13px; font-weight:700">${data.hours.toFixed(2)} ч</span>
                </div>
                <div class="load-bar" style="height:6px">
                    <div class="load-bar-fill green" style="width:${pct}%"></div>
                </div>
                <div style="font-size:11px; color:var(--text-muted)">${data.workers.size} сотр.</div>
            </div>`;
        }).join('');
    },

    async renderPlanFact(filteredEntries) {
        const tbody = document.getElementById('tt-plan-fact-body');
        if (!tbody) return;

        const entries = (filteredEntries || []).filter(e => !!e.order_id);
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Нет данных</td></tr>';
            return;
        }

        const orderIds = [...new Set(entries.map(e => Number(e.order_id)).filter(Boolean))];
        const orders = await loadOrders({});
        const orderMap = new Map((orders || []).map(o => [Number(o.id), o]));

        const facts = new Map();
        orderIds.forEach(id => {
            facts.set(id, { casting: 0, assembly: 0, packaging: 0, other: 0 });
        });

        entries.forEach(e => {
            const orderId = Number(e.order_id);
            if (!facts.has(orderId)) return;
            const bucket = facts.get(orderId);
            const stage = this.stageKey(e);
            const hours = parseFloat(e.hours) || 0;
            if (stage === 'casting' || stage === 'trim') bucket.casting += hours;
            else if (stage === 'assembly') bucket.assembly += hours;
            else if (stage === 'packaging') bucket.packaging += hours;
            else bucket.other += hours;
        });

        const rows = orderIds.map(id => {
            const o = orderMap.get(id);
            if (!o) return '';
            const planCasting = parseFloat(o.production_hours_plastic) || 0;
            const planAssembly = parseFloat(o.production_hours_hardware) || 0;
            const planPackaging = parseFloat(o.production_hours_packaging) || 0;
            const planTotal = planCasting + planAssembly + planPackaging;

            const f = facts.get(id) || { casting: 0, assembly: 0, packaging: 0, other: 0 };
            const factTotal = f.casting + f.assembly + f.packaging + f.other;
            const delta = factTotal - planTotal;
            const deltaColor = delta > 0 ? 'var(--red)' : 'var(--green)';

            return `
            <tr>
                <td>${this.esc(o.order_name || `Заказ #${id}`)}</td>
                <td class="text-right">${planCasting.toFixed(2)}ч</td>
                <td class="text-right">${f.casting.toFixed(2)}ч</td>
                <td class="text-right">${planAssembly.toFixed(2)}ч</td>
                <td class="text-right">${f.assembly.toFixed(2)}ч</td>
                <td class="text-right">${planPackaging.toFixed(2)}ч</td>
                <td class="text-right">${f.packaging.toFixed(2)}ч</td>
                <td class="text-right" style="color:${deltaColor};font-weight:600;">${delta >= 0 ? '+' : ''}${delta.toFixed(2)}ч</td>
            </tr>`;
        }).filter(Boolean);

        tbody.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="8" class="text-center text-muted">Нет данных</td></tr>';
    },

    updateStats() {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const weekHours = this.entries
            .filter(e => new Date(e.date) >= weekAgo)
            .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);

        const monthHours = this.entries
            .filter(e => new Date(e.date) >= monthStart)
            .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);

        const workers = new Set(this.entries.map(e => e.worker_name)).size;
        const projects = new Set(this.entries.map(e => e.project_name)).size;

        document.getElementById('tt-week-hours').textContent = weekHours.toFixed(1);
        document.getElementById('tt-month-hours').textContent = monthHours.toFixed(1);
        document.getElementById('tt-workers-count').textContent = workers;
        document.getElementById('tt-projects-count').textContent = projects;
        this.renderPayrollSummary();
    },

    // === CRUD ===

    async saveEntry() {
        const workerName = document.getElementById('tt-worker-name').value.trim();
        const projectSelect = document.getElementById('tt-project-select');
        const hours = parseFloat(document.getElementById('tt-hours').value) || 0;
        const date = document.getElementById('tt-date').value;
        const comment = document.getElementById('tt-description').value.trim();

        const stage = document.getElementById('tt-stage')?.value || 'casting';
        const stageOther = document.getElementById('tt-stage-other')?.value.trim() || '';
        const stageLabel = stage === 'other' ? (stageOther || 'Другое') : (TT_STAGE_LABELS[stage] || stage);

        if (!workerName) { App.toast('Укажите сотрудника'); return; }
        if (hours <= 0) { App.toast('Укажите количество часов'); return; }
        if (!date) { App.toast('Укажите дату'); return; }
        if (stage === 'other' && !stageOther) { App.toast('Укажите этап для "Другое"'); return; }

        const projectValue = projectSelect.value;
        let projectName = '';
        let orderId = null;

        if (projectValue === '__general') {
            projectName = 'Общие работы';
        } else if (projectValue) {
            orderId = parseInt(projectValue, 10);
            projectName = projectSelect.options[projectSelect.selectedIndex].textContent;
        } else {
            App.toast('Выберите проект');
            return;
        }

        // Find employee_id by name
        const matchedEmp = (this.employees || []).find(e => e.name === workerName);
        const entry = {
            employee_id: matchedEmp ? matchedEmp.id : null,
            worker_name: workerName,
            project_name: projectName,
            order_id: orderId,
            hours,
            date,
            description: this.buildDescriptionWithMeta(stage, stageLabel, comment, projectName),
        };

        await saveTimeEntry(entry);
        App.toast('Запись добавлена');

        document.getElementById('tt-hours').value = '';
        document.getElementById('tt-description').value = '';
        const stageOtherEl = document.getElementById('tt-stage-other');
        if (stageOtherEl) stageOtherEl.value = '';

        this.load();
    },

    async deleteEntry(id) {
        if (!confirm('Удалить запись?')) return;
        await deleteTimeEntry(id);
        App.toast('Запись удалена');
        this.load();
    },

    esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};
