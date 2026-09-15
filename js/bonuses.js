// Страница «Бонусы»: только владелец. Данные и расчёт приходят из
// /api/bonuses/*; здесь выбор периода, отрисовка и действия.
// Спека: docs/specs/2026-09-09-bonuses-production-manager.md

const BONUSES_API_URL = (typeof PLATFORM_API_URL !== 'undefined') ? PLATFORM_API_URL : 'https://api.recycleobject.ru';

const BONUSES_CSS = `
.bn-page{font-size:16px;line-height:1.45;max-width:1100px;padding:8px 4px 40px}
.bn-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.bn-title{font-size:26px;margin:0}
.bn-periods{display:flex;gap:6px;flex-wrap:wrap}
.bn-period{border:1px solid #d0d7de;background:#fff;border-radius:999px;padding:6px 14px;font-size:15px;cursor:pointer}
.bn-period.active{background:#1f6feb;border-color:#1f6feb;color:#fff}
.bn-cards{display:flex;flex-direction:column;gap:18px}
.bn-card{border:1px solid #d0d7de;border-radius:12px;background:#fff;padding:18px 20px}
.bn-card-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.bn-name{font-size:22px;font-weight:600}
.bn-status{font-size:14px;color:#57606a}
.bn-total{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.bn-total small{display:block;font-size:14px;font-weight:400;color:#57606a}
.bn-row{display:grid;grid-template-columns:200px 1fr 150px 110px;gap:14px;align-items:center;padding:12px 0 18px;border-top:1px solid #eaeef2}
.bn-output{padding-top:16px}
.bn-label{font-weight:600}
.bn-label span{display:block;font-size:13px;color:#57606a;font-weight:400}
.bn-track{position:relative;height:14px;background:#eef1f4;border-radius:7px}
.bn-fill{position:absolute;left:0;top:0;bottom:0;background:#2da44e;border-radius:7px}
.bn-fill.below{background:#cf222e}.bn-fill.mid{background:#bf8700}
.bn-tick{position:absolute;top:-6px;width:2px;height:26px;background:#24292f}
.bn-tick-label{position:absolute;top:22px;transform:translateX(-50%);font-size:12px;color:#57606a;white-space:nowrap}
.bn-fact{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.bn-fact span{display:block;font-size:13px;color:#57606a;font-weight:400}
.bn-ach{font-size:18px;font-variant-numeric:tabular-nums}
.bn-ach span{display:block;font-size:13px;color:#57606a}
.bn-formula{margin-top:8px;padding:10px 14px;background:#f6f8fa;border-radius:8px;font-size:17px;font-variant-numeric:tabular-nums}
.bn-level{background:#eef6ff;border-radius:8px;padding:8px 14px;font-size:16px;margin:6px 0 4px;font-variant-numeric:tabular-nums}
.bn-muted{color:#57606a}
.bn-warnings{margin-top:12px;padding:10px 14px;background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;font-size:15px}
.bn-warnings li{margin:2px 0}
.bn-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.bn-btn{border:1px solid #d0d7de;background:#f6f8fa;border-radius:8px;padding:8px 14px;font-size:15px;cursor:pointer}
.bn-btn.primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
.bn-btn[disabled]{opacity:.5;cursor:default}
.bn-card-details{margin-top:14px;border-top:1px dashed #d0d7de;padding-top:12px}
.bn-table{width:100%;border-collapse:collapse;font-size:15px}
.bn-table th,.bn-table td{padding:6px 8px;text-align:left;border-bottom:1px solid #eaeef2;vertical-align:top}
.bn-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.bn-team{border:1px solid #d0d7de;border-radius:12px;background:#f6f8fa;padding:16px 20px;margin-bottom:18px}
.bn-team-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.bn-team-title{font-size:18px;font-weight:600}
.bn-people,.bn-year,.bn-history{margin-top:24px}
.bn-flag-timesheet_gaps,.bn-flag-unmarked{background:#fff8c5}
.bn-flag-slow{background:#ffebe9;color:#a40e26;font-weight:600}
.bn-flag-fast{background:#dafbe1}
.bn-h2{font-size:20px;margin:0 0 10px}
.bn-dialog{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:1000}
.bn-dialog-box{background:#fff;border-radius:12px;padding:20px 22px;min-width:460px;max-width:92vw;font-size:16px}
.bn-dialog-box label{display:block;margin:8px 0 4px}
.bn-dialog-box input,.bn-dialog-box select{width:100%;font-size:16px;padding:6px 8px;border:1px solid #d0d7de;border-radius:6px;box-sizing:border-box}
.bn-targets-grid{display:grid;grid-template-columns:220px repeat(3,1fr);gap:8px;align-items:center}
@media (max-width:800px){.bn-row{grid-template-columns:1fr 1fr} .bn-track{grid-column:1/-1;margin-bottom:18px} .bn-dialog-box{min-width:0;width:94vw}}
`;

function bonusesCurrentPeriod(date = new Date()) {
    return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function bonusesPeriodOptions(date = new Date()) {
    const options = [];
    let year = date.getFullYear();
    let q = Math.floor(date.getMonth() / 3) + 1;
    for (let i = 0; i < 8; i += 1) {
        options.unshift(`${year}-Q${q}`);
        q -= 1;
        if (q === 0) { q = 4; year -= 1; }
    }
    return options;
}

function bonusesEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function bonusesNum(value, digits = 0) {
    return Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/ /g, ' ');
}

function formatRub(value) {
    return `${bonusesNum(Math.round(Number(value) || 0))} ₽`;
}

function formatMoney(value) {
    return `${bonusesNum(Math.round(Number(value) || 0))} ₽`;
}

function formatHours(value) {
    return `${bonusesNum(Math.round(Number(value) || 0))} ч`;
}

function formatMetricValue(key, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    switch (key) {
        case 'output_hours': return formatHours(value);
        case 'productivity': return bonusesNum(value, 2);
        case 'on_time_share':
        case 'rework_share': return `${Math.round(Number(value) * 100)}%`;
        case 'cash_in': return formatMoney(value);
        default: return String(value);
    }
}

function bonusesTrackPercent(value, thresholds, direction) {
    const lower = direction === 'lower';
    const lo = lower ? Number(thresholds.max) : Number(thresholds.min);
    const hi = lower ? Number(thresholds.min) : Number(thresholds.max);
    const span = hi - lo || 1;
    const v = lower ? (hi - Number(value)) + lo : Number(value);
    return Math.max(0, Math.min(1, ((v - lo) / span) * 0.8 + 0.1)) * 100;
}

function renderLevelBar(thresholds, fact, direction, key, achievement) {
    if (!thresholds) return '<div class="bn-track"></div>';
    const ach = Number(achievement) || 0;
    const fillClass = ach === 0 ? 'below' : (ach < 1 ? 'mid' : '');
    const fill = fact === null || fact === undefined ? '' : `<div class="bn-fill ${fillClass}" style="width:${bonusesTrackPercent(fact, thresholds, direction).toFixed(1)}%"></div>`;
    const ticks = ['min', 'target', 'max'].map((k) => {
        const pct = bonusesTrackPercent(thresholds[k], thresholds, direction).toFixed(1);
        return `<div class="bn-tick" style="left:${pct}%"></div><div class="bn-tick-label" style="left:${pct}%">${bonusesEscape(formatMetricValue(key, thresholds[k]))}</div>`;
    }).join('');
    return `<div class="bn-track">${fill}${ticks}</div>`;
}

function renderOutputRow(output, rate) {
    const thresholds = output.thresholdsEffective || output.thresholds || null;
    const forecast = output.forecast !== null && output.forecast !== undefined
        ? `<span>прогноз ${bonusesEscape(formatHours(output.forecast))}, если темп сохранится</span>`
        : '';
    const scaled = output.thresholdsEffective && output.thresholds && output.thresholdsEffective.target !== output.thresholds.target
        ? `<span>продано ${bonusesEscape(formatHours(output.soldHours))} из плана ${bonusesEscape(formatHours(output.thresholds.target))}, уровни пересчитаны</span>`
        : '<span>base / medium / aspiration</span>';
    const level = output.achievement === null || output.achievement === undefined ? '—' : bonusesNum(output.achievement, 2);
    return `<div class="bn-row bn-output">
        <div class="bn-label">Выпуск, нормо-часы${scaled}</div>
        ${renderLevelBar(thresholds, output.fact, 'higher', 'output_hours', output.achievement)}
        <div class="bn-fact">${bonusesEscape(formatHours(output.fact))}${forecast}</div>
        <div class="bn-ach">${level}<span>уровень по часам</span></div>
    </div>`;
}

function renderLevelRow(entry) {
    const outA = entry.output?.achievement;
    const cashA = entry.money?.achievement;
    if (outA === null || outA === undefined) return '';
    let formula;
    if (cashA === null || cashA === undefined) {
        formula = `уровень квартала ${bonusesNum(entry.level, 2)} = уровень по часам (план по деньгам не задан)`;
    } else {
        const blend = entry.money?.blend;
        formula = `уровень квартала = max(часы ${bonusesNum(outA, 2)}; 0,7 × ${bonusesNum(outA, 2)} + 0,3 × ${bonusesNum(cashA, 2)} = ${bonusesNum(blend, 2)}) = ${bonusesNum(entry.level, 2)}`;
    }
    return `<div class="bn-level">${formula} → ставка ${bonusesNum(entry.output.rateApplied, 2)} ₽/ч из ${bonusesNum(entry.rate)}</div>`;
}

function renderQualityRow(metric) {
    const weightPct = Math.round((Number(metric.weight) || 0) * 100);
    const fact = metric.available ? bonusesEscape(formatMetricValue(metric.key, metric.fact)) : '<span class="bn-muted">нет данных</span>';
    return `<div class="bn-row" data-metric="${bonusesEscape(metric.key)}">
        <div class="bn-label">${bonusesEscape(metric.label)}<span>${weightPct === 0 ? 'информация, в деньги не входит' : `вес ${weightPct}%`}${metric.direction === 'lower' ? ' · меньше лучше' : ''}</span></div>
        ${renderLevelBar(metric.thresholds, metric.available ? metric.fact : null, metric.direction, metric.key, metric.achievement)}
        <div class="bn-fact">${fact}</div>
        <div class="bn-ach">${Math.round((Number(metric.achievement) || 0) * 100)}%</div>
    </div>`;
}

const BONUSES_WARNING_TEXT = {
    no_hours: (w) => `Заказы без нормо-часов, в выпуск не вошли: ${w.count}`,
    no_deadline: (w) => `Заказы без дедлайна, не учтены в «В срок»: ${w.count}`,
    estimated_dates: (w) => `Дата завершения оценочная (по табелю или последнему изменению): ${w.count}`,
    unmarked_hours: (w) => `Часы табеля без заказа: ${bonusesEscape(bonusesNum(w.hours, w.hours % 1 ? 1 : 0))} ч`,
    no_timesheet: () => 'Табель по завершённым заказам пустой: производительность взята по минимуму (0,5)',
    no_deadline_orders: () => 'Нет завершённых заказов с дедлайном: «В срок» взято нейтрально (1,0)',
    no_period_hours: () => 'Нет часов табеля за период: «Переделки» взяты нейтрально (1,0)',
    no_money_plan: () => 'План по деньгам за квартал не задан: уровень считается только по часам',
    sold_below_plan: (w) => `Продано меньше плана: ${bonusesEscape(formatHours(w.hours))}, уровни пересчитаны от проданного`,
    timesheet_gaps: (w) => `Дни без табеля: ${w.count}. ${(w.byEmployee || []).map((e) => `${bonusesEscape(e.name)}: ${e.days}`).join(', ')}`,
};

function renderWarnings(warnings) {
    if (!Array.isArray(warnings) || !warnings.length) return '';
    const items = warnings.map((w) => {
        const text = (BONUSES_WARNING_TEXT[w.code] || (() => w.code))(w);
        const ids = Array.isArray(w.orderIds) && w.orderIds.length
            ? ' ' + w.orderIds.map((id) => `<a href="#order-detail/${bonusesEscape(id)}">#${bonusesEscape(id)}</a>`).join(', ')
            : '';
        return `<li>${text}${ids}</li>`;
    }).join('');
    return `<div class="bn-warnings"><ul style="margin:0;padding-left:18px">${items}</ul></div>`;
}

function bonusesStatusLabel(status) {
    return { open: 'открыт', closed: 'закрыт', paid: 'выплачен' }[status] || status;
}

function renderOrdersTable(entry) {
    const rows = (entry.orders || []).map((o) => {
        const stock = o.purpose === 'stock_sample';
        const approve = stock
            ? `<label><input type="checkbox" class="bn-approve" data-order="${bonusesEscape(o.id)}" ${o.approved ? 'checked' : ''} ${entry.resultStatus !== 'open' ? 'disabled' : ''}> в зачёт</label>`
            : (o.included ? 'да' : 'нет');
        const onTime = o.onTime === null ? '—' : (o.onTime ? 'да' : 'нет');
        return `<tr>
            <td><a href="#order-detail/${bonusesEscape(o.id)}">${bonusesEscape(o.name || `#${o.id}`)}</a>${stock ? ' <span class="bn-muted">склад</span>' : ''}</td>
            <td class="num">${formatHours(o.hoursPlan)}</td>
            <td class="num">${formatHours(o.hoursFact)}</td>
            <td>${bonusesEscape(o.deadline || '—')}</td>
            <td>${bonusesEscape(o.completedAt || '—')}${o.estimated ? ' <span class="bn-muted">оценочно</span>' : ''}</td>
            <td>${onTime}</td>
            <td>${approve}</td>
        </tr>`;
    }).join('');
    return `<table class="bn-table"><thead><tr>
        <th>Заказ</th><th>Нормо-часы</th><th>Табель</th><th>Дедлайн</th><th>Завершён</th><th>В срок</th><th>В зачёт</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7" class="bn-muted">Завершённых заказов в периоде нет</td></tr>'}</tbody></table>`;
}

function renderBonusCard(entry, options = {}) {
    const expanded = options.expanded === true;
    const open = entry.resultStatus === 'open';
    const output = entry.output || {};
    const quality = entry.quality || { multiplier: 0, metrics: [] };
    const total = entry.amountFinal !== null && entry.amountFinal !== undefined && Number(entry.amountFinal) !== Number(entry.amountComputed)
        ? `${formatRub(entry.amountFinal)}<small>расчёт ${formatRub(entry.amountComputed)}</small>`
        : `${formatRub(entry.amountComputed)}${output.forecastAmount ? `<small>прогноз ${formatRub(output.forecastAmount)}</small>` : ''}`;
    const drift = entry.targetsDrift ? '<div class="bn-warnings">Сезонный план изменился после сохранения целей. Откройте «Цели квартала», чтобы пересохранить.</div>' : '';
    const noTargets = !entry.hasTargets ? '<div class="bn-warnings">Цели квартала не заданы. Нажмите «Цели квартала».</div>' : '';
    const formula = entry.hasTargets
        ? `<div class="bn-formula">${bonusesEscape(formatHours(output.fact))} × ${bonusesNum(output.rateApplied, 2)} ₽ × ${bonusesNum(quality.multiplier, 2)} = <b>${formatRub(entry.amountComputed)}</b></div>`
        : '';
    const actions = `<div class="bn-actions">
        <button class="bn-btn" data-action="toggle" data-scheme="${entry.schemeId}">${expanded ? 'Скрыть детали' : 'Детали'}</button>
        <button class="bn-btn" data-action="targets" data-scheme="${entry.schemeId}" ${open ? '' : 'disabled'}>Цели квартала</button>
        <button class="bn-btn" data-action="scheme" data-scheme="${entry.schemeId}" data-employee="${entry.employeeId}">Ставка</button>
        ${open ? `<button class="bn-btn primary" data-action="close" data-scheme="${entry.schemeId}" ${entry.hasTargets ? '' : 'disabled'}>Закрыть квартал</button>` : ''}
        ${entry.resultStatus === 'closed' ? `<button class="bn-btn" data-action="adjust" data-scheme="${entry.schemeId}">Корректировка</button><button class="bn-btn primary" data-action="paid" data-scheme="${entry.schemeId}">Выплачено</button>` : ''}
    </div>`;
    const adjustments = (entry.adjustments || []).map((a) => `<li>${bonusesEscape(String(a.at).slice(0, 10))}: ${formatRub(a.from)} → ${formatRub(a.to)}. ${bonusesEscape(a.comment)}</li>`).join('');
    const details = expanded ? `<div class="bn-card-details">
        ${renderOrdersTable(entry)}
        ${adjustments ? `<h3 class="bn-h2" style="margin-top:14px">Корректировки</h3><ul>${adjustments}</ul>` : ''}
    </div>` : '';
    return `<div class="bn-card" data-scheme="${entry.schemeId}">
        <div class="bn-card-head">
            <div><div class="bn-name">${bonusesEscape(entry.employeeName || `Схема #${entry.schemeId}`)}</div>
            <div class="bn-status">производство · ставка ${bonusesNum(entry.rate)} ₽ за нормо-час на уровне medium · период ${bonusesStatusLabel(entry.resultStatus)}</div></div>
            <div class="bn-total">${total}</div>
        </div>
        ${noTargets}${drift}
        ${renderOutputRow(output, entry.rate)}
        ${renderLevelRow(entry)}
        ${(quality.metrics || []).map(renderQualityRow).join('')}
        <div class="bn-row"><div class="bn-label">Множитель качества</div><div></div><div class="bn-fact">${bonusesNum(quality.multiplier, 2)}</div><div></div></div>
        ${formula}
        ${renderWarnings(entry.warnings)}
        ${actions}
        ${details}
    </div>`;
}

function renderTeamBlock(team, period) {
    const c = team?.commercial || {};
    const thresholds = c.targets?.cash_in || null;
    const fact = c.facts?.cash_in || null;
    const button = '<button class="bn-btn" data-action="team-money">План и факт по деньгам</button>';
    if (!thresholds) {
        return `<div class="bn-team"><div class="bn-team-head"><div class="bn-team-title">Деньги квартала ${bonusesEscape(period)}</div>${button}</div>
            <div class="bn-warnings">План по деньгам за квартал не задан. Уровень производства считается только по часам.</div></div>`;
    }
    const ach = c.cashAchievement;
    const factHtml = fact
        ? `<div class="bn-fact">${formatMoney(fact.value)}<span>${bonusesEscape(fact.note || 'Финтабло, направление Recycle Object')} · ${bonusesEscape(String(fact.updated_at || '').slice(0, 10))}</span></div>`
        : '<div class="bn-fact bn-muted">факт не введён</div>';
    return `<div class="bn-team"><div class="bn-team-head"><div class="bn-team-title">Деньги квартала ${bonusesEscape(period)} · поступления Recycle Object по Финтабло</div>${button}</div>
        <div class="bn-row" style="border-top:0">
            <div class="bn-label">План отдела<span>base / medium / aspiration</span></div>
            ${renderLevelBar(thresholds, fact ? fact.value : null, 'higher', 'cash_in', ach)}
            ${factHtml}
            <div class="bn-ach">${ach === null || ach === undefined ? '—' : `уровень ${bonusesNum(ach, 2)}`}<span>деньги только поднимают уровень</span></div>
        </div></div>`;
}

function renderPeopleBlock(people) {
    if (!people) return '';
    const rows = (people.people || []).map((p) => {
        const flag = (code) => (p.flags || []).includes(code) ? ` bn-flag-${code}` : '';
        return `<tr>
            <td>${bonusesEscape(p.name)}</td>
            <td class="num${flag('timesheet_gaps')}">${p.loggedDays} из ${p.workingDays}</td>
            <td class="num">${bonusesNum(p.hours, 1)}</td>
            <td class="num${flag('unmarked')}">${p.orderShare === null || p.orderShare === undefined ? '—' : `${Math.round(p.orderShare * 100)}%`}</td>
            <td class="num">${bonusesNum(p.unmarkedHours, 1)}</td>
            <td class="num">${bonusesNum(p.reworkHours, 1)}</td>
            <td class="num${flag('slow')}${flag('fast')}">${p.productivity === null || p.productivity === undefined ? '—' : bonusesNum(p.productivity, 2)}</td>
        </tr>`;
    }).join('');
    const h = people.headcount || {};
    const o = people.outlook || {};
    const delta = (o.deltaPersonDays || 0) >= 0 ? `свободно ${o.deltaPersonDays || 0} человеко-дней` : `не хватает ${Math.abs(o.deltaPersonDays)} человеко-дней`;
    const hasTiers = h.loadMedium !== null && h.loadMedium !== undefined;
    return `<div class="bn-people"><h2 class="bn-h2">Люди</h2>
        <table class="bn-table"><thead><tr><th>Сотрудник</th><th>Дни с табелем</th><th>Часы</th><th>По заказам</th><th>Без заказа</th><th>Переделки</th><th>Производительность</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="bn-muted">Нет производственных сотрудников</td></tr>'}</tbody></table>
        <div class="bn-formula">Состав: ${h.people || 0} чел. × ${h.hoursPerDay || 9} ч × ${h.workingDays || 0} дн. = ${bonusesNum(h.capacity)} ч.
            ${hasTiers ? `Загрузка на medium ${Math.round(h.loadMedium * 100)}%, на aspiration ${Math.round(h.loadAspiration * 100)}%. При текущей производительности нужно ${bonusesNum(h.needMedium, 1)} чел. на medium и ${bonusesNum(h.needAspiration, 1)} на aspiration.` : 'Уровни квартала не заданы.'}</div>
        <div class="bn-formula">До конца квартала: продано и не сделано ${bonusesNum(o.remainingSoldHours)} ч, мощность ${bonusesNum(o.remainingCapacity)} ч за ${o.remainingWorkingDays || 0} рабочих дней → <b>${delta}</b>.</div>
    </div>`;
}

function renderHistory(history, entries) {
    if (!Array.isArray(history) || !history.length) return '<h2 class="bn-h2">Журнал</h2><div class="bn-muted">Закрытых периодов пока нет</div>';
    const names = new Map((entries || []).map((e) => [e.schemeId, e.employeeName]));
    const rows = history.map((h) => `<tr>
        <td>${bonusesEscape(h.period)}</td><td>${bonusesEscape(names.get(h.schemeId) || h.schemeId)}</td>
        <td class="num">${formatRub(h.amountComputed)}</td><td class="num">${formatRub(h.amountFinal)}</td>
        <td>${bonusesStatusLabel(h.status)}</td>
        <td>${(h.adjustments || []).map((a) => bonusesEscape(a.comment)).join('; ')}</td>
    </tr>`).join('');
    return `<h2 class="bn-h2">Журнал</h2><table class="bn-table"><thead><tr>
        <th>Период</th><th>Сотрудник</th><th>Расчёт</th><th>Итог</th><th>Статус</th><th>Комментарии</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderYear(yearData, year) {
    if (!Array.isArray(yearData) || !yearData.length) return '';
    const rows = yearData.map((e) => {
        const q = e.year.quarters.map((x) => `<td class="num">${x.fact === null ? '—' : formatHours(x.fact)}</td>`).join('');
        return `<tr><td>${bonusesEscape(e.employeeName)}</td>${q}
            <td class="num">${formatHours(e.year.factSum)} / ${formatHours(e.year.thresholdsSum.target)}</td>
            <td class="num">${e.year.achievement === null ? '—' : bonusesNum(e.year.achievement, 2)}</td>
            <td class="num">${formatRub(e.year.topUp)}</td>
            <td><button class="bn-btn" data-action="close-year" data-scheme="${e.schemeId}" ${e.year.quartersCounted === 4 ? '' : 'disabled'}>Закрыть год</button></td></tr>`;
    }).join('');
    return `<h2 class="bn-h2">Год ${year}: выпуск</h2><table class="bn-table"><thead><tr>
        <th>Сотрудник</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Факт / medium</th><th>Уровень года</th><th>Добор</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

const Bonuses = {
    period: null,
    data: null,
    yearData: null,
    expanded: new Set(),
    _cssInjected: false,
    _bound: false,

    async api(method, path, body) {
        const options = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) options.body = JSON.stringify(body);
        const res = await fetch(`${BONUSES_API_URL}/api/bonuses${path}`, options);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error?.message || `Ошибка API ${res.status}`);
        return json.data;
    },

    injectCss() {
        if (this._cssInjected || typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.textContent = BONUSES_CSS;
        document.head.appendChild(style);
        this._cssInjected = true;
    },

    async load() {
        if (typeof App !== 'undefined' && typeof App.isOwner === 'function' && !App.isOwner()) { App.navigate('orders'); return; }
        this.injectCss();
        this.bind();
        if (!this.period) this.period = bonusesCurrentPeriod();
        this.renderPeriods();
        const cards = document.getElementById('bonuses-cards');
        cards.innerHTML = '<div class="bn-muted">Загрузка…</div>';
        try {
            const year = Number(this.period.slice(0, 4));
            [this.data, this.yearData] = await Promise.all([this.api('GET', `/periods/${this.period}`), this.api('GET', `/years/${year}`)]);
            this.render();
        } catch (e) {
            cards.innerHTML = `<div class="bn-warnings">${bonusesEscape(e.message)}</div>`;
        }
    },

    renderPeriods() {
        const box = document.getElementById('bonuses-periods');
        box.innerHTML = bonusesPeriodOptions().map((p) => `<button class="bn-period ${p === this.period ? 'active' : ''}" data-period="${p}">${p.replace('-Q', ' · Q')}</button>`).join('');
    },

    render() {
        const entries = this.data?.entries || [];
        document.getElementById('bonuses-team').innerHTML = renderTeamBlock(this.data?.team, this.period);
        document.getElementById('bonuses-cards').innerHTML = (entries.length
            ? entries.map((e) => renderBonusCard(e, { expanded: this.expanded.has(e.schemeId) })).join('')
            : '<div class="bn-muted">Схем пока нет.</div>')
            + '<div class="bn-actions"><button class="bn-btn" data-action="new-scheme">Новая схема</button></div>';
        document.getElementById('bonuses-people').innerHTML = renderPeopleBlock(this.data?.people);
        document.getElementById('bonuses-year').innerHTML = renderYear(this.yearData, Number(this.period.slice(0, 4)));
        document.getElementById('bonuses-history').innerHTML = renderHistory(this.data?.history, entries);
    },

    bind() {
        if (this._bound) return;
        this._bound = true;
        const page = document.getElementById('page-bonuses');
        page.addEventListener('click', (event) => {
            const periodBtn = event.target.closest('[data-period]');
            if (periodBtn) { this.period = periodBtn.dataset.period; this.load(); return; }
            const btn = event.target.closest('[data-action]');
            if (btn) this.handleAction(btn.dataset.action, Number(btn.dataset.scheme), btn.dataset);
        });
        page.addEventListener('change', (event) => {
            const cb = event.target.closest('.bn-approve');
            if (!cb) return;
            this.api('POST', `/periods/${this.period}/stock-approvals`, { order_id: Number(cb.dataset.order), approved: cb.checked })
                .then(() => this.load())
                .catch((e) => App.toast(e.message));
        });
    },

    async handleAction(action, schemeId, dataset = {}) {
        try {
            if (action === 'toggle') {
                if (this.expanded.has(schemeId)) this.expanded.delete(schemeId); else this.expanded.add(schemeId);
                this.render();
            } else if (action === 'targets') {
                await this.openTargetsDialog(schemeId);
            } else if (action === 'scheme') {
                await this.openSchemeDialog(Number(dataset.employee), schemeId);
            } else if (action === 'team-money') {
                await this.openTeamDialog();
            } else if (action === 'close') {
                if (!confirm('Закрыть квартал? Факт зафиксируется и больше не пересчитается.')) return;
                await this.api('POST', `/periods/${this.period}/close/${schemeId}`, {});
                App.toast('Квартал закрыт');
                await this.load();
            } else if (action === 'adjust') {
                const amount = prompt('Итоговая сумма, ₽');
                if (amount === null) return;
                const comment = prompt('Комментарий (обязательно)');
                if (!comment) { App.toast('Без комментария корректировка не сохраняется'); return; }
                await this.api('POST', `/periods/${this.period}/adjust/${schemeId}`, { amount: Number(String(amount).replace(/\s/g, '')), comment });
                await this.load();
            } else if (action === 'paid') {
                await this.api('POST', `/periods/${this.period}/paid/${schemeId}`, {});
                await this.load();
            } else if (action === 'close-year') {
                if (!confirm('Закрыть год и зафиксировать добор?')) return;
                await this.api('POST', `/years/${this.period.slice(0, 4)}/close/${schemeId}`, {});
                App.toast('Год закрыт');
                await this.load();
            } else if (action === 'new-scheme') {
                await this.openSchemeDialog();
            }
        } catch (e) {
            App.toast(e.message);
        }
    },

    async openSchemeDialog(employeeId = null, schemeId = null) {
        const employees = await this.api('GET', '/employees');
        const current = (this.data?.entries || []).find((e) => e.schemeId === schemeId);
        const options = employees.map((e) => `<option value="${e.id}" ${Number(e.id) === Number(employeeId) ? 'selected' : ''}>${bonusesEscape(e.name)}</option>`).join('');
        const box = this.dialog(`<h2 class="bn-h2">Схема производства</h2>
            <label>Сотрудник</label><select id="bn-scheme-employee" ${employeeId ? 'disabled' : ''}>${options}</select>
            <label>Ставка за нормо-час на уровне medium, ₽</label><input id="bn-scheme-rate" type="number" value="${current ? current.rate : 75}">
            <div class="bn-muted" style="margin-top:6px">base = ставка × 0,5; aspiration = ставка × 1,5; ниже base 0</div>
            <div class="bn-actions"><button class="bn-btn primary" id="bn-scheme-save">Сохранить</button><button class="bn-btn" data-dialog-close>Отмена</button></div>`);
        box.querySelector('#bn-scheme-save').addEventListener('click', async () => {
            try {
                const targetEmployee = employeeId || Number(box.querySelector('#bn-scheme-employee').value);
                const rate = Number(box.querySelector('#bn-scheme-rate').value);
                await this.api('PUT', `/schemes/${targetEmployee}`, { kind: 'production', rate });
                box.remove();
                await this.load();
            } catch (e) {
                App.toast(e.message);
            }
        });
    },

    async openTargetsDialog(schemeId) {
        const entry = (this.data?.entries || []).find((e) => e.schemeId === schemeId);
        const suggestion = await this.api('GET', `/periods/${this.period}/suggest/${schemeId}`);
        const current = {};
        if (entry?.output?.thresholds) current.output_hours = entry.output.thresholds;
        for (const m of entry?.quality?.metrics || []) if (m.thresholds && entry.hasTargets) current[m.key] = m.thresholds;
        const keys = ['output_hours', 'productivity', 'on_time_share', 'rework_share'];
        const labels = { output_hours: 'Выпуск, ч (base / medium / aspiration)', productivity: 'Производительность', on_time_share: 'В срок (0–1)', rework_share: 'Переделки (0–1)' };
        const row = (key, values) => `<div>${labels[key]}</div>` + ['min', 'target', 'max'].map((k) => `<input type="number" step="any" data-key="${key}" data-k="${k}" value="${values?.[k] ?? ''}">`).join('');
        const box = this.dialog(`<h2 class="bn-h2">Цели ${this.period}</h2>
            <div class="bn-muted">Источник подсказки: ${suggestion.source === 'plan' ? 'сезонный план' : 'формула из настроек'}</div>
            <div class="bn-targets-grid"><div></div><div>мин / base</div><div>цель / medium</div><div>макс / aspiration</div>${keys.map((k) => row(k, current[k] || suggestion.targets[k])).join('')}</div>
            <div class="bn-actions"><button class="bn-btn" id="bn-targets-suggest">Взять из сезонного плана</button><button class="bn-btn primary" id="bn-targets-save">Сохранить</button><button class="bn-btn" data-dialog-close>Отмена</button></div>`);
        box.querySelector('#bn-targets-suggest').addEventListener('click', () => {
            box.querySelectorAll('input[data-key]').forEach((input) => { input.value = suggestion.targets[input.dataset.key][input.dataset.k]; });
        });
        box.querySelector('#bn-targets-save').addEventListener('click', async () => {
            try {
                const targets = {};
                box.querySelectorAll('input[data-key]').forEach((input) => {
                    targets[input.dataset.key] = targets[input.dataset.key] || {};
                    targets[input.dataset.key][input.dataset.k] = Number(input.value);
                });
                await this.api('PUT', `/periods/${this.period}/targets/${schemeId}`, { targets });
                box.remove();
                await this.load();
            } catch (e) {
                App.toast(e.message);
            }
        });
    },

    async openTeamDialog() {
        const current = await this.api('GET', `/periods/${this.period}/team/commercial`);
        const t = current.targets?.cash_in || {};
        const f = current.facts?.cash_in || {};
        const box = this.dialog(`<h2 class="bn-h2">Деньги квартала ${this.period}</h2>
            <div class="bn-targets-grid"><div>План, ₽</div><div>base</div><div>medium</div><div>aspiration</div>
            <div></div><input id="bn-team-min" type="number" value="${t.min ?? ''}"><input id="bn-team-target" type="number" value="${t.target ?? ''}"><input id="bn-team-max" type="number" value="${t.max ?? ''}"></div>
            <label>Факт: поступления Recycle Object по Финтабло, ₽</label><input id="bn-team-fact" type="number" value="${f.value ?? ''}">
            <label>Комментарий (откуда цифра, дата)</label><input id="bn-team-note" type="text" value="${bonusesEscape(f.note || '')}">
            <div class="bn-actions"><button class="bn-btn primary" id="bn-team-save">Сохранить</button><button class="bn-btn" data-dialog-close>Отмена</button></div>`);
        box.querySelector('#bn-team-save').addEventListener('click', async () => {
            try {
                const body = {};
                const min = Number(box.querySelector('#bn-team-min').value);
                const target = Number(box.querySelector('#bn-team-target').value);
                const max = Number(box.querySelector('#bn-team-max').value);
                if ([min, target, max].every((v) => Number.isFinite(v) && v > 0)) body.targets = { cash_in: { min, target, max } };
                const factValue = box.querySelector('#bn-team-fact').value;
                if (factValue !== '') body.facts = { cash_in: { value: Number(factValue), note: box.querySelector('#bn-team-note').value } };
                await this.api('PUT', `/periods/${this.period}/team/commercial`, body);
                box.remove();
                await this.load();
            } catch (e) {
                App.toast(e.message);
            }
        });
    },

    dialog(innerHtml) {
        const wrap = document.createElement('div');
        wrap.className = 'bn-dialog';
        wrap.innerHTML = `<div class="bn-dialog-box">${innerHtml}</div>`;
        wrap.addEventListener('click', (event) => {
            if (event.target === wrap || event.target.closest('[data-dialog-close]')) wrap.remove();
        });
        document.body.appendChild(wrap);
        return wrap;
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        bonusesCurrentPeriod, bonusesPeriodOptions, formatRub, formatHours, formatMoney, formatMetricValue,
        renderLevelBar, renderOutputRow, renderLevelRow, renderQualityRow, renderBonusCard, renderWarnings,
        renderTeamBlock, renderPeopleBlock, renderHistory, renderYear,
    };
}
