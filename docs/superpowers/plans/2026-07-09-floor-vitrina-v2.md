# Витрина производства 2.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разделить на витрине «что идёт сейчас / что ждём и почему», добавить блок «Формы в пути из Китая», крупные цвета с фото и фото-примеры из заказов.

**Architecture:** Publisher (`scripts/production-floor-publish.mjs`) добавляет в `plan.json` группировку очереди (`group`) + новый массив `mold_transit` из `china_purchases`, и извлекает base64-фото из `color_solution_attachment` в файлы `photos/` со ссылками. Фронт (`production-floor/app.js` + `style.css`) рендерит 4 блока доски и галерею фото на странице заказа. Спека: `docs/superpowers/specs/2026-07-09-floor-vitrina-v2-design.md`.

**Tech Stack:** Vanilla JS (без сборщика), Node ESM publisher с `vm`-движком `js/production-core.js`, node:assert smoke-тесты, фикстуры JSON.

**Data contracts (locked):**
- `plan.json` каждый `queue[i]` получает: `status` (raw), `stage_label` (строка этапа), `group` (`'in_progress'` | `'queue'`).
- `plan.json` новый top-level `mold_transit: [{ name, items: [string], stage_label, delivery_label }]` (без денег).
- `orders/<id>.json` новый `photos: [url,...]`; `photo_url` = `photos[0]` если есть, иначе прежний thumb.
- Фото-файлы: `photos/<order_id>-<item>-<n>.<ext>`, ссылки **относительные** (`photos/...`).

---

## Task 1: Группировка очереди — «в работе» vs «очередь»

**Files:**
- Modify: `scripts/production-floor-publish.mjs` (queue-builder в `toPublicPlan`, ~347–364)
- Test: `tests/production-floor-publish-smoke.js`

- [ ] **Step 1: Добавить константу и helper (после `STATUS_LABELS`, ~строка 38)**

```javascript
// Статусы, означающие «заказ реально идёт в цехе сейчас» (vs готов и ждёт слот).
const IN_PROGRESS_STATUSES = new Set(['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery']);
function queueGroup(status) { return IN_PROGRESS_STATUSES.has(String(status)) ? 'in_progress' : 'queue'; }
```

- [ ] **Step 2: В `toPublicPlan`, внутри `model.queue.map(q => {...})`, добавить в возвращаемый объект три поля**

Найти в объекте очереди строку `hours: { ... },` и сразу после блока `hours` добавить:

```javascript
            status: q.status || null,
            stage_label: STATUS_LABELS[q.status] || '',
            group: queueGroup(q.status),
```

- [ ] **Step 3: Обновить smoke — очередь всё ещё 1, но теперь несёт `group`**

В `tests/production-floor-publish-smoke.js` после строки `assert.equal(plan.queue[0].order_id, 501, ...)` добавить:

```javascript
assert.ok(['in_progress', 'queue'].includes(plan.queue[0].group), 'queue entry must carry a group');
assert.ok('stage_label' in plan.queue[0], 'queue entry must carry stage_label');
```

- [ ] **Step 4: Прогнать smoke**

Run: `cd <repo> && node tests/production-floor-publish-smoke.js`
Expected: `production-floor-publish: wrote plan.json ...` и процесс завершается без ошибок (exit 0).

- [ ] **Step 5: Commit**

```bash
git add scripts/production-floor-publish.mjs tests/production-floor-publish-smoke.js
git commit -m "floor: group queue into in-progress vs waiting"
```

---

## Task 2: Блок «Формы в пути из Китая» в plan.json

**Files:**
- Modify: `scripts/production-floor-publish.mjs`
- Test: `tests/production-floor-publish-smoke.js`
- Fixture: `tests/fixtures/production-floor-publish-fixture.json`

- [ ] **Step 1: Добавить builder (рядом с другими builder-функциями, перед `toPublicPlan`, ~строка 330)**

```javascript
// Этапы доставки закупки из Китая (для читаемого статуса).
const CHINA_STAGE_LABELS = {
    in_china_warehouse: 'На складе в Китае', consolidating: 'Консолидация',
    in_transit: 'Летит', received: 'Получено', delivered: 'Доставлено',
};
const CHINA_DELIVERY_LABELS = { air_fast: 'Авиа (быстро)', air: 'Авиа', sea: 'Море', truck: 'Авто', rail: 'Ж/д' };

// Публичная доска «Формы в пути»: только реально едущие закупки (in_transit).
// ВАЖНО: никаких денег — только название, названия позиций, стадия, тип доставки.
function buildMoldTransit(chinaPurchases) {
    return (chinaPurchases || [])
        .filter(row => String(row.status) === 'in_transit')
        .map(row => {
            const pd = parseMaybe(row.purchase_data) || {};
            const history = Array.isArray(pd.status_history) ? pd.status_history : [];
            const lastStage = history.length ? history[history.length - 1].status : row.status;
            const items = (Array.isArray(pd.items) ? pd.items : [])
                .map(it => String(it && it.name || '').trim())
                .filter(Boolean);
            return {
                name: String(pd.purchase_name || '').trim(),
                items,
                stage_label: CHINA_STAGE_LABELS[lastStage] || CHINA_STAGE_LABELS[row.status] || '',
                delivery_label: CHINA_DELIVERY_LABELS[pd.delivery_type] || '',
            };
        })
        .filter(m => m.name);
}
```

- [ ] **Step 2: В `toPublicPlan` вернуть новое поле**

В return-объекте `toPublicPlan` после `blocked,` добавить строку:

```javascript
        mold_transit: buildMoldTransit(data.chinaPurchases),
```

- [ ] **Step 3: В фикстуре сделать закупку `in_transit` с позициями и историей**

В `tests/fixtures/production-floor-publish-fixture.json` заменить массив `chinaPurchases` на:

```json
  "chinaPurchases": [
    { "id": 9001, "status": "in_transit", "purchase_data": { "purchase_name": "Молды купер 2шт + варежка", "delivery_type": "air_fast", "items": [ { "name": "Форма ТПА", "qty": 1 }, { "name": "Молд купер", "qty": 2 } ], "status_history": [ { "status": "in_china_warehouse", "date": "2026-07-01T00:00:00Z" }, { "status": "in_transit", "date": "2026-07-06T00:00:00Z" } ] } },
    { "id": 9002, "status": "received", "purchase_data": { "purchase_name": "Уже приехало", "items": [ { "name": "Гвоздики", "qty": 3000 } ] } }
  ],
```

- [ ] **Step 4: Добавить проверки в smoke**

После структурных проверок plan.json в `tests/production-floor-publish-smoke.js` добавить:

```javascript
// ---- Формы в пути: только in_transit, без денег ----
assert.ok(Array.isArray(plan.mold_transit), 'plan.mold_transit must be an array');
assert.equal(plan.mold_transit.length, 1, 'only the in_transit purchase is shown');
assert.equal(plan.mold_transit[0].name, 'Молды купер 2шт + варежка', 'transit name from purchase_name');
assert.deepEqual(plan.mold_transit[0].items, ['Форма ТПА', 'Молд купер'], 'transit items are names only');
assert.equal(plan.mold_transit[0].stage_label, 'Летит', 'stage from last status_history entry');
assert.ok(!JSON.stringify(plan.mold_transit).includes('qty'), 'no qty/price fields leak into transit board');
```

- [ ] **Step 5: Прогнать smoke**

Run: `node tests/production-floor-publish-smoke.js`
Expected: exit 0, без ошибок ассертов. (Leak-тест FORBIDDEN уже покрывает `purchase`/`price` — убеждаемся, что не всплыли.)

- [ ] **Step 6: Commit**

```bash
git add scripts/production-floor-publish.mjs tests/production-floor-publish-smoke.js tests/fixtures/production-floor-publish-fixture.json
git commit -m "floor: publish 'molds in transit from China' board (no money)"
```

---

## Task 3: Извлечение фото-примеров (base64 → файлы)

**Files:**
- Modify: `scripts/production-floor-publish.mjs`
- Test: `tests/production-floor-publish-smoke.js`
- Fixture: `tests/fixtures/production-floor-publish-fixture.json`

- [ ] **Step 1: Добавить парсер вложений и запись файла (после `parseMaybe`, ~строка 77)**

```javascript
// Разбор color_solution_attachment: JSON-строка-объект ИЛИ массив таких.
// Каждый элемент: { name, type, size, data:'data:image/...;base64,...' }.
function parseAttachments(raw) {
    const v = parseMaybe(raw);
    if (Array.isArray(v)) return v.filter(Boolean);
    if (v && typeof v === 'object') return [v];
    return [];
}
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
// Пишет одно изображение из base64 в OUT/photos, возвращает относительный URL или null.
// Безопасность: пишем ТОЛЬКО валидный data:image base64 известного типа. Иначе — null.
function writePhotoFile(att, outDir, baseName) {
    const data = att && typeof att.data === 'string' ? att.data : (typeof att === 'string' ? att : '');
    const m = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(data);
    if (!m) return null;
    const ext = IMAGE_EXT[m[1].toLowerCase()];
    if (!ext) return null;
    let buf;
    try { buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64'); } catch { return null; }
    if (!buf.length) return null;
    const dir = path.join(outDir, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    const file = `${baseName}.${ext}`;
    fs.writeFileSync(path.join(dir, file), buf);
    return `photos/${file}`;
}
```

- [ ] **Step 2: Добавить пре-пасс по всем изделиям (в `main`, сразу после `PUB.data = data;`, ~строка 425)**

```javascript
    // Извлечь фото-примеры (base64 → файлы) один раз; собрать индексы order/item -> [url].
    const photosByOrder = new Map();
    const photosByItemId = new Map();
    for (const it of data.flatItems) {
        const atts = parseAttachments(it.color_solution_attachment);
        if (!atts.length) continue;
        const urls = [];
        atts.forEach((a, i) => { const u = writePhotoFile(a, OUT_DIR, `${it.order_id}-${it.item_number != null ? it.item_number : it.id}-${i}`); if (u) urls.push(u); });
        if (urls.length) {
            photosByItemId.set(String(it.id), urls);
            photosByOrder.set(Number(it.order_id), (photosByOrder.get(Number(it.order_id)) || []).concat(urls));
        }
    }
    PUB.photosByOrder = photosByOrder;
```

- [ ] **Step 3: Расширить `PUB` и использовать реальные фото как thumb**

Заменить объявление `const PUB = { data: null };` (~строка 345) на:

```javascript
const PUB = { data: null, photosByOrder: new Map() };
```

В `productSummary` заменить строку `const thumb = first.template_id != null || first.color_solution_attachment ? resolvePhoto(first, PUB.data) : null;` на:

```javascript
    const extracted = PUB.photosByOrder.get(Number(orderId)) || [];
    const thumb = extracted[0] || (first.template_id != null ? resolvePhoto(first, PUB.data) : null);
```

- [ ] **Step 4: В `toPublicOrder` вернуть массив всех фото**

В return-объекте `toPublicOrder` заменить `nfc: ps.nfc, photo_url: ps.thumb,` на:

```javascript
        nfc: ps.nfc,
        photos: PUB.photosByOrder.get(Number(orderId)) || [],
        photo_url: (PUB.photosByOrder.get(Number(orderId)) || [])[0] || ps.thumb,
```

- [ ] **Step 5: В фикстуре дать одному изделию base64-вложение (1×1 png) + массив на другом**

В `tests/fixtures/production-floor-publish-fixture.json` у изделия заказа 501 (item_type product) добавить в его `item_data` поле:

```json
"color_solution_attachment": { "name": "ex.png", "type": "image/png", "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }
```

(Если структура фикстуры хранит `item_data` как объект — добавить ключ в него; если как строку — вписать поле в JSON-строку. Проверить фактическую форму перед правкой.)

- [ ] **Step 6: Добавить проверки в smoke**

После проверок структуры заказа добавить:

```javascript
// ---- Фото-примеры извлечены в файлы, ссылки относительные, base64 не утёк ----
const withPhotos = Object.values(orders).find(o => o.photos && o.photos.length);
assert.ok(withPhotos, 'at least one order must expose extracted photos');
assert.ok(withPhotos.photos.every(u => /^photos\//.test(u)), 'photo urls must be relative photos/*');
assert.ok(!/data:image/i.test(allText), 'no base64 image data may appear in JSON');
assert.ok(fs.existsSync(path.join(out, withPhotos.photos[0])), 'extracted photo file must exist on disk');
```

- [ ] **Step 7: Прогнать smoke**

Run: `node tests/production-floor-publish-smoke.js`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/production-floor-publish.mjs tests/production-floor-publish-smoke.js tests/fixtures/production-floor-publish-fixture.json
git commit -m "floor: extract order example photos (base64) to image files"
```

---

## Task 4: Фронт — доска из 4 блоков

**Files:**
- Modify: `production-floor/app.js` (`queueCard` ~77, `renderBoard` ~104–141)

- [ ] **Step 1: `queueCard` — показать этап для «в работе»**

В `queueCard`, сразу после строки `deadlineBadge(q.deadline_state, q.deadline_buffer_days) + '</div>' +` вставить (в блок `qcard-top`, перед `deadlineBadge` в той же строке) бейдж этапа. Заменить фрагмент:

```javascript
      '<div class="qmeta">' + esc(q.client || '') + (q.start_date ? ' · старт ' + fmtDate(q.start_date) : '') + '</div></div>' +
      deadlineBadge(q.deadline_state, q.deadline_buffer_days) + '</div>' +
```

на:

```javascript
      '<div class="qmeta">' + esc(q.client || '') + (q.start_date ? ' · старт ' + fmtDate(q.start_date) : '') + '</div></div>' +
      '<div class="qbadges">' + (q.group === 'in_progress' && q.stage_label ? '<span class="badge stage">' + esc(q.stage_label) + '</span>' : '') +
      deadlineBadge(q.deadline_state, q.deadline_buffer_days) + '</div></div>' +
```

- [ ] **Step 2: Добавить рендер блока «Формы в пути» (новая функция перед `renderBoard`)**

```javascript
  function moldTransitRow(m) {
    var items = m.items && m.items.length ? ' <small>· ' + m.items.map(esc).join(', ') + '</small>' : '';
    var tail = [m.stage_label, m.delivery_label].filter(Boolean).map(esc).join(' · ');
    return '<div class="brow static"><div class="n">' + esc(m.name) + items + '</div>' +
      (tail ? '<span class="badge info">' + tail + '</span>' : '') + '</div>';
  }
```

- [ ] **Step 3: Разбить очередь на 2 блока + переименовать блокеры + добавить «Формы в пути»**

В `renderBoard` заменить блок от `'<div class="section"><h2>Очередь к запуску</h2>' +` до `'<div class="foot">...` включительно на:

```javascript
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
```

(Убедиться, что удаляемый старый фрагмент — это две строки: `Очередь к запуску` и условная `Ждут молд / Китай`, а также хвост `foot`. Новый фрагмент их заменяет целиком.)

- [ ] **Step 4: Проверить в браузере (локальный сервер)**

Run: `cd <repo> && node scripts/production-floor-publish.mjs` c `RO_FLOOR_FIXTURE=tests/fixtures/production-floor-publish-fixture.json RO_FLOOR_OUT_DIR=/tmp/floorprev` затем `python3 -m http.server 4178 --directory /tmp/floorprev` и открыть `http://localhost:4178/` (скопировав `production-floor/*` в тот же каталог).
Expected: доска показывает 4 блока: Сейчас в работе / Очередь / Ждут молд / Формы в пути.

- [ ] **Step 5: Commit**

```bash
git add production-floor/app.js
git commit -m "floor UI: split board into in-progress / queue / waiting / molds-in-transit"
```

---

## Task 5: Фронт — крупные цвета + галерея фото заказа

**Files:**
- Modify: `production-floor/app.js` (`renderOrder` ~157–180)
- Modify: `production-floor/style.css`

- [ ] **Step 1: Галерея всех фото на странице заказа**

В `renderOrder` заменить строку:

```javascript
    var photo = o.photo_url ? '<img class="photo" src="' + escAttr(o.photo_url) + '" alt="">' : '<div class="photo ph"><span>нет фото</span></div>';
```

на:

```javascript
    var photoList = (o.photos && o.photos.length) ? o.photos : (o.photo_url ? [o.photo_url] : []);
    var photo = photoList.length
      ? '<div class="gallery">' + photoList.map(function (u) { return '<img class="photo" src="' + escAttr(u) + '" alt="">'; }).join('') + '</div>'
      : '<div class="photo ph"><span>нет фото</span></div>';
```

- [ ] **Step 2: CSS — крупнее свотчи цвета и стиль галереи/бейджей**

В конец `production-floor/style.css` добавить:

```css
/* Витрина 2.0 — крупные цвета, галерея, бейджи этапа/транзита */
.swatch { font-size: 15px; gap: 8px; }
.swatch img, .swatch .nohex { width: 34px; height: 34px; border-radius: 8px; }
.gallery { display: flex; flex-wrap: wrap; gap: 10px; }
.gallery .photo { width: 160px; height: 160px; object-fit: cover; border-radius: 12px; }
.qbadges { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.badge.stage { background: #fef3c7; color: #92400e; }
.badge.info { background: #e0f2fe; color: #075985; }
.brow.static { cursor: default; }
```

(Если в `style.css` уже есть правило `.swatch img` — заменить его значения на указанные, а не дублировать.)

- [ ] **Step 3: Проверить в браузере**

Открыть `http://localhost:4178/#/order/501`.
Expected: цвета крупными плашками; если у заказа есть фото — галерея из картинок; иначе «нет фото».

- [ ] **Step 4: Commit**

```bash
git add production-floor/app.js production-floor/style.css
git commit -m "floor UI: larger colour swatches + order photo gallery"
```

---

## Task 6: Регрессия + деплой-проверка

**Files:**
- Verify only.

- [ ] **Step 1: Прогнать оба floor-smoke + производственный smoke**

Run:
```bash
node tests/production-floor-publish-smoke.js
node tests/production-floor-core-smoke.js
node tests/production-calendar-smoke.js
```
Expected: все три завершаются exit 0 без ассерт-ошибок.

- [ ] **Step 2: Реальный прогон publisher на живых данных (Supabase поднят) — фото и транзит появились**

Run:
```bash
RO_FLOOR_OUT_DIR=/tmp/floorlive node scripts/production-floor-publish.mjs
node -e 'const p=require("/tmp/floorlive/plan.json"); console.log("in_progress:", p.queue.filter(q=>q.group==="in_progress").length, "| queue:", p.queue.filter(q=>q.group!=="in_progress").length, "| blocked:", p.blocked.length, "| transit:", p.mold_transit.length); const fs=require("fs"); console.log("photo files:", fs.existsSync("/tmp/floorlive/photos") ? fs.readdirSync("/tmp/floorlive/photos").length : 0);'
```
Expected: непустые группы; `transit` ≥ 0; счётчик файлов фото ≥ 1 (в базе есть ~11 вложений).

- [ ] **Step 3: Ключевой leak-аудит на ЖИВОМ выводе**

Run:
```bash
node -e 'const fs=require("fs");let t=fs.readFileSync("/tmp/floorlive/plan.json","utf8");for(const f of fs.readdirSync("/tmp/floorlive/orders"))t+=fs.readFileSync("/tmp/floorlive/orders/"+f,"utf8");const bad=/price|cost|margin|revenue|bank|inn|telegram|data:image|eyJhbGci|supabase\.co/i.exec(t);console.log(bad?("LEAK: "+bad[0]):"clean — no money/PII/keys/base64");'
```
Expected: `clean — no money/PII/keys/base64`.

- [ ] **Step 4: Убедиться, что деплой заливает `photos/`**

Проверить, что `scripts/build-yandex-static.mjs` `buildFloor()` копирует `production-floor/` в `dest` и запускает publisher с `RO_FLOOR_OUT_DIR=dest` (фото пишутся в `dest/photos`), а `.github/workflows/yandex-static-sync.yml` заливает всё дерево. Если `photos/` не под правило no-cache — это ок (картинки можно кэшировать).
Expected: подтверждение путей; правок не требуется (если требуется — добавить копирование `photos/`).

- [ ] **Step 5: Финальный commit (если были правки деплоя) и push**

```bash
git add -A
git commit -m "floor: verify vitrina 2.0 regression + deploy wiring"
git push -u origin feature/floor-vitrina-2
```

---

## Self-Review notes

- **Spec coverage:** разделение в работе/ждём → Task 1+4; «Формы в пути» → Task 2+4; фото-примеры → Task 3+5; крупные цвета → Task 5; приватность → Task 2/3 (leak-тесты) + Task 6 Step 3. Все пункты спеки покрыты.
- **Фурнитура текстом:** уже так (Task ничего не ломает — `hardware` без colors/thumb).
- **Молд-привязка:** намеренно вне области (спека §вне области).
- **Типы согласованы:** `group`, `stage_label`, `mold_transit`, `photos` — одни и те же имена в publisher и во фронте.
