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
.bn-tick-label.bn-tick-above{top:-24px}
.bn-tick-medium{background:#1a7f37;width:3px}
.bn-row{padding:26px 0 30px}
.bn-tick-sold{background:#1f6feb;height:34px;top:-10px}
.bn-tick-sold-label{top:-26px;color:#1f6feb;font-weight:600}
.bn-fact{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.bn-fact span{display:block;font-size:13px;color:#57606a;font-weight:400}
.bn-ach{font-size:18px;font-variant-numeric:tabular-nums}
.bn-ach span{display:block;font-size:13px;color:#57606a}
.bn-formula{margin-top:8px;padding:10px 14px;background:#f6f8fa;border-radius:8px;font-size:17px;font-variant-numeric:tabular-nums}
.bn-level{background:#eef6ff;border-radius:8px;padding:8px 14px;font-size:16px;margin:6px 0 4px;font-variant-numeric:tabular-nums}
.bn-summary{font-size:17px;line-height:1.5;margin:4px 0 12px;max-width:80ch}
.bn-hero{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;margin:8px 0 6px}
.bn-tile{border:1px solid #d0d7de;border-radius:12px;padding:14px 16px;background:#f6f8fa}
.bn-tile-pay{background:#dafbe1;border-color:#2da44e}
.bn-tile .k{font-size:13px;color:#57606a;text-transform:uppercase;letter-spacing:.04em}
.bn-tile .v{font-size:30px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums;line-height:1.15}
.bn-tile .v small{font-size:15px;font-weight:500;color:#57606a;margin-left:6px}
.bn-tile .s{font-size:14px;color:#57606a;margin-top:4px}
.bn-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px}
.bn-receipt{width:100%;border-collapse:collapse;font-size:17px;margin:10px 0 6px;font-variant-numeric:tabular-nums}
.bn-receipt td{padding:8px 10px;border-bottom:1px solid #eaeef2;vertical-align:top}
.bn-receipt td.num{text-align:right;white-space:nowrap}
.bn-receipt td:nth-child(2){color:#57606a}
.bn-receipt-rate td{background:#f6f8fa}
.bn-receipt-total td{border-top:2px solid #24292f;border-bottom:0;font-size:19px}
.bn-receipt-upside td{color:#1a7f37;border-bottom:0}
.bn-chip{border-radius:999px;padding:6px 12px;font-size:15px;border:1px solid transparent}
.bn-chip b{font-variant-numeric:tabular-nums}
.bn-chip-green{background:#dafbe1;border-color:#2da44e}
.bn-chip-amber{background:#fff8c5;border-color:#d4a72c}
.bn-chip-red{background:#ffebe9;border-color:#cf222e}
.bn-chip-grey{background:#f6f8fa;border-color:#d0d7de;color:#57606a}
@media (max-width:800px){.bn-hero{grid-template-columns:1fr}}
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

// Короткие деньги для подписей на полосе: 14,5 млн, 850 тыс.
function formatMoneyShort(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1e6) return `${bonusesNum(n / 1e6, Number.isInteger(n / 1e5) ? 1 : 1).replace(/,0$/, '')} млн`;
    if (Math.abs(n) >= 1e3) return `${bonusesNum(n / 1e3)} тыс.`;
    return bonusesNum(n);
}

// Точные значения для формулы: часы до сотых, множитель до 4 знаков, без
// лишних нулей, чтобы произведение сходилось с суммой.
function exactNum(value, digits) {
    const n = Number(value) || 0;
    const fixed = n.toFixed(digits);
    const trimmed = fixed.replace(/\.?0+$/, '');
    const [int, frac] = trimmed.split('.');
    return `${bonusesNum(Number(int))}${frac ? `,${frac}` : ''}`;
}

function formatMetricValue(key, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    switch (key) {
        case 'output_hours': return formatHours(value);
        case 'productivity': return bonusesNum(value, 2);
        case 'on_time_share':
        case 'rework_share': return `${Math.round(Number(value) * 100)}%`;
        case 'cash_in': return formatMoneyShort(value);
        default: return String(value);
    }
}

// Полоса от нуля: aspiration на 85% ширины, запас справа под перевыполнение.
function bonusesTrackPercent(value, thresholds, direction) {
    const lower = direction === 'lower';
    if (lower) {
        const lo = Number(thresholds.max);
        const hi = Number(thresholds.min);
        const span = hi - lo || 1;
        const v = (hi - Number(value)) + lo;
        return Math.max(0, Math.min(1, ((v - lo) / span) * 0.8 + 0.1)) * 100;
    }
    const top = Number(thresholds.max) || 1;
    return Math.max(0, Math.min(100, (Number(value) / top) * 85));
}

function renderLevelBar(thresholds, fact, direction, key, achievement) {
    if (!thresholds) return '<div class="bn-track"></div>';
    const ach = Number(achievement) || 0;
    const fillClass = ach === 0 ? 'below' : (ach < 1 ? 'mid' : '');
    const fill = fact === null || fact === undefined ? '' : `<div class="bn-fill ${fillClass}" style="width:${bonusesTrackPercent(fact, thresholds, direction).toFixed(1)}%"></div>`;
    // Подписи в два ряда: base и aspiration под полосой, medium над ней,
    // чтобы близкие планки не наезжали друг на друга.
    const rows = { min: 'below', target: 'above', max: 'below' };
    const names = { min: 'base', target: 'medium', max: 'aspiration' };
    const ticks = ['min', 'target', 'max'].map((k) => {
        const pct = bonusesTrackPercent(thresholds[k], thresholds, direction).toFixed(1);
        return `<div class="bn-tick bn-tick-${names[k]}" style="left:${pct}%"></div><div class="bn-tick-label bn-tick-${rows[k]}" style="left:${pct}%">${names[k]} ${bonusesEscape(formatMetricValue(key, thresholds[k]))}</div>`;
    }).join('');
    return `<div class="bn-track">${fill}${ticks}</div>`;
}

function renderOutputRow(output, rate) {
    const thresholds = output.thresholds || output.thresholdsEffective || null;
    const forecast = output.forecast !== null && output.forecast !== undefined
        ? `<span>прогноз ${bonusesEscape(formatHours(output.forecast))}, если темп сохранится</span>`
        : '';
    const scaled = output.thresholdsEffective && output.thresholds && output.thresholdsEffective.target !== output.thresholds.target
        ? `<span>план ${bonusesEscape(formatHours(output.thresholds.min))} / ${bonusesEscape(formatHours(output.thresholds.target))} / ${bonusesEscape(formatHours(output.thresholds.max))}; продано меньше плана, уровень считается от проданного, но не выше medium</span>`
        : '<span>base / medium / aspiration</span>';
    const level = output.achievement === null || output.achievement === undefined ? '—' : bonusesNum(output.achievement, 2);
    let bar = renderLevelBar(thresholds, output.fact, 'higher', 'output_hours', output.achievement);
    if (thresholds && output.soldHours !== null && output.soldHours !== undefined && Number(output.soldHours) > 0) {
        const pct = bonusesTrackPercent(output.soldHours, thresholds, 'higher').toFixed(1);
        bar = bar.replace('</div>$', '') ;
        bar = bar.slice(0, -6) + `<div class="bn-tick bn-tick-sold" style="left:${pct}%"></div><div class="bn-tick-label bn-tick-sold-label" style="left:${pct}%">продано ${bonusesEscape(formatHours(output.soldHours))}</div></div>`;
    }
    return `<div class="bn-row bn-output">
        <div class="bn-label">Выпуск, нормо-часы${scaled}</div>
        ${bar}
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

// Коротко: сколько к выплате и из чего сложилось. Для Лёши это главное.
function renderSummary(entry) {
    if (!entry.hasTargets) return '<div class="bn-summary bn-muted">Цели квартала ещё не заданы, расчёта пока нет.</div>';
    const o = entry.output || {};
    const q = entry.quality || {};
    const outA = o.achievement;
    const prod = (q.metrics || []).find((m) => m.key === 'productivity');
    let levelShort;
    if (outA === null || outA === undefined) levelShort = 'уровень не считается';
    else if (o.scaledCapped) levelShort = `medium: продано ${bonusesEscape(formatHours(o.soldHours))} из плана ${bonusesEscape(formatHours((o.thresholds || {}).target))}, ${o.remainingSoldHours > 0 ? 'проданное почти сделано' : 'всё проданное сделано'}, выше medium только от плана`;
    else if (outA < 0.5) levelShort = 'ниже base';
    else if (outA < 1) levelShort = 'между base и medium';
    else if (outA < 1.5) levelShort = 'между medium и aspiration';
    else levelShort = 'выше aspiration';
    const lifted = entry.money && entry.money.achievement !== null && entry.money.achievement !== undefined && entry.level !== null && entry.level > outA + 0.0001;
    const prodText = prod ? (prod.available ? `производительность ${bonusesNum(prod.fact, 2)}` : 'табеля нет, множитель по минимуму') : '';
    const extras = (q.metrics || []).filter((m) => m.key !== 'productivity' && Number(m.weight) > 0 && m.available)
        .map((m) => `${m.key === 'on_time_share' ? 'в срок' : 'переделки'} ${bonusesEscape(formatMetricValue(m.key, m.fact))}`).join(', ');
    const forecast = o.forecastAmount ? ` Прогноз к концу квартала ${formatRub(o.forecastAmount)}.` : '';
    const remaining = o.remainingSoldHours > 0 ? ` <b>Не сделано из проданного: ${bonusesEscape(formatHours(o.remainingSoldHours))}.</b>` : '';
    const split = o.internalHours > 0
        ? ` В выпуске по заказам ${bonusesEscape(formatHours(o.commercialHours))} и внутренние работы (сток, образцы, утверждено) ${bonusesEscape(formatHours(o.internalHours))}.`
        : '';
    const u = entry.unmarked || { hours: o.unmarkedHours || 0, share: 0, amount: 0 };
    const unmarked = u.hours > 0
        ? ` Плюс часы без заказа (быт, сток, съёмки): ${exactNum(u.hours, 2)} ч × ${Math.round(u.share * 100)}% ставки = ${formatRub(u.amount)}; разнесите их по проектам, чтобы получить полную ставку.`
        : '';
    const base = entry.amountBase !== undefined && entry.amountBase !== null ? entry.amountBase : entry.amountComputed;
    return `<div class="bn-summary"><b>К выплате сейчас ${formatRub(entry.amountComputed)}</b>: ${exactNum(o.fact, 2)} ч × ${exactNum(o.rateApplied, 2)} ₽ × ${exactNum(q.multiplier, 4)} = ${formatRub(base)}.${split}${unmarked}<br>Уровень ${bonusesNum(entry.level, 2)} (${levelShort}${lifted ? `, деньги подняли` : ''}); ${prodText}${extras ? `, ${extras}` : ''}.${forecast}${remaining}</div>`;
}

function bonusesChipClass(achievement, available) {
    if (!available) return 'bn-chip-grey';
    const a = Number(achievement) || 0;
    if (a >= 1) return 'bn-chip-green';
    if (a >= 0.5) return 'bn-chip-amber';
    return 'bn-chip-red';
}

function renderChips(entry) {
    const q = entry.quality || { metrics: [] };
    const chips = [];
    for (const m of q.metrics || []) {
        const value = m.available ? formatMetricValue(m.key, m.fact) : 'нет данных';
        if (Number(m.weight) > 0) {
            chips.push(`<span class="bn-chip ${bonusesChipClass(m.achievement, m.available)}">${bonusesEscape(m.label)} <b>${bonusesEscape(value)}</b></span>`);
        } else {
            chips.push(`<span class="bn-chip bn-chip-grey" title="в сумму не входит, обсуждается отдельно">${bonusesEscape(m.label)} <b>${bonusesEscape(value)}</b> · не в деньгах</span>`);
        }
    }
    if ((entry.warnings || []).length) {
        chips.push(`<span class="bn-chip bn-chip-grey">Предупреждений <b>${entry.warnings.length}</b> · в «Деталях»</span>`);
    }
    return chips.length ? `<div class="bn-chips">${chips.join('')}</div>` : '';
}

// Чек: из чего складывается сумма. Каждая строка умножается сама.
function renderReceipt(entry) {
    if (!entry.hasTargets) return '';
    const r = entry.receipt || {};
    const o = entry.output || {};
    const q = entry.quality || {};
    const prod = (q.metrics || []).find((m) => m.key === 'productivity');
    const rate = entry.hourRate ?? (o.rateApplied || 0) * (q.multiplier || 0);
    const lines = [];
    lines.push(`<tr class="bn-receipt-rate"><td>Ставка за нормо-час</td><td>${bonusesNum(entry.rate)} ₽ × уровень ${bonusesNum(entry.level, 2)}${prod && prod.available ? ` × производительность ${bonusesNum(prod.fact, 2)}` : (prod ? ' × табеля нет (0,5)' : '')}</td><td class="num"><b>${exactNum(rate, 2)} ₽/ч</b></td></tr>`);
    lines.push(`<tr><td>Заказы клиентов</td><td>${exactNum(r.commercial?.hours || 0, 2)} ч × ${exactNum(rate, 2)} ₽</td><td class="num">${formatRub(r.commercial?.amount || 0)}</td></tr>`);
    if ((r.internal?.hours || 0) > 0) lines.push(`<tr><td>Внутренние работы, утверждено</td><td>${exactNum(r.internal.hours, 2)} ч × ${exactNum(rate, 2)} ₽</td><td class="num">${formatRub(r.internal.amount)}</td></tr>`);
    if ((r.unmarked?.hours || 0) > 0) lines.push(`<tr><td>Часы без заказа, половина ставки</td><td>${exactNum(r.unmarked.hours, 2)} ч × ${exactNum(r.unmarked.rate, 2)} ₽</td><td class="num">${formatRub(r.unmarked.amount)}</td></tr>`);
    lines.push(`<tr class="bn-receipt-total"><td>Итого к выплате</td><td></td><td class="num"><b>${formatRub(entry.amountComputed)}</b></td></tr>`);
    if ((r.upside?.hours || 0) > 0) lines.push(`<tr class="bn-receipt-upside"><td>Продано, но ещё не сделано</td><td>${exactNum(r.upside.hours, 2)} ч × ${exactNum(rate, 2)} ₽</td><td class="num">+ ${formatRub(r.upside.amount)} если доделать до конца квартала</td></tr>`);
    return `<table class="bn-receipt">${lines.join('')}</table>`;
}

function bonusesLevelWord(entry) {
    const o = entry.output || {};
    const a = o.achievement;
    if (a === null || a === undefined) return { word: '—', why: 'цели не заданы' };
    const thr = o.thresholds || {};
    const pctPlan = thr.target ? Math.round((Number(o.fact) / Number(thr.target)) * 100) : null;
    if (o.scaledCapped) {
        const soldPct = thr.target ? Math.round((Number(o.soldHours) / Number(thr.target)) * 100) : null;
        const donePct = o.soldHours ? Math.round((Number(o.fact) / Number(o.soldHours)) * 100) : null;
        return { word: 'medium', why: `продано ${soldPct}% плана · сделано ${donePct}% от проданного` };
    }
    const planText = pctPlan === null ? '' : `сделано ${pctPlan}% плана medium`;
    if (a < 0.5) return { word: 'ниже base', why: planText };
    if (a < 1) return { word: 'base → medium', why: planText };
    if (a < 1.5) return { word: 'medium → aspiration', why: planText };
    return { word: 'выше aspiration', why: planText };
}

function renderBonusCard(entry, options = {}) {
    const expanded = options.expanded === true;
    const readOnly = options.readOnly === true;
    const open = entry.resultStatus === 'open';
    const output = entry.output || {};
    const quality = entry.quality || { multiplier: 0, metrics: [] };
    const level = bonusesLevelWord(entry);
    const lifted = entry.money && entry.money.achievement !== null && entry.money.achievement !== undefined && entry.level !== null && entry.level > (output.achievement || 0) + 0.0001;
    const final = entry.amountFinal !== null && entry.amountFinal !== undefined && Number(entry.amountFinal) !== Number(entry.amountComputed);
    const payTitle = entry.resultStatus === 'paid' ? 'Выплачено' : (entry.resultStatus === 'closed' ? 'К выплате, зафиксировано' : 'К выплате сейчас');
    const paySub = !entry.hasTargets
        ? 'задайте цели квартала'
        : (final ? `расчёт ${formatRub(entry.amountComputed)}` : (output.forecastAmount ? `прогноз на конец квартала ${formatRub(output.forecastAmount)}` : ''));
    const hero = `<div class="bn-hero">
        <div class="bn-tile bn-tile-pay"><div class="k">${payTitle}</div><div class="v">${entry.hasTargets ? formatRub(final ? entry.amountFinal : entry.amountComputed) : '—'}</div><div class="s">${bonusesEscape(paySub)}</div></div>
        <div class="bn-tile"><div class="k">Уровень квартала</div><div class="v">${entry.level === null || entry.level === undefined ? '—' : bonusesNum(entry.level, 2)} <small>${bonusesEscape(level.word)}${lifted ? ' + деньги' : ''}</small></div><div class="s">${bonusesEscape(level.why)}</div></div>
        <div class="bn-tile"><div class="k">Итоговая ставка за час</div><div class="v">${exactNum(entry.hourRate ?? ((output.rateApplied || 0) * (quality.multiplier || 0)), 2)} ₽</div><div class="s">${bonusesNum(entry.rate)} ₽ × уровень ${bonusesNum(entry.level, 2)} × производительность ${bonusesNum(quality.multiplier, 2)}</div></div>
    </div>`;
    const drift = entry.targetsDrift ? '<div class="bn-warnings">Сезонный план изменился после сохранения целей. Откройте «Цели квартала», чтобы пересохранить.</div>' : '';
    const noTargets = !entry.hasTargets ? '<div class="bn-warnings">Цели квартала не заданы. Нажмите «Цели квартала».</div>' : '';
    const formula = entry.hasTargets
        ? `<div class="bn-formula">${exactNum(output.fact, 2)} ч × ${exactNum(output.rateApplied, 2)} ₽ × ${exactNum(quality.multiplier, 4)} = ${formatRub(entry.amountBase ?? entry.amountComputed)}${entry.unmarked && entry.unmarked.amount ? ` + без заказа ${exactNum(entry.unmarked.hours, 2)} ч × ${Math.round(entry.unmarked.share * 100)}% × ${exactNum(output.rateApplied, 2)} ₽ = ${formatRub(entry.unmarked.amount)}` : ''} → <b>${formatRub(entry.amountComputed)}</b></div>`
        : '';
    const actions = readOnly
        ? `<div class="bn-actions"><button class="bn-btn" data-action="toggle" data-scheme="${entry.schemeId}">${expanded ? 'Скрыть детали' : 'Детали и как посчитано'}</button></div>`
        : `<div class="bn-actions">
        <button class="bn-btn" data-action="toggle" data-scheme="${entry.schemeId}">${expanded ? 'Скрыть детали' : 'Детали и как посчитано'}</button>
        <button class="bn-btn" data-action="targets" data-scheme="${entry.schemeId}" ${open ? '' : 'disabled'}>Цели квартала</button>
        <button class="bn-btn" data-action="scheme" data-scheme="${entry.schemeId}" data-employee="${entry.employeeId}">Ставка</button>
        ${open ? `<button class="bn-btn primary" data-action="close" data-scheme="${entry.schemeId}" ${entry.hasTargets ? '' : 'disabled'}>Закрыть квартал</button>` : ''}
        ${entry.resultStatus === 'closed' ? `<button class="bn-btn" data-action="adjust" data-scheme="${entry.schemeId}">Корректировка</button><button class="bn-btn primary" data-action="paid" data-scheme="${entry.schemeId}">Выплачено</button>` : ''}
    </div>`;
    const adjustments = (entry.adjustments || []).map((a) => `<li>${bonusesEscape(String(a.at).slice(0, 10))}: ${formatRub(a.from)} → ${formatRub(a.to)}. ${bonusesEscape(a.comment)}</li>`).join('');
    const details = expanded ? `<div class="bn-card-details">
        ${renderSummary(entry)}
        ${renderLevelRow(entry)}
        ${(quality.metrics || []).filter((m) => Number(m.weight) > 0).map(renderQualityRow).join('')}
        <div class="bn-row"><div class="bn-label">Множитель качества</div><div></div><div class="bn-fact">${bonusesNum(quality.multiplier, 2)}</div><div></div></div>
        ${formula}
        ${renderWarnings(entry.warnings)}
        <h3 class="bn-h2" style="margin-top:14px">Заказы квартала</h3>
        ${renderOrdersTable(readOnly ? { ...entry, resultStatus: 'closed' } : entry)}
        ${adjustments ? `<h3 class="bn-h2" style="margin-top:14px">Корректировки</h3><ul>${adjustments}</ul>` : ''}
    </div>` : '';
    return `<div class="bn-card" data-scheme="${entry.schemeId}">
        <div class="bn-card-head">
            <div><div class="bn-name">${bonusesEscape(entry.employeeName || `Схема #${entry.schemeId}`)}</div>
            <div class="bn-status">производство · ${bonusesEscape(entry.period || '')} · период ${bonusesStatusLabel(entry.resultStatus)}</div></div>
        </div>
        ${noTargets}${drift}
        ${hero}
        ${renderReceipt(entry)}
        ${renderOutputRow(output, entry.rate)}
        ${renderChips(entry)}
        ${actions}
        ${details}
    </div>`;
}

function renderTeamBlock(team, period, options = {}) {
    const c = team?.commercial || {};
    const thresholds = c.targets?.cash_in || null;
    const fact = c.facts?.cash_in || null;
    const button = options.readOnly === true
        ? ''
        : '<span class="bn-actions" style="margin-top:0"><button class="bn-btn primary" data-action="sync-money">Обновить из Финтабло сейчас</button><button class="bn-btn" data-action="team-money">План и факт по деньгам</button></span>';
    if (!thresholds) {
        return `<div class="bn-team"><div class="bn-team-head"><div class="bn-team-title">Деньги квартала ${bonusesEscape(period)}</div>${button}</div>
            <div class="bn-warnings">План по деньгам за квартал ещё не пришёл из таблицы (синк раз в день). Уровень производства пока считается только по часам.</div></div>`;
    }
    const ach = c.cashAchievement;
    const sourceLabel = fact?.source === 'fintablo' ? 'из Финтабло автоматически' : 'введено вручную';
    const done = fact && Number(thresholds.target) > 0 ? Math.round((fact.value / Number(thresholds.target)) * 100) : null;
    const factHtml = fact
        ? `<div class="bn-fact">${formatMoneyShort(fact.value)}<span>${done !== null ? `${done}% от medium ${formatMoneyShort(thresholds.target)} · ` : ''}${fact.source === 'fintablo' ? 'Финтабло' : 'вручную'} ${bonusesEscape(String(fact.updated_at || '').slice(5, 10).split('-').reverse().join('.'))}</span></div>`
        : '<div class="bn-fact bn-muted">факт ещё не пришёл из Финтабло</div>';
    return `<div class="bn-team"><div class="bn-team-head"><div class="bn-team-title">Деньги квартала ${bonusesEscape(period)} · план из таблицы, факт из Финтабло</div>${button}</div>
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

function renderYear(yearData, year, options = {}) {
    if (!Array.isArray(yearData) || !yearData.length) return '';
    const readOnly = options.readOnly === true;
    const rows = yearData.map((e) => {
        const q = e.year.quarters.map((x) => `<td class="num">${x.fact === null ? '—' : formatHours(x.fact)}</td>`).join('');
        return `<tr><td>${bonusesEscape(e.employeeName)}</td>${q}
            <td class="num">${formatHours(e.year.factSum)} / ${formatHours(e.year.thresholdsSum.target)}</td>
            <td class="num">${e.year.achievement === null ? '—' : bonusesNum(e.year.achievement, 2)}</td>
            <td class="num">${formatRub(e.year.topUp)}</td>
            <td>${readOnly ? '' : `<button class="bn-btn" data-action="close-year" data-scheme="${e.schemeId}" ${e.year.quartersCounted === 4 ? '' : 'disabled'}>Закрыть год</button>`}</td></tr>`;
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

    isOwnerView() {
        return typeof App === 'undefined' || typeof App.isOwner !== 'function' || App.isOwner();
    },

    // Сотрудник со схемой (Лёша) видит только свой раздел, без действий.
    async probeMine() {
        if (typeof App === 'undefined' || !App.currentUser || App.isOwner()) return;
        const empId = App.currentUser.employee_id;
        if (empId === null || empId === undefined || empId === '') return;
        try {
            const me = await this.api('GET', '/me');
            App._bonusesMine = !!me?.hasScheme;
        } catch (e) {
            App._bonusesMine = false;
        }
        if (typeof App.applyNavVisibility === 'function') App.applyNavVisibility();
    },

    async load() {
        const owner = this.isOwnerView();
        if (!owner && typeof App !== 'undefined' && App._bonusesMine !== true) { App.navigate('orders'); return; }
        this.injectCss();
        this.bind();
        if (!this.period) this.period = bonusesCurrentPeriod();
        this.renderPeriods();
        const cards = document.getElementById('bonuses-cards');
        cards.innerHTML = '<div class="bn-muted">Загрузка…</div>';
        try {
            const year = Number(this.period.slice(0, 4));
            if (owner) {
                [this.data, this.yearData] = await Promise.all([this.api('GET', `/periods/${this.period}`), this.api('GET', `/years/${year}`)]);
                this.render();
            } else {
                const mine = await this.api('GET', `/me/periods/${this.period}`);
                this.data = { period: mine.period, entries: [mine.entry], history: [], team: mine.team, people: null };
                this.yearData = mine.year ? [mine.year] : [];
                this.renderMine();
            }
        } catch (e) {
            cards.innerHTML = `<div class="bn-warnings">${bonusesEscape(e.message)}</div>`;
        }
    },

    renderMine() {
        const entries = this.data?.entries || [];
        document.getElementById('bonuses-team').innerHTML = renderTeamBlock(this.data?.team, this.period, { readOnly: true });
        document.getElementById('bonuses-cards').innerHTML = entries.map((e) => renderBonusCard(e, { expanded: this.expanded.has(e.schemeId), readOnly: true })).join('');
        document.getElementById('bonuses-people').innerHTML = '';
        document.getElementById('bonuses-year').innerHTML = renderYear(this.yearData, Number(this.period.slice(0, 4)), { readOnly: true });
        document.getElementById('bonuses-history').innerHTML = '';
    },

    renderPeriods() {
        const box = document.getElementById('bonuses-periods');
        box.innerHTML = bonusesPeriodOptions().map((p) => `<button class="bn-period ${p === this.period ? 'active' : ''}" data-period="${p}">${p.replace('-Q', ' · Q')}</button>`).join('');
    },

    render() {
        if (!this.isOwnerView()) { this.renderMine(); return; }
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
            } else if (action === 'sync-money') {
                const btn = document.querySelector('[data-action="sync-money"]');
                if (btn) { btn.disabled = true; btn.textContent = 'Обновляю…'; }
                try {
                    const result = await this.api('POST', '/sync/run', { year: Number(this.period.slice(0, 4)) });
                    const fact = result?.facts?.[this.period];
                    App.toast(fact !== undefined ? `Финтабло: ${formatMoney(fact)} за ${this.period}` : 'Финтабло обновлено');
                } finally {
                    await this.load();
                }
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
            <div class="bn-muted" style="margin-top:6px">ниже base ставка × 0,25; base × 0,5; medium × 1; aspiration × 1,5; выше aspiration растёт дальше до × 2. Множитель качества: производительность 50%, в срок 30%, переделки 20%.</div>
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

// После входа проверяем, есть ли у сотрудника своя схема, и показываем пункт меню.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        if (typeof App !== 'undefined' && App.currentUser) {
            clearInterval(timer);
            Bonuses.probeMine();
        } else if (tries > 60) {
            clearInterval(timer);
        }
    }, 1000);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        bonusesCurrentPeriod, bonusesPeriodOptions, formatRub, formatHours, formatMoney, formatMetricValue,
        renderLevelBar, renderOutputRow, renderLevelRow, renderQualityRow, renderBonusCard, renderWarnings,
        renderTeamBlock, renderPeopleBlock, renderHistory, renderYear, renderSummary, renderReceipt,
    };
}
