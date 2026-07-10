// Recycle Object — производственная витрина цеха (публичная, read-only).
// Reads the curated snapshot the publisher writes (plan.json + orders/<id>.json).
// Single page, hash-routed: #/ = доска, #/order/<id> = карточка заказа.
(function () {
  'use strict';
  var BASE = new URL('.', location.href).href;
  var STAGE_COLORS = { molding: '#f59e0b', assembly: '#06b6d4', packaging: '#8b5cf6' };
  var STAGE_SHORT = { molding: 'Литьё', assembly: 'Сборка', packaging: 'Упак.' };
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var app = document.getElementById('app');
  var lastPlan = null;
  var boardWeek = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function num(h) { var v = Math.round((Number(h) || 0) * 10) / 10; return v % 1 === 0 ? String(v) : v.toFixed(1); }
  function fmtHours(h) { return num(h) + ' ч'; }
  function fmtDate(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] : (iso || ''); }
  function fmtDateTime(ts) { var d = new Date(ts); if (isNaN(d)) return ''; return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isStale(ts) { var d = new Date(ts); return !isNaN(d) && (Date.now() - d.getTime()) > 30 * 60 * 1000; }
  function dayNum(iso) { var p = String(iso).split('-'); return String(Number(p[2])); }

  function fetchJSON(rel) {
    return fetch(BASE + rel + '?ts=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(rel + ' -> ' + r.status);
      return r.json();
    });
  }

  function deadlineBadge(state, buffer) {
    if (!state) return '';
    if (state === 'late') return '<span class="badge bad">Опаздывает' + (buffer != null ? ' ' + Math.abs(buffer) + ' раб.дн.' : '') + '</span>';
    if (state === 'tight') return '<span class="badge warn">Впритык к дедлайну</span>';
    return '<span class="badge ok">Буфер' + (buffer != null ? ' ' + buffer + ' раб.дн.' : '') + '</span>';
  }
  function swatch(c) {
    var img = c.swatch_url ? '<img src="' + escAttr(c.swatch_url) + '" alt="">' : '<span class="nohex"></span>';
    return '<span class="swatch">' + img + esc(c.name || 'цвет') + '</span>';
  }
  function segMap(a) { var m = {}; (a || []).forEach(function (s) { m[s.date] = s.stage; }); return m; }

  function buildCalendar(days, rows, nameHeader) {
    if (!days || !days.length) return '';
    var cols = 'minmax(150px,1.3fr) repeat(' + days.length + ', minmax(46px,1fr))';
    var today = todayISO();
    var html = '<div class="rowname" style="font-size:13px;color:var(--muted)">' + esc(nameHeader != null ? nameHeader : 'Заказ') + '</div>';
    days.forEach(function (d) {
      var cls = 'dayhead' + (d.nonworking ? ' weekend' : '') + (d.date === today ? ' today' : '');
      html += '<div class="' + cls + '">' + esc(d.weekday) + '<br>' + dayNum(d.date) + '</div>';
    });
    rows.forEach(function (r) {
      html += '<div class="rowname">' + esc(r.name) + (r.client ? ' <small>· ' + esc(r.client) + '</small>' : '') + '</div>';
      days.forEach(function (d) {
        var stage = r.cells && r.cells[d.date];
        if (stage) html += '<div class="cell on" style="background:' + (STAGE_COLORS[stage] || '#94a3b8') + '">' + esc(STAGE_SHORT[stage] || '') + '</div>';
        else html += '<div class="cell' + (d.nonworking ? ' weekend' : '') + '"></div>';
      });
    });
    return '<div class="cal-scroll"><div class="cal" style="grid-template-columns:' + cols + '">' + html + '</div></div>';
  }

  function headerHtml(generatedAt) {
    var stale = isStale(generatedAt);
    return '<div class="head"><div class="head-l"><span class="logo">RO</span><div>' +
      '<h1 class="title">Производственный календарь</h1>' +
      '<div class="subtitle">Публичная витрина цеха · только просмотр</div></div></div>' +
      '<div class="head-r"><span class="updated ' + (stale ? 'stale' : '') + '">Обновлено ' + fmtDateTime(generatedAt) + (stale ? ' · возможно устарело' : '') + '</span>' +
      '<button onclick="window.__floorRefresh()">Обновить</button></div></div>';
  }
  function cardHtml(lbl, val, cls) { return '<div class="card ' + (cls || '') + '"><div class="lbl">' + esc(lbl) + '</div><div class="val">' + val + '</div></div>'; }

  function tagLine(label, values) {
    return values && values.length ? '<span class="qtag"><b>' + label + ':</b> ' + values.map(esc).join(', ') + '</span>' : '';
  }
  function moldBadge(mold) {
    if (mold === 'waiting') return '<span class="badge warn">Форма: нужна</span>';
    if (mold === 'ready') return '<span class="badge ok">Форма: есть</span>';
    return '';
  }
  function stageChips(stages) {
    if (!stages || !stages.length) return '';
    var chips = stages.filter(function (s) { return (Number(s.plan) || 0) > 0; }).map(function (s) {
      return '<span class="schip"><i class="dot" style="background:' + (STAGE_COLORS[s.stage] || '#94a3b8') + '"></i>' + esc(s.label || s.stage) + ' <b>' + fmtHours(s.plan) + '</b></span>';
    });
    return chips.length ? '<div class="schips">' + chips.join('') + '</div>' : '';
  }
  function hwChip(h) {
    var img = h.thumb_url ? '<img src="' + escAttr(h.thumb_url) + '" alt="">' : '';
    return '<span class="hwchip">' + img + esc(h.name) + '</span>';
  }
  function hwLine(hardware) {
    return hardware && hardware.length ? '<span class="qtag"><b>Фурнитура:</b> <span class="hwchips">' + hardware.map(hwChip).join('') + '</span></span>' : '';
  }
  function zoomImg(url, cls) {
    return '<img class="' + (cls || '') + ' zoomable" src="' + escAttr(url) + '" alt="" onclick="window.__floorZoom(this.src)">';
  }
  function queueCard(q) {
    var thumb = q.thumb_url ? '<img class="thumb" src="' + escAttr(q.thumb_url) + '" alt="">' : '<div class="thumb ph">фото</div>';
    var prog = q.hours && q.hours.plan > 0 ? Math.min(100, Math.round((q.hours.fact / q.hours.plan) * 100)) : 0;
    var bits = [];
    if (q.products && q.products.length) bits.push('<span class="qtag"><b>Изделия:</b> ' + q.products.map(function (p) { return esc(p.name) + ' <b>' + (p.qty || 0) + '</b>'; }).join(' · ') + '</span>');
    if (q.colors && q.colors.length) bits.push('<span class="qtag"><b>Цвет:</b> <span class="swatches">' + q.colors.map(swatch).join('') + '</span></span>');
    bits.push(hwLine(q.hardware));
    bits.push(tagLine('Упаковка', q.packaging));
    var parts = bits.filter(Boolean).length ? '<div class="qparts">' + bits.filter(Boolean).join('') + '</div>' : '';
    return '<a class="qcard" href="#/order/' + encodeURIComponent(q.order_id) + '">' +
      '<div class="qcard-top"><div>' +
      '<div class="qname">' + esc(q.name) + '</div>' +
      '<div class="qmeta">' + esc(q.client || '') + (q.start_date ? ' · старт ' + fmtDate(q.start_date) : '') + '</div></div>' +
      '<div class="qbadges">' + (q.group === 'in_progress' && q.stage_label ? '<span class="badge stage">' + esc(q.stage_label) + '</span>' : '') +
      moldBadge(q.mold) + deadlineBadge(q.deadline_state, q.deadline_buffer_days) + '</div></div>' +
      '<div class="qbody">' + thumb +
      '<div style="flex:1;min-width:180px">' + stageChips(q.stages) +
      '<div class="qhours">Итого: ' + fmtHours(q.hours.plan) + ' план · <b>' + fmtHours(q.hours.remaining) + ' осталось</b></div>' +
      '<div class="bar"><i style="width:' + prog + '%"></i></div></div>' +
      '<span class="open">Открыть &rarr;</span></div>' +
      parts + '</a>';
  }
  function blockedRow(b) {
    var cls = b.state === 'needs_review' ? 'muted' : 'warn';
    var reason = b.reason || (b.state === 'needs_review' ? 'Требует проверки' : 'Ждёт молд / Китай');
    return '<a class="brow" href="#/order/' + encodeURIComponent(b.order_id) + '"><div class="n">' + esc(b.name) + (b.client ? ' <small>· ' + esc(b.client) + '</small>' : '') + '</div>' +
      '<span class="badge ' + cls + '">' + esc(reason) + '</span><span class="open">Открыть &rarr;</span></a>';
  }

  function moldTransitRow(m) {
    var items = m.items && m.items.length ? ' <small>· ' + m.items.map(esc).join(', ') + '</small>' : '';
    var tail = [m.stage_label, m.delivery_label].filter(Boolean).map(esc).join(' · ');
    return '<div class="brow static"><div class="n">' + esc(m.name) + items + '</div>' +
      (tail ? '<span class="badge info">' + tail + '</span>' : '') + '</div>';
  }

  function monthLoadPanel(ml) {
    if (!ml || !(ml.capacity > 0)) return '';
    var soldPct = Math.max(0, Math.min(100, ml.sold_pct || 0));
    var closedPct = Math.max(0, Math.min(100, ml.closed_pct || 0));
    var gapTxt = ml.overbooked > 0 ? ('перепродано на ' + num(ml.overbooked) + ' ч')
      : ('свободно ещё ' + num(ml.free) + ' ч');
    var paceCls = ml.status === 'ahead' ? 'ok' : (ml.status === 'behind' ? 'bad' : 'muted');
    var d = Math.abs(Math.round(ml.pace_delta || 0));
    var paceTxt = ml.status === 'ahead' ? ('опережаем ' + d + ' ч') : (ml.status === 'behind' ? ('отстаём ' + d + ' ч') : 'в графике');
    return '<div class="section"><div class="panel mload">' +
      '<div class="mload-head"><h2 style="margin:0;font-size:18px;font-weight:900">Загрузка месяца · ' + esc(ml.month_label) + '</h2>' +
      '<span class="mload-cap">ёмкость ' + num(ml.capacity) + ' ч/мес</span></div>' +
      '<div class="mrow"><div class="mrow-top"><span class="mrow-l">🟦 Продано <small>· коммерческий</small></span>' +
      '<span class="mrow-r"><b>' + num(ml.sold) + '</b> ч · ' + soldPct + '% · ' + gapTxt + '</span></div>' +
      '<div class="bar big blue"><i style="width:' + soldPct + '%"></i></div></div>' +
      '<div class="mrow"><div class="mrow-top"><span class="mrow-l">🟩 Сделано <small>· производство</small> <span class="badge ' + paceCls + '">' + paceTxt + '</span></span>' +
      '<span class="mrow-r"><b>' + num(ml.closed) + '</b> ч · ' + closedPct + '% · из проданного осталось ' + num(ml.sold_remaining) + ' ч</span></div>' +
      '<div class="bar big green"><i style="width:' + closedPct + '%"></i></div></div>' +
      '<div class="mload-hint">продано = заказы в работе/образцах · сделано = табель за месяц · ёмкость по фин-модели</div>' +
      '</div></div>';
  }

  function renderBoard(plan) {
    lastPlan = plan;
    var s = plan.summary || {};
    var risk = s.first_overload_date ? { cls: 'warn', lbl: 'Первый перегруз', val: fmtDate(s.first_overload_date) }
      : (s.late_count ? { cls: 'warn', lbl: 'Опаздывают', val: s.late_count + ' <small>зак.</small>' }
        : { cls: '', lbl: 'Риски', val: 'нет' });
    var cal = plan.calendar || { days: [], rows: [] };
    var allDays = cal.days || [];
    var maxWeek = Math.max(0, Math.ceil(allDays.length / 7) - 1);
    if (boardWeek > maxWeek) boardWeek = maxWeek;
    if (boardWeek < 0) boardWeek = 0;
    var weekDays = allDays.slice(boardWeek * 7, boardWeek * 7 + 7);
    var weekLabel = weekDays.length ? fmtDate(weekDays[0].date) + '–' + fmtDate(weekDays[weekDays.length - 1].date) : '';
    app.innerHTML = headerHtml(plan.generated_at) +
      '<div class="cards">' +
      cardHtml('Сейчас в цехе', plan.in_shop_count + ' <small>чел.</small>') +
      cardHtml('Мощность', plan.daily_capacity_hours + ' <small>ч/день</small>') +
      cardHtml('В очереди', (s.queue_count || 0) + ' <small>зак. · ' + fmtHours(s.queue_hours_remaining) + '</small>') +
      cardHtml(risk.lbl, risk.val, risk.cls) +
      '</div>' +
      monthLoadPanel(plan.month_load) +
      '<div class="section"><div class="panel">' +
      '<div class="calhead">' +
      '<h2 style="margin:0;font-size:18px;font-weight:900">Календарь</h2>' +
      '<div class="legend"><span><i class="dot" style="background:var(--amber)"></i>Литьё</span>' +
      '<span><i class="dot" style="background:var(--cyan)"></i>Сборка</span>' +
      '<span><i class="dot" style="background:var(--violet)"></i>Упаковка</span></div></div>' +
      '<div class="calnav">' +
      '<button class="calnav-btn"' + (boardWeek <= 0 ? ' disabled' : '') + ' onclick="window.__floorWeek(-1)">&lsaquo; Раньше</button>' +
      '<span class="calnav-label">' + esc(weekLabel) + (boardWeek === 0 ? ' · текущая неделя' : '') + '</span>' +
      '<button class="calnav-btn"' + (boardWeek >= maxWeek ? ' disabled' : '') + ' onclick="window.__floorWeek(1)">Дальше &rsaquo;</button>' +
      '</div>' +
      (buildCalendar(weekDays, cal.rows) || '<div class="qmeta">Нет данных календаря</div>') +
      '</div></div>' +
      (function () {
        var inProg = plan.queue.filter(function (q) { return q.group === 'in_progress'; });
        var waiting = plan.queue.filter(function (q) { return q.group !== 'in_progress'; });
        var transit = plan.mold_transit || [];
        return '' +
          '<div class="section"><h2>🟢 Сейчас в работе</h2>' +
          (inProg.length ? inProg.map(queueCard).join('') : '<div class="panel qmeta">Сейчас в цехе ничего не запущено</div>') + '</div>' +
          '<div class="section"><h2>🔵 Очередь к запуску</h2>' +
          (waiting.length ? waiting.map(queueCard).join('') : '<div class="panel qmeta">Очередь пуста</div>') + '</div>' +
          (plan.blocked.length ? '<div class="section"><h2>🟠 Ждут молд</h2>' + plan.blocked.map(blockedRow).join('') + '</div>' : '') +
          (transit.length ? '<div class="section"><h2>✈️ Формы в пути из Китая</h2>' + transit.map(moldTransitRow).join('') + '</div>' : '');
      })() +
      '<div class="foot">Только просмотр · обновляется автоматически каждые ~15 минут</div>';
  }

  function spec(k, vHtml) { return '<div class="spec"><div class="k">' + esc(k) + '</div><div class="v">' + vHtml + '</div></div>'; }
  function itemRow(it) {
    var kindLbl = it.kind === 'hardware' ? 'Фурнитура' : it.kind === 'packaging' ? 'Упаковка' : 'Изделие';
    var colors = it.colors && it.colors.length ? '<div class="swatches" style="margin-top:4px">' + it.colors.map(swatch).join('') + '</div>' : '';
    var pic = it.thumb_url ? '<div class="ithumb">' + zoomImg(it.thumb_url, 'ithumb-img') + '</div>' : '<div class="ithumb ph"></div>';
    return '<div class="irow">' + pic + '<div class="ikind">' + kindLbl + '</div><div class="iname">' + esc(it.name) + colors + '</div><div class="iqty">' + (it.quantity || 0) + ' шт</div></div>';
  }
  function stageRow(s) {
    var done = s.plan > 0 && s.remaining <= 0;
    var tail = done ? '<b style="color:var(--ok-tx)">готово</b>' : '<b>' + fmtHours(s.remaining) + ' осталось</b>';
    return '<div class="stage"><i class="dot" style="background:' + (STAGE_COLORS[s.stage] || '#94a3b8') + '"></i>' +
      '<span class="sname">' + esc(s.label || s.stage) + '</span>' +
      '<span class="sh">' + fmtHours(s.plan) + ' план · ' + fmtHours(s.fact) + ' факт · ' + tail + '</span></div>';
  }

  function renderOrder(o) {
    var photoList = (o.photos && o.photos.length) ? o.photos : (o.photo_url ? [o.photo_url] : []);
    var photo = photoList.length
      ? '<div class="gallery">' + photoList.map(function (u) { return zoomImg(u, 'photo'); }).join('') + '</div>'
      : '<div class="photo ph"><span>нет фото</span></div>';
    var specs = [];
    if (o.mold) specs.push(spec('Форма', o.mold === 'waiting' ? '<span class="molw">нужна · ждём</span>' : '<span class="molr">есть</span>'));
    // Количество — по каждому изделию (в «Составе заказа» ниже), не общим комком.
    if (o.colors && o.colors.length) specs.push(spec('Цвет', '<div class="swatches">' + o.colors.map(swatch).join('') + '</div>'));
    if (o.weight_grams) specs.push(spec('Вес', o.weight_grams + ' г'));
    if (o.nfc && o.nfc.is_nfc) specs.push(spec('NFC', o.nfc.programming ? 'да · программирование' : 'да'));
    var calHtml = (o.calendar_days && o.calendar_days.length)
      ? '<div class="section"><div class="panel"><h3 class="card-h">Календарь заказа</h3>' +
        buildCalendar(o.calendar_days, [{ name: 'Этапы', client: '', cells: segMap(o.calendar_segments) }], '') + '</div></div>'
      : '';
    app.innerHTML = '<a class="back" href="#/">&larr; К календарю</a>' +
      '<div class="ohead"><div><div class="oname">' + esc(o.name) + '</div>' +
      '<div class="oclient">' + esc(o.client || '') + ' · заказ №' + esc(o.order_id) + '</div></div>' +
      '<div class="obadges">' + (o.status_label ? '<span class="badge status">' + esc(o.status_label) + '</span>' : '') +
      deadlineBadge(o.deadline_state, o.deadline_buffer_days) + '</div></div>' +
      calHtml +
      '<div class="section"><div class="panel"><h3 class="card-h">Что делаем</h3>' +
      '<div class="make">' + photo + '<div class="specs">' + (specs.join('') || '<div class="qmeta">Нет доп. данных</div>') + '</div></div></div></div>' +
      (o.items && o.items.length ? '<div class="section"><div class="panel"><h3 class="card-h">Состав заказа</h3>' + o.items.map(itemRow).join('') + '</div></div>' : '') +
      '<div class="section"><div class="panel"><h3 class="card-h">Этапы и часы</h3>' + (o.stages || []).map(stageRow).join('') + '</div></div>' +
      (o.note ? '<div class="section"><div class="note"><div class="k">Примечание для цеха</div><div class="v">' + esc(o.note) + '</div></div></div>' : '') +
      '<div class="foot">Только просмотр</div>';
  }

  function currentRoute() { var m = location.hash.match(/^#\/order\/(.+)$/); return m ? { view: 'order', id: decodeURIComponent(m[1]) } : { view: 'board' }; }
  function route() {
    var r = currentRoute();
    app.innerHTML = '<div class="loading">Загрузка…</div>';
    var p = r.view === 'order' ? fetchJSON('orders/' + encodeURIComponent(r.id) + '.json').then(renderOrder) : fetchJSON('plan.json').then(renderBoard);
    p.catch(function () {
      app.innerHTML = '<div class="error">Не удалось загрузить данные.<button onclick="window.__floorRefresh()">Повторить</button></div>';
    });
    window.scrollTo(0, 0);
  }
  window.__floorZoom = function (url) {
    var lb = document.getElementById('floor-lb');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'floor-lb';
      lb.className = 'lightbox';
      lb.innerHTML = '<img alt=""><span class="lb-close">×</span>';
      lb.addEventListener('click', function () { lb.classList.remove('on'); });
      document.body.appendChild(lb);
    }
    lb.querySelector('img').src = url;
    lb.classList.add('on');
  };
  window.__floorRefresh = route;
  window.__floorWeek = function (d) { boardWeek += d; if (lastPlan) renderBoard(lastPlan); };
  window.addEventListener('hashchange', route);
  setInterval(function () { if (currentRoute().view === 'board') route(); }, 15 * 60 * 1000);
  route();
})();
