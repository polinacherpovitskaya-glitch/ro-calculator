// =============================================
// Recycle Object — плашка загрузки производства (история заказов)
// Чистые расчёты + рендер тонкого бара. Переиспользует Factual для «сделано».
// Спека: docs/superpowers/specs/2026-07-16-production-load-bar-design.md
// =============================================

const RO_QUARTER_LABELS = ['', 'I квартал', 'II квартал', 'III квартал', 'IV квартал'];
const RO_MONTH_LABELS = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function roLoadNum(v, dflt = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
}

// Границы текущего квартала по дате now.
function getQuarterBounds(now) {
    const d = now instanceof Date ? now : new Date(now);
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    const startMonth = (q - 1) * 3;
    const from = new Date(y, startMonth, 1, 0, 0, 0, 0);
    const to = new Date(y, startMonth + 3, 0, 23, 59, 59, 999);
    return { q, from, to, label: RO_QUARTER_LABELS[q] };
}

// Три календарные части квартальной полосы. Это не проценты загрузки — только
// ориентиры времени, чтобы «сегодня 18%» не принимали за заполнение мощности.
function getQuarterMonthMarkers(now) {
    const d = now instanceof Date ? now : new Date(now);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const startMonth = (q - 1) * 3;
    const currentIndex = Math.max(0, Math.min(2, d.getMonth() - startMonth));
    return [0, 1, 2].map(index => ({
        label: RO_MONTH_LABELS[startMonth + index],
        startPercent: index * 100 / 3,
        state: index < currentIndex ? 'past' : (index === currentIndex ? 'current' : 'future'),
    }));
}

// Плановые часы квартала: сезонный план из настроек, иначе фолбэк на среднегод.
function quarterTargetHours(settings, now) {
    const { q } = getQuarterBounds(now);
    let plan = null;
    const raw = settings && settings.seasonal_load_plan_json;
    if (raw) {
        try { plan = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { plan = null; }
    }
    const key = 'Q' + q;
    if (plan && roLoadNum(plan[key]) > 0) return roLoadNum(plan[key]);
    const perMonth = roLoadNum(settings && settings.workers_count)
        * roLoadNum(settings && settings.hours_per_worker)
        * roLoadNum(settings && settings.work_load_ratio);
    return Math.round(perMonth * 3);
}

// Чистый расчёт сегментов бара и темпа. Все входы — часы + даты.
function computeQuarterLoad({ planHours, soldHours, doneHours, now, from, to }) {
    const plan = Math.max(0, roLoadNum(planHours));
    const sold = Math.max(0, roLoadNum(soldHours));
    const done = Math.max(0, roLoadNum(doneHours));
    const gap = Math.max(0, plan - sold);
    const over = Math.max(0, sold - plan);
    const stock = Math.max(0, done - sold);
    const clampPct = h => plan > 0 ? Math.min(100, Math.round(h / plan * 100)) : 0;
    const soldPct = clampPct(sold);
    const donePct = clampPct(Math.min(done, sold, plan));
    const gapPct = Math.max(0, 100 - soldPct);
    const nowT = (now instanceof Date ? now : new Date(now)).getTime();
    const fromT = (from instanceof Date ? from : new Date(from)).getTime();
    const toT = (to instanceof Date ? to : new Date(to)).getTime();
    const span = Math.max(1, toT - fromT);
    const elapsedRatio = Math.min(1, Math.max(0, (nowT - fromT) / span));
    const expected = plan * elapsedRatio;
    const tol = Math.max(1, expected * 0.05);
    let status = 'on_track';
    if (sold - expected > tol) status = 'ahead';
    else if (sold - expected < -tol) status = 'behind';
    return { plan, sold, done, gap, over, stock, soldPct, donePct, gapPct, elapsedRatio, status };
}

// --- данные из приложения ---

// Какие заказы считаем «проданными» (загружают производство). См. спеку.
function _isSoldOrder(o) {
    if (!o || o.deleted_at) return false;
    if (o.status === 'cancelled') return false;
    if (o.status === 'draft' && (!o.payment_status || o.payment_status === 'not_sent')) return false;
    return true;
}

// Парсит дату КАК ЛОКАЛЬНУЮ (согласованно с getQuarterBounds), чтобы записи
// у границ квартала не смещались из-за UTC-парсинга 'YYYY-MM-DD'.
function _parseLocalDate(raw) {
    if (!raw) return null;
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

function _orderProdDate(o) {
    return (o && (o.deadline_start || o.deadline || o.created_at)) || null;
}

function _entryDate(e) {
    return _parseLocalDate(e && (e.date || e.work_date || e.created_at));
}

// «Сделано» за диапазон: свой массив записей + предикат производственных
// записей из Factual (DRY — те же стадии, что видит руководство).
function doneHoursForRange(entries, from, to) {
    return (entries || []).reduce((sum, e) => {
        const d = _entryDate(e);
        if (!d || d < from || d > to) return sum;
        const isProd = (typeof Factual !== 'undefined' && typeof Factual._isProductionLoadEntry === 'function')
            ? Factual._isProductionLoadEntry(e) : true;
        return isProd ? sum + roLoadNum(e.hours) : sum;
    }, 0);
}

// Собирает продано/сделано за текущий квартал и считает load.
// breakdown — для ховер-тултипов: какие заказы сколько часов занимают.
function collectQuarterLoad(orders, entries, settings, now) {
    const { from, to, label } = getQuarterBounds(now);
    const planHours = quarterTargetHours(settings, now);

    const nameById = {};
    (orders || []).forEach(o => { if (o && o.id != null) nameById[o.id] = o.order_name || ('заказ #' + o.id); });

    // Сделано по заказам (все производственные записи квартала)
    const doneByOrder = {};
    (entries || []).forEach(e => {
        const d = _entryDate(e);
        if (!d || d < from || d > to) return;
        const isProd = (typeof Factual !== 'undefined' && typeof Factual._isProductionLoadEntry === 'function')
            ? Factual._isProductionLoadEntry(e) : true;
        if (!isProd) return;
        const key = e.order_id != null ? String(e.order_id) : 'none';
        doneByOrder[key] = (doneByOrder[key] || 0) + roLoadNum(e.hours);
    });

    // Продано: заказы квартала, прошедшие фильтр
    let soldHours = 0;
    const soldOrders = [];
    (orders || []).forEach(o => {
        if (!_isSoldOrder(o)) return;
        const d = _parseLocalDate(_orderProdDate(o));
        if (!d || d < from || d > to) return;
        const plan = roLoadNum(o.total_hours_plan);
        soldHours += plan;
        const done = doneByOrder[String(o.id)] || 0;
        soldOrders.push({ id: o.id, name: o.order_name || ('заказ #' + o.id), plan, done, remain: Math.max(0, plan - done) });
    });

    const doneHours = doneHoursForRange(entries, from, to);
    const load = computeQuarterLoad({ planHours, soldHours, doneHours, now, from, to });

    const doneRows = Object.entries(doneByOrder)
        .map(([key, hours]) => ({
            name: key === 'none' ? 'вне заказов (сток, образцы…)' : (nameById[key] || ('заказ #' + key)),
            hours,
        }))
        .filter(r => r.hours > 0.05)
        .sort((a, b) => b.hours - a.hours);
    const remainRows = soldOrders
        .map(o => ({ name: o.name, hours: o.remain }))
        .filter(r => r.hours > 0.05)
        .sort((a, b) => b.hours - a.hours);

    return { load, label, breakdown: { doneRows, remainRows, soldOrders } };
}

// --- рендер ---

function _hrsLoad(n) { return Math.round(roLoadNum(n)).toLocaleString('ru-RU'); }

function _ensureProductionLoadStyles() {
    if (typeof document === 'undefined' || document.getElementById('pl-styles')) return;
    const s = document.createElement('style');
    s.id = 'pl-styles';
    s.textContent = `
.pl-wrap{font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--text-secondary,#57606a);margin:0 0 14px;}
.pl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;flex-wrap:wrap;}
.pl-title{color:var(--text-secondary,#57606a);}
.pl-right{color:var(--text-secondary,#57606a);}
.pl-right b{color:var(--text-primary,#24292f);}
.pl-pace{display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;font-size:12px;}
.pl-pace.pl-ok{background:#dafbe1;color:#1a7f37;}
.pl-pace.pl-warn{background:#fff1e5;color:#bc4c00;}
.pl-pace.pl-neutral{background:#eaeef2;color:#57606a;}
.pl-trackwrap{position:relative;padding-top:16px;}
.pl-months{position:relative;height:15px;margin:0 3px 3px;font-size:11px;color:var(--text-secondary,#57606a);}
.pl-month-label{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;}
.pl-month-label.pl-month-first{transform:none;}
.pl-month-label.pl-month-past{opacity:.58;}
.pl-month-label.pl-month-current{color:var(--text-primary,#24292f);font-weight:700;}
.pl-track{position:relative;height:12px;border-radius:999px;background:var(--pl-track,#eaeef2);border:1px solid rgba(0,0,0,.06);overflow:hidden;}
.pl-seg{position:absolute;top:0;bottom:0;transition:width .6s ease,left .6s ease;}
.pl-seg.pl-done{left:0;background:#2da44e;}
.pl-seg.pl-sold{background:#388bfd;}
.pl-track .pl-seg.pl-sold{left:var(--pl-sold-left,0);}
.pl-month-boundary{position:absolute;top:-3px;bottom:-3px;width:1px;background:#24292f;opacity:.92;z-index:3;pointer-events:none;}
.pl-now{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--text-primary,#24292f);z-index:4;}
.pl-tip{position:absolute;z-index:5;min-width:220px;max-width:320px;background:var(--pl-tip-bg,#fff);border:1px solid rgba(0,0,0,.12);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.12);padding:8px 10px;font-size:12px;line-height:1.5;color:var(--text-primary,#24292f);pointer-events:none;display:none;}
.pl-tip b{display:block;margin-bottom:4px;}
.pl-tip .row{display:flex;justify-content:space-between;gap:12px;}
.pl-tip .row span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap;}
.pl-tip .muted{color:var(--text-secondary,#57606a);}
.pl-legend{display:flex;align-items:center;gap:16px;margin-top:12px;font-size:12px;flex-wrap:wrap;}
.pl-dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;}
.pl-dot.pl-done{background:#2da44e;}
.pl-dot.pl-sold{background:#388bfd;}
.pl-dot.pl-gap{background:#eaeef2;border:1px solid rgba(0,0,0,.1);}
.pl-goal{margin-left:auto;color:#bc4c00;}
@media (prefers-color-scheme:dark){.pl-track{background:#30363d;border-color:rgba(255,255,255,.08);}.pl-dot.pl-gap{background:#30363d;}.pl-pace.pl-neutral{background:#21262d;color:#8b949e;}.pl-tip{--pl-tip-bg:#1c2128;border-color:rgba(255,255,255,.14);}}
`;
    document.head.appendChild(s);
}

function _escLoad(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function _tipHtml(title, rows, maxRows) {
    const top = rows.slice(0, maxRows);
    const restH = rows.slice(maxRows).reduce((s, r) => s + r.hours, 0);
    let html = `<b>${_escLoad(title)}</b>`;
    if (!top.length) return html + '<div class="muted">пока пусто</div>';
    top.forEach(r => {
        html += `<div class="row"><span>${_escLoad(r.name).slice(0, 44)}</span><span>${r.hours < 10 ? r.hours.toFixed(1) : Math.round(r.hours)} ч</span></div>`;
    });
    if (restH > 0.5) html += `<div class="row muted"><span>ещё ${rows.length - maxRows}…</span><span>${Math.round(restH)} ч</span></div>`;
    return html;
}

function renderProductionLoadBar(container, load, label, breakdown) {
    if (!container) return;
    if (!load || load.plan <= 0) { container.innerHTML = ''; return; }
    _ensureProductionLoadStyles();
    const paceText = load.status === 'ahead' ? 'впереди темпа'
        : load.status === 'behind' ? 'отстаём от темпа' : 'идём в темпе';
    const paceCls = load.status === 'ahead' ? 'pl-ok' : load.status === 'behind' ? 'pl-warn' : 'pl-neutral';
    const overNote = load.over > 0 ? ` · +${_hrsLoad(load.over)} ч сверх плана` : '';
    const soldWidth = Math.max(0, load.soldPct - load.donePct);
    const nowPct = Math.round(load.elapsedRatio * 100);
    const months = getQuarterMonthMarkers(new Date());
    const monthLabels = months.map((month, index) => `<span class="pl-month-label pl-month-${month.state}${index === 0 ? ' pl-month-first' : ''}" style="left:${month.startPercent}%">${month.label}</span>`).join('');
    const monthBoundaries = months.slice(1).map(month => `<i class="pl-month-boundary" style="left:${month.startPercent}%" title="Начало: ${month.label}"></i>`).join('');
    container.innerHTML = `
    <div class="pl-wrap">
      <div class="pl-head">
        <span class="pl-title">Загрузка производства · ${label}</span>
        <span class="pl-right">продано <b>${_hrsLoad(load.sold)}</b> / ${_hrsLoad(load.plan)} ч
          <span class="pl-pace ${paceCls}">${paceText}</span></span>
      </div>
      <div class="pl-trackwrap">
        <div class="pl-months" aria-label="Месяцы квартала">${monthLabels}</div>
        <div class="pl-track">
          <div class="pl-seg pl-done" style="width:0%"></div>
          <div class="pl-seg pl-sold" style="left:0%;width:0%"></div>
          ${monthBoundaries}
          <div class="pl-now" style="left:${nowPct}%" title="Сегодня. Прошло ${nowPct}% квартала."></div>
        </div>
        <div class="pl-tip"></div>
      </div>
      <div class="pl-legend">
        <span><i class="pl-dot pl-done"></i>сделано ${_hrsLoad(load.done)} ч</span>
        <span><i class="pl-dot pl-sold"></i>ещё делать ${_hrsLoad(Math.max(0, load.sold - load.done))} ч</span>
        <span><i class="pl-dot pl-gap"></i>недобор ${_hrsLoad(load.gap)} ч${overNote}</span>
        <span class="pl-goal">до плана — продать ещё ${_hrsLoad(load.gap)} ч</span>
      </div>
    </div>`;

    // Анимация появления: сегменты растут от нуля до реальных ширин.
    const doneEl = container.querySelector('.pl-seg.pl-done');
    const soldEl = container.querySelector('.pl-seg.pl-sold');
    const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn => fn());
    raf(() => raf(() => {
        if (doneEl) doneEl.style.width = load.donePct + '%';
        if (soldEl) { soldEl.style.left = load.donePct + '%'; soldEl.style.width = soldWidth + '%'; }
    }));

    // Ховер-тултипы: какие заказы сколько часов занимают.
    const wrap = container.querySelector('.pl-trackwrap');
    const track = container.querySelector('.pl-track');
    const tip = container.querySelector('.pl-tip');
    if (!wrap || !track || !tip) return;
    const bd = breakdown || { doneRows: [], remainRows: [] };
    const zones = [
        { toPct: load.donePct, html: () => _tipHtml(`Сделано · ${_hrsLoad(load.done)} ч`, bd.doneRows || [], 8) },
        { toPct: load.soldPct, html: () => _tipHtml(`Ещё делать · ${_hrsLoad(Math.max(0, load.sold - load.done))} ч`, bd.remainRows || [], 8) },
        { toPct: 101, html: () => `<b>Недобор · ${_hrsLoad(load.gap)} ч</b><div class="muted">столько часов ещё нужно продать до плана квартала${overNote}</div>` },
    ];
    track.addEventListener('mousemove', (ev) => {
        const r = track.getBoundingClientRect();
        if (!r.width) return;
        const pct = (ev.clientX - r.left) / r.width * 100;
        const zone = zones.find(z => pct <= z.toPct) || zones[zones.length - 1];
        tip.innerHTML = zone.html();
        tip.style.display = 'block';
        const wrapR = wrap.getBoundingClientRect();
        let x = ev.clientX - wrapR.left + 12;
        x = Math.min(x, wrapR.width - tip.offsetWidth - 4);
        tip.style.left = Math.max(0, x) + 'px';
        tip.style.top = (track.getBoundingClientRect().bottom - wrapR.top + 8) + 'px';
    });
    track.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getQuarterBounds, quarterTargetHours, computeQuarterLoad, doneHoursForRange,
        collectQuarterLoad, renderProductionLoadBar, getQuarterMonthMarkers, _isSoldOrder, _orderProdDate,
    };
}
