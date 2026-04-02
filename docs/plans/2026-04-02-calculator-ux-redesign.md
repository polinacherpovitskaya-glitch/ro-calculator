# Calculator UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add progressive disclosure to the calculator page — numbered sections, collapsible item cards, and an empty state — without touching any calculation or warehouse logic.

**Architecture:** CSS-only styles appended to `style.css`; HTML restructuring in `index.html` to wrap existing elements in numbered section wrappers; two small JS methods added to `app.js` (Calculator object) plus minimal changes to `renderItemBlock`, `addItem`, and `removeItem`.

**Tech Stack:** Vanilla JS, HTML, CSS. No build step. Test by opening the site in a browser.

**Spec:** `docs/specs/2026-04-02-calculator-ux-redesign.md`

---

## File Map

| File | Change |
|------|--------|
| `css/style.css` | Append new CSS rules at end (lines ~3746+) |
| `index.html` | Wrap calculator sections in numbered divs (lines 132–263) |
| `js/app.js` | Modify `renderItemBlock` (line 1308–1427); add `toggleItemCollapse` + `_updateItemsEmptyState`; wire them into `addItem` (line 1104) and `removeItem` (line 3148) |

---

## Task 1: CSS — Numbered sections and item collapse styles

**Files:**
- Modify: `css/style.css` (append after last line)

- [ ] **Step 1: Append new CSS rules to style.css**

Open `css/style.css` and add the following block at the very end of the file:

```css
/* =============================================
   CALCULATOR SECTIONS — UX redesign 2026-04
   ============================================= */

.calc-section {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 16px;
    overflow: hidden;
}

.calc-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
}

.calc-section-number {
    background: var(--accent);
    color: #fff;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 12px;
    flex-shrink: 0;
}

.calc-section-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--text);
    flex: 1;
}

.calc-section-body {
    padding: 16px;
}

/* Section 2 (Изделия) gets a blue border — it's the main action */
.calc-section-main {
    border: 2px solid var(--accent);
}

.calc-section-main .calc-section-header {
    background: #eff6ff;
    border-bottom-color: #dbeafe;
}

.calc-section-main .calc-section-title {
    color: #1e40af;
}

/* Empty state shown when no items added yet */
.calc-empty-state {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-muted);
}

.calc-empty-state-icon {
    font-size: 32px;
    margin-bottom: 8px;
}

.calc-empty-state p {
    font-size: 13px;
    margin: 0 0 14px;
}

/* Item card collapse support */
.item-body {
    /* content is always block; toggled to none when collapsed */
}

.item-block.is-collapsed .item-body {
    display: none;
}

/* Summary row: visible only when collapsed */
.item-card-summary {
    display: none;
    padding: 8px 0 4px;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
}

.item-block.is-collapsed .item-card-summary {
    display: flex;
}

.item-summary-stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.item-summary-label {
    font-size: 10px;
    color: var(--text-muted);
}

.item-summary-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
}

/* Collapse toggle button in item header */
.item-collapse-btn {
    font-size: 11px !important;
    padding: 3px 8px !important;
    margin-right: 4px;
    flex-shrink: 0;
}

/* Delete button in item header — make it clearly destructive */
.item-block-header .btn-danger-sm {
    font-size: 12px;
    padding: 4px 8px;
    background: none;
    border: 1px solid var(--red);
    color: var(--red);
    border-radius: var(--radius);
    cursor: pointer;
    flex-shrink: 0;
    transition: var(--transition);
}

.item-block-header .btn-danger-sm:hover {
    background: var(--red-light);
}
```

- [ ] **Step 2: Verify file saved, check for syntax errors by opening site**

Open the site in browser. No visual change expected yet — just no broken CSS. Check browser console for errors.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: add calc section and item collapse CSS"
```

---

## Task 2: index.html — Wrap calculator sections in numbered divs

**Files:**
- Modify: `index.html` lines 132–263

The goal is to wrap existing elements in three `.calc-section` containers. The elements themselves (IDs, event handlers) stay unchanged.

- [ ] **Step 1: Replace the order info card with Section 1 wrapper**

Find this block in `index.html` (lines 132–220):
```html
            <!-- Order info -->
            <div class="card">
```

Replace the opening `<div class="card">` with a section wrapper, and remove the closing `</div>` of the card at line 220, replacing the whole order info block with:

```html
            <!-- SECTION 1: О заказе -->
            <div class="calc-section">
                <div class="calc-section-header">
                    <div class="calc-section-number">1</div>
                    <span class="calc-section-title">О заказе</span>
                </div>
                <div class="calc-section-body">
                <div class="form-row">
                    <div class="form-group">
                        <label>Название заказа</label>
                        <input type="text" id="calc-order-name" placeholder="Например: Брелоки для Яндекс" oninput="Calculator.scheduleAutosave()">
                    </div>
                    <div class="form-group">
                        <label>Клиент</label>
                        <input type="text" id="calc-client-name" placeholder="Компания" oninput="Calculator.scheduleAutosave()">
                    </div>
                    <div class="form-group">
                        <label>Менеджер</label>
                        <select id="calc-manager-name" onchange="Calculator.scheduleAutosave()">
                            <option value="">-- Выбрать --</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Начало</label>
                        <input type="date" id="calc-deadline-start" onchange="Calculator.scheduleAutosave()">
                    </div>
                    <div class="form-group">
                        <label>Дедлайн</label>
                        <input type="date" id="calc-deadline-end" onchange="Calculator.scheduleAutosave()">
                    </div>
                </div>
                <div class="form-group">
                    <label>Заметки</label>
                    <textarea id="calc-notes" rows="2" placeholder="Доп. информация по заказу" oninput="Calculator.scheduleAutosave()"></textarea>
                </div>

                <!-- Contacts (collapsible) -->
                <details class="calc-contacts-details">
                    <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-muted);margin:8px 0 6px">&#128222; Контакты и ссылки</summary>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Адрес доставки</label>
                            <input type="text" id="calc-delivery-address" placeholder="Город, улица, дом..." oninput="Calculator.scheduleAutosave()">
                        </div>
                        <div class="form-group">
                            <label>Telegram чат</label>
                            <input type="text" id="calc-telegram" placeholder="@username или ссылка" oninput="Calculator.scheduleAutosave()">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>CRM ссылка</label>
                            <input type="url" id="calc-crm-link" placeholder="https://..." oninput="Calculator.scheduleAutosave()">
                        </div>
                        <div class="form-group">
                            <label>Финтабло ссылка</label>
                            <input type="url" id="calc-fintablo-link" placeholder="https://..." oninput="Calculator.scheduleAutosave()">
                        </div>
                    </div>
                </details>

                <!-- Client Legal Details (collapsible, for KP) -->
                <details class="calc-contacts-details">
                    <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-muted);margin:8px 0 6px">&#9878; Юридические данные клиента (для КП)</summary>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Название компании (юр.)</label>
                            <input type="text" id="calc-client-legal-name" placeholder='ООО "Компания"' oninput="Calculator.scheduleAutosave()">
                        </div>
                        <div class="form-group">
                            <label>ИНН</label>
                            <input type="text" id="calc-client-inn" placeholder="1234567890" oninput="Calculator.scheduleAutosave()">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Юридический адрес</label>
                        <input type="text" id="calc-client-legal-address" placeholder="г. Москва, ул. ..." oninput="Calculator.scheduleAutosave()">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Банк</label>
                            <input type="text" id="calc-client-bank-name" placeholder="АО Тинькофф Банк" oninput="Calculator.scheduleAutosave()">
                        </div>
                        <div class="form-group">
                            <label>Р/с</label>
                            <input type="text" id="calc-client-bank-account" placeholder="40702810..." oninput="Calculator.scheduleAutosave()">
                        </div>
                        <div class="form-group">
                            <label>БИК</label>
                            <input type="text" id="calc-client-bank-bik" placeholder="044525974" oninput="Calculator.scheduleAutosave()">
                        </div>
                    </div>
                </details>
                </div><!-- /.calc-section-body -->
            </div><!-- /.calc-section (1) -->
```

- [ ] **Step 2: Replace items area with Section 2 wrapper**

Find this block (lines 222–233 in original):
```html
            <!-- Item blocks container -->
            <div id="calc-items-container"></div>

            <div style="text-align:center; margin: 12px 0;">
                <button class="btn btn-outline" id="calc-add-item-btn" onclick="Calculator.addItem()">+ Добавить изделие</button>
            </div>

            <!-- Pendant items -->
            <div id="calc-pendants-container"></div>
            <div style="text-align:center; margin: 8px 0;">
                <button class="btn btn-outline" onclick="Pendant.openWizard()">+ Подвес из букв</button>
            </div>
```

Replace with:
```html
            <!-- SECTION 2: Изделия -->
            <div class="calc-section calc-section-main">
                <div class="calc-section-header">
                    <div class="calc-section-number">2</div>
                    <span class="calc-section-title">Изделия</span>
                </div>

                <!-- Empty state (JS hides this when items exist) -->
                <div id="calc-items-empty" class="calc-empty-state">
                    <div class="calc-empty-state-icon">📦</div>
                    <p>Добавьте изделие чтобы начать расчёт</p>
                    <button class="btn btn-primary" onclick="Calculator.addItem()">+ Добавить изделие</button>
                    <div style="margin-top:8px">
                        <button class="btn btn-outline btn-sm" onclick="Pendant.openWizard()">или подвес из букв</button>
                    </div>
                </div>

                <!-- Items container -->
                <div id="calc-items-container" style="padding:0 16px"></div>

                <!-- Pendant items -->
                <div id="calc-pendants-container" style="padding:0 16px"></div>

                <!-- Add button row (JS hides this when no items) -->
                <div id="calc-items-add-row" style="padding:0 16px 16px;display:none">
                    <button class="btn btn-outline" id="calc-add-item-btn" onclick="Calculator.addItem()" style="width:100%">+ Добавить изделие</button>
                    <div style="text-align:center;margin-top:8px">
                        <button class="btn btn-outline btn-sm" onclick="Pendant.openWizard()">+ Подвес из букв</button>
                    </div>
                </div>
            </div><!-- /.calc-section (2) -->
```

- [ ] **Step 3: Replace hardware + packaging cards with Section 3 wrapper**

Find this block (lines 235–253 in original):
```html
            <!-- Hardware section (order-level, shared) -->
            <div class="card">
                <div class="card-header">
                    <h3>🔩 Общая фурнитура</h3>
                    <button class="btn btn-sm btn-outline" onclick="Calculator.addHardware()">+ Добавить</button>
                </div>
                <p class="text-muted" style="font-size:12px; margin-bottom:8px">Фурнитура на весь заказ (не привязана к конкретному изделию)</p>
                <div id="calc-hardware-list"></div>
            </div>

            <!-- Packaging section (order-level, shared) -->
            <div class="card">
                <div class="card-header">
                    <h3>📦 Общая упаковка</h3>
                    <button class="btn btn-sm btn-outline" onclick="Calculator.addPackaging()">+ Добавить</button>
                </div>
                <p class="text-muted" style="font-size:12px; margin-bottom:8px">Упаковка на весь заказ (общая коробка и т.д.)</p>
                <div id="calc-packaging-list"></div>
            </div>
```

Replace with:
```html
            <!-- SECTION 3: Фурнитура и упаковка -->
            <div class="calc-section">
                <div class="calc-section-header">
                    <div class="calc-section-number">3</div>
                    <span class="calc-section-title">Фурнитура и упаковка</span>
                </div>
                <div class="calc-section-body">

                    <div class="card-header" style="margin-bottom:8px">
                        <h3>🔩 Общая фурнитура</h3>
                        <button class="btn btn-sm btn-outline" onclick="Calculator.addHardware()">+ Добавить</button>
                    </div>
                    <p class="text-muted" style="font-size:12px; margin-bottom:8px">Фурнитура на весь заказ (не привязана к конкретному изделию)</p>
                    <div id="calc-hardware-list"></div>

                    <div class="card-header" style="margin-top:20px;margin-bottom:8px">
                        <h3>📦 Общая упаковка</h3>
                        <button class="btn btn-sm btn-outline" onclick="Calculator.addPackaging()">+ Добавить</button>
                    </div>
                    <p class="text-muted" style="font-size:12px; margin-bottom:8px">Упаковка на весь заказ (общая коробка и т.д.)</p>
                    <div id="calc-packaging-list"></div>

                </div><!-- /.calc-section-body -->
            </div><!-- /.calc-section (3) -->
```

- [ ] **Step 4: Open the site in browser and verify structure looks correct**

Expected: three numbered sections visible (① О заказе, ② Изделия with blue border, ③ Фурнитура и упаковка). Section 2 shows the empty state with "Добавьте изделие" and a blue button.

Check in browser console for JS errors. Specifically verify that `document.getElementById('calc-add-item-btn')` still returns the button (it must, since the ID is preserved in `#calc-items-add-row`).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: wrap calculator in numbered sections with empty state"
```

---

## Task 3: app.js — Modify renderItemBlock to support collapse/expand

**Files:**
- Modify: `js/app.js` lines 1308–1427 (the `html = \`...\`` template literal in `renderItemBlock`)

The change adds: (1) preserve collapse state across re-renders, (2) a toggle button in the header, (3) a summary row, (4) wraps form content in `.item-body`.

- [ ] **Step 1: Add collapse-state capture before the html template (line ~1307)**

Find this line in `renderItemBlock` (around line 1307, just before `const html = \``):
```javascript
        } catch (e) { console.error('[renderItemBlock] attachment block error:', e); }

        const html = `
```

Add the collapse-state capture between those two lines:
```javascript
        } catch (e) { console.error('[renderItemBlock] attachment block error:', e); }

        // Preserve collapse state when re-rendering an existing card
        const existingBlock = document.getElementById('item-block-' + idx);
        const wasCollapsed = existingBlock ? existingBlock.classList.contains('is-collapsed') : false;

        // Build summary values for collapsed view
        const summaryQty = item.quantity ? item.quantity.toLocaleString('ru') + ' шт' : '—';
        const firstColor = (item.colors && item.colors[0]) ? item.colors[0].name : '';
        const summaryColor = firstColor || '—';
        const summaryPrintQty = (item.printings || []).reduce((s, p) => s + (p.qty || 0), 0);
        const summaryPrint = summaryPrintQty > 0 ? summaryPrintQty.toLocaleString('ru') + ' шт' : '';
        const summaryPrice = item.sell_price_item > 0 ? item.sell_price_item + ' ₽/шт' : '';

        const html = `
```

- [ ] **Step 2: Update the root div and header in the template**

Find (inside the template, starting at the line after `const html = \``):
```javascript
        <div class="item-block" id="item-block-${idx}">
            <div class="item-block-header">
                <div class="item-num">${num}</div>
                <div class="item-title" id="item-title-${idx}">${item.product_name || 'Изделие ' + num}</div>
                <button class="btn btn-sm btn-outline" onclick="Calculator.cloneItem(${idx})">Клонировать</button>
                <button class="btn btn-sm btn-outline" onclick="Calculator.removeItem(${idx})">Удалить</button>
            </div>
```

Replace with:
```javascript
        <div class="item-block${wasCollapsed ? ' is-collapsed' : ''}" id="item-block-${idx}">
            <div class="item-block-header">
                <div class="item-num">${num}</div>
                <div class="item-title" id="item-title-${idx}">${item.product_name || 'Изделие ' + num}</div>
                <button class="btn btn-sm btn-outline item-collapse-btn" onclick="Calculator.toggleItemCollapse(${idx})">${wasCollapsed ? '▼ Показать' : '▲ Свернуть'}</button>
                <button class="btn btn-sm btn-outline" onclick="Calculator.cloneItem(${idx})">Клонировать</button>
                <button class="item-block-header btn-danger-sm" onclick="Calculator.removeItem(${idx})">✕</button>
            </div>
            <div class="item-card-summary">
                <div class="item-summary-stat">
                    <span class="item-summary-label">Кол-во</span>
                    <span class="item-summary-value">${summaryQty}</span>
                </div>
                <div class="item-summary-stat">
                    <span class="item-summary-label">Цвет</span>
                    <span class="item-summary-value">${summaryColor}</span>
                </div>
                ${summaryPrint ? `<div class="item-summary-stat">
                    <span class="item-summary-label">Печать</span>
                    <span class="item-summary-value">${summaryPrint}</span>
                </div>` : ''}
                ${summaryPrice ? `<div class="item-summary-stat">
                    <span class="item-summary-label">Цена/шт</span>
                    <span class="item-summary-value" style="color:var(--green)">${summaryPrice}</span>
                </div>` : ''}
            </div>
            <div class="item-body">
```

- [ ] **Step 3: Close the item-body div before the closing item-block div**

Find the end of the template (just before the closing `` ` ``):
```javascript
            <!-- Cost breakdown (calculated) -->
            <div class="cost-breakdown" id="item-cost-${idx}" style="display:none">
                ...
            </div>

        </div>`;
```

The last line of the template is `        </div>\`;\` — this closes `.item-block`. Add one more `</div>` before it to close `.item-body`:

Find:
```javascript
            </div>

        </div>`;

        // Replace existing block if re-rendering, otherwise append
```

Replace with:
```javascript
            </div>

            </div><!-- /.item-body -->
        </div>`;

        // Replace existing block if re-rendering, otherwise append
```

- [ ] **Step 4: Also remove the now-duplicate existingBlock lookup below**

The original code at line ~1430 had:
```javascript
        // Replace existing block if re-rendering, otherwise append
        const existingBlock = document.getElementById('item-block-' + idx);
```

Since we moved `existingBlock` to before the template in Step 1, find and change this line to just use the variable we already have:
```javascript
        // Replace existing block if re-rendering, otherwise append
        // (existingBlock captured above, before html template)
```

Remove the `const existingBlock = ...` line — just keep the `if (existingBlock)` block that follows it.

- [ ] **Step 5: Open browser, add an item, verify it shows expanded**

Navigate to `#calculator`. Click "+ Добавить изделие" in the empty state. A new item card should appear **expanded** (all fields visible). The header should have a "▲ Свернуть" button.

Check browser console for JS errors.

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat: item cards support collapse/expand with summary row"
```

---

## Task 4: app.js — Add toggleItemCollapse + _updateItemsEmptyState, wire into addItem/removeItem

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add toggleItemCollapse method to the Calculator object**

Find `removeItem(idx) {` (line ~3148) in the Calculator object. Add the two new methods **before** `removeItem`:

```javascript
    toggleItemCollapse(idx) {
        const block = document.getElementById('item-block-' + idx);
        if (!block) return;
        const isNowCollapsed = !block.classList.contains('is-collapsed');
        block.classList.toggle('is-collapsed', isNowCollapsed);
        const btn = block.querySelector('.item-collapse-btn');
        if (btn) btn.textContent = isNowCollapsed ? '▼ Показать' : '▲ Свернуть';
    },

    _updateItemsEmptyState() {
        const emptyEl = document.getElementById('calc-items-empty');
        const addRowEl = document.getElementById('calc-items-add-row');
        const hasItems = this.items.length > 0 || (this.pendantItems && this.pendantItems.length > 0);
        if (emptyEl) emptyEl.style.display = hasItems ? 'none' : '';
        if (addRowEl) addRowEl.style.display = hasItems ? '' : 'none';
    },

    removeItem(idx) {
```

- [ ] **Step 2: Call _updateItemsEmptyState in addItem**

Find `addItem()` (line ~1104):
```javascript
    addItem() {
        if (this.items.length >= this.maxItems) {
            App.toast('Максимум 6 изделий в заказе');
            return;
        }

        const idx = this.items.length;
        this.items.push(this.getEmptyItem(idx + 1));
        this.renderItemBlock(idx);

        if (this.items.length >= this.maxItems) {
            document.getElementById('calc-add-item-btn').style.display = 'none';
        }
        this.scheduleAutosave();
    },
```

Add `this._updateItemsEmptyState();` after `this.renderItemBlock(idx);`:
```javascript
    addItem() {
        if (this.items.length >= this.maxItems) {
            App.toast('Максимум 6 изделий в заказе');
            return;
        }

        const idx = this.items.length;
        this.items.push(this.getEmptyItem(idx + 1));
        this.renderItemBlock(idx);
        this._updateItemsEmptyState();

        if (this.items.length >= this.maxItems) {
            document.getElementById('calc-add-item-btn').style.display = 'none';
        }
        this.scheduleAutosave();
    },
```

- [ ] **Step 3: Call _updateItemsEmptyState in removeItem**

Find `removeItem(idx)` and add the call after `this.scheduleAutosave();` at the end:
```javascript
    removeItem(idx) {
        // ... existing code ...
        this.rerenderAllHardware();
        this.rerenderAllPackaging();
        this.recalculate();
        this.scheduleAutosave();
        this._updateItemsEmptyState();
    },
```

- [ ] **Step 4: Call _updateItemsEmptyState during page load and clone**

There are three more sites that re-render items and need the empty-state update:

**a) Load from DB** (line ~4827 in `js/app.js`):
Find:
```javascript
            this.items.push(item);
            this.renderItemBlock(i);
        });

        // Restore hardware items (load picker data first for warehouse mode)
```
Add after the `});`:
```javascript
            this.items.push(item);
            this.renderItemBlock(i);
        });
        this._updateItemsEmptyState();

        // Restore hardware items (load picker data first for warehouse mode)
```

**b) cloneItem** (line ~3220 in `js/app.js`):
Find:
```javascript
        const container = document.getElementById('calc-items-container');
        container.innerHTML = '';
        this.items.forEach((_, i) => this.renderItemBlock(i));
        this.rerenderAllHardware();
        this.rerenderAllPackaging();
        this.recalculate();
        this.scheduleAutosave();
    },
```
where the closing `},` belongs to `cloneItem`. Add `this._updateItemsEmptyState();` before `this.scheduleAutosave();`:
```javascript
        const container = document.getElementById('calc-items-container');
        container.innerHTML = '';
        this.items.forEach((_, i) => this.renderItemBlock(i));
        this.rerenderAllHardware();
        this.rerenderAllPackaging();
        this.recalculate();
        this._updateItemsEmptyState();
        this.scheduleAutosave();
    },
```

- [ ] **Step 5: Verify empty state toggle works**

In browser:
1. Go to `#calculator` (new order) → should see empty state (📦 message, blue button)
2. Click "+ Добавить изделие" → empty state disappears, item card appears expanded, add row appears at bottom
3. Click "▲ Свернуть" → item collapses to summary row (qty, color, price)
4. Click "▼ Показать" → item expands again
5. Click "✕" on item → item removed, empty state reappears
6. Open existing order → items shown, no empty state

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat: empty state and item collapse wired into addItem/removeItem"
```

---

## Task 5: app.js — Collapse "Дополнительно" checkboxes inside expanded item card

**Files:**
- Modify: `js/app.js` (inside `renderItemBlock` template, around lines 1353–1388)

The rare checkboxes (NFC, complex design, own mold, delivery) should be hidden under a "Дополнительно" toggle inside the expanded card, instead of always showing.

- [ ] **Step 1: Wrap the toggle-rows block in a `<details>` element**

In the `renderItemBlock` template, find the block with toggle-rows (starting after the `form-row` with qty/weight/pph):

```javascript
            ${showCustomOnly ? `
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-stock-mold-${idx}" ${item.base_mold_in_stock ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'base_mold_in_stock', this.checked)">
                <label for="item-stock-mold-${idx}">Молд уже лежит на складе и не идет в стоимость заказа</label>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Доп. молды</label>
                    <input type="number" min="0" value="${item.extra_molds || 0}" oninput="Calculator.onNumChange(${idx}, 'extra_molds', this.value)">
                    <span class="form-hint">${item.base_mold_in_stock ? 'В стоимость попадут только дополнительные молды сверх складского.' : 'Если нужен ещё один новый молд, укажите его здесь.'}</span>
                </div>
            </div>

            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-complex-${idx}" ${item.complex_design ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'complex_design', this.checked)">
                <label for="item-complex-${idx}">Сложное проектирование (+${formatRub(App.settings.design_cost)})</label>
            </div>
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-nfc-${idx}" ${item.is_nfc ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'is_nfc', this.checked)">
                <label for="item-nfc-${idx}">NFC метка (+${formatRub(App.settings.nfc_tag_cost)}/шт)</label>
            </div>
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-nfcprog-${idx}" ${item.nfc_programming ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'nfc_programming', this.checked)">
                <label for="item-nfcprog-${idx}">Программирование NFC</label>
            </div>
            ` : ''}
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-delivery-${idx}" ${item.delivery_included ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'delivery_included', this.checked)">
                <label for="item-delivery-${idx}">Доставка за наш счет (+${formatRub(App.settings.delivery_cost_moscow)})</label>
            </div>
```

Replace with (wrapped in a `<details>` that opens automatically if any option is active):

```javascript
            <details class="item-advanced-details" ${(item.base_mold_in_stock || item.complex_design || item.is_nfc || item.nfc_programming || item.delivery_included || !item.is_blank_mold) ? 'open' : ''}>
                <summary class="item-advanced-summary">Дополнительно</summary>
            ${showCustomOnly ? `
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-stock-mold-${idx}" ${item.base_mold_in_stock ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'base_mold_in_stock', this.checked)">
                <label for="item-stock-mold-${idx}">Молд уже лежит на складе и не идет в стоимость заказа</label>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Доп. молды</label>
                    <input type="number" min="0" value="${item.extra_molds || 0}" oninput="Calculator.onNumChange(${idx}, 'extra_molds', this.value)">
                    <span class="form-hint">${item.base_mold_in_stock ? 'В стоимость попадут только дополнительные молды сверх складского.' : 'Если нужен ещё один новый молд, укажите его здесь.'}</span>
                </div>
            </div>

            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-complex-${idx}" ${item.complex_design ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'complex_design', this.checked)">
                <label for="item-complex-${idx}">Сложное проектирование (+${formatRub(App.settings.design_cost)})</label>
            </div>
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-nfc-${idx}" ${item.is_nfc ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'is_nfc', this.checked)">
                <label for="item-nfc-${idx}">NFC метка (+${formatRub(App.settings.nfc_tag_cost)}/шт)</label>
            </div>
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-nfcprog-${idx}" ${item.nfc_programming ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'nfc_programming', this.checked)">
                <label for="item-nfcprog-${idx}">Программирование NFC</label>
            </div>
            ` : ''}
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-delivery-${idx}" ${item.delivery_included ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'delivery_included', this.checked)">
                <label for="item-delivery-${idx}">Доставка за наш счет (+${formatRub(App.settings.delivery_cost_moscow)})</label>
            </div>
            </details>
```

- [ ] **Step 2: Add CSS for the details/summary toggle**

Append to `css/style.css` (after the block added in Task 1):

```css
/* "Дополнительно" collapsible inside item card */
.item-advanced-details {
    border-top: 1px dashed var(--border);
    margin-top: 12px;
    padding-top: 4px;
}

.item-advanced-summary {
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    padding: 6px 0;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
}

.item-advanced-summary::before {
    content: '▸';
    font-size: 10px;
    transition: transform 0.15s;
}

.item-advanced-details[open] .item-advanced-summary::before {
    transform: rotate(90deg);
}
```

- [ ] **Step 3: Verify in browser**

Open calculator, add an item (blank mold type). Expanded card should show "Дополнительно ▸" collapsed at the bottom of the form. Click it — checkboxes appear. For custom mold type, "Дополнительно" opens automatically since `showCustomOnly` is true.

- [ ] **Step 4: Commit**

```bash
git add js/app.js css/style.css
git commit -m "feat: collapse advanced options in item card under details toggle"
```

---

## Final Verification

- [ ] Open the calculator page on the deployed site
- [ ] Create a new order: fill order info, add 2 items, add hardware from warehouse
- [ ] Collapse one item, verify summary row shows name/qty/color
- [ ] Save the order, reload, verify items are still there and collapsible
- [ ] Open existing order with items — verify no regressions
- [ ] Verify the warehouse (Склад) page still works independently

---

## Rollback

All changes are in `css/style.css`, `index.html`, and `js/app.js`. Each task has its own commit. To rollback, use `git revert <commit-hash>` for any specific task's commit.
