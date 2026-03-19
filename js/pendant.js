// =============================================
// Recycle Object — Pendant Configurator
// Letter pendant wizard + card rendering
// =============================================

const Pendant = {
    _wizardOpen: false,
    _editingIndex: null,  // null = new, number = editing existing

    // ==========================================
    // EMPTY PENDANT
    // ==========================================

    getEmpty() {
        return {
            item_type: 'pendant',
            pendant_id: 'pnd_' + Date.now(),
            name: '',
            quantity: 0,
            elements: [],
            cord: { source: 'warehouse', warehouse_item_id: null, warehouse_sku: '', photo_thumbnail: '', name: '', price_per_unit: 0, delivery_price: 0 },
            cord_length_cm: 0,
            carabiner: { source: 'warehouse', warehouse_item_id: null, warehouse_sku: '', photo_thumbnail: '', name: '', price_per_unit: 0, delivery_price: 0 },
            packaging: null,
            element_price_per_unit: null,
            sell_price_override: null,
            result: null,
        };
    },

    // ==========================================
    // CARD RENDERING (in calculator)
    // ==========================================

    renderCard(idx) {
        const pnd = Calculator.pendants[idx];
        if (!pnd) return;
        const container = document.getElementById('calc-pendants-container');
        if (!container) return;

        let card = document.getElementById('pendant-card-' + idx);
        if (!card) {
            card = document.createElement('div');
            card.id = 'pendant-card-' + idx;
            card.className = 'card pendant-card';
            container.appendChild(card);
        }

        const elements = this._countableElements(pnd.elements);
        const elemCount = elements.length;
        const printCount = elements.filter(e => e.has_print).length;
        const r = pnd.result || {};
        const costStr = r.costPerUnit ? formatRub(r.costPerUnit) : '—';
        const totalStr = r.totalRevenue ? formatRub(r.totalRevenue) : '—';
        const sellStr = r.sellPerUnit ? formatRub(r.sellPerUnit) : '—';
        const marginStr = r.margin && r.margin.percent !== null ? formatPercent(r.margin.percent) : '—';

        card.innerHTML = `
            <div class="card-header" style="align-items:flex-start;">
                <div style="flex:1;min-width:0;">
                    <h3 style="margin:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:16px;">🔤</span>
                        Подвес "${App.escHtml(pnd.name || '...')}"
                        <span class="text-muted" style="font-size:13px;font-weight:400;">× ${pnd.quantity || 0} шт</span>
                    </h3>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                        ${App.escHtml(pnd.cord?.name || 'Шнур не выбран')} + ${App.escHtml(pnd.carabiner?.name || 'Карабин не выбран')}
                        · ${elemCount} элем.${printCount > 0 ? ', ' + printCount + ' с печатью' : ''}
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button class="btn btn-sm btn-outline" onclick="Pendant.openWizard(${idx})" title="Редактировать">✏️</button>
                    <button class="btn btn-sm btn-outline" onclick="Pendant.remove(${idx})" title="Удалить" style="color:var(--red);">🗑️</button>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 16px 12px;font-size:12px;">
                <div><span class="text-muted">Себест.</span><br><b>${costStr}</b></div>
                <div><span class="text-muted">Цена</span><br><b>${sellStr}</b></div>
                <div><span class="text-muted">Маржа</span><br><b>${marginStr}</b></div>
                <div><span class="text-muted">Итого</span><br><b>${totalStr}</b></div>
            </div>
        `;
    },

    renderAllCards() {
        const container = document.getElementById('calc-pendants-container');
        if (container) container.innerHTML = '';
        Calculator.pendants.forEach((_, i) => this.renderCard(i));
    },

    remove(idx) {
        if (!confirm('Удалить подвес "' + (Calculator.pendants[idx]?.name || '') + '"?')) return;
        Calculator.pendants.splice(idx, 1);
        this.renderAllCards();
        Calculator.recalculate();
        Calculator.scheduleAutosave();
    },

    // ==========================================
    // WIZARD MODAL
    // ==========================================

    openWizard(editIdx) {
        this._editingIndex = editIdx !== undefined ? editIdx : null;
        const pnd = this._editingIndex !== null
            ? JSON.parse(JSON.stringify(Calculator.pendants[this._editingIndex]))
            : this.getEmpty();
        this._wizardData = pnd;
        this._wizardData.name = this._normalizeName(this._wizardData.name);
        this._syncElements(this._nameChars(this._wizardData.name));
        this._wizardStep = 1;
        this._selectedBeads = new Set();
        this._showWizardModal();
    },

    _showWizardModal() {
        // Remove existing modal if any
        let modal = document.getElementById('pendant-wizard-modal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'pendant-wizard-modal';
        modal.className = 'modal-overlay pendant-wizard-overlay';
        modal.innerHTML = `
            <div class="${this._wizardClassName()}" onclick="event.stopPropagation()">
                <div class="pendant-wizard-header">
                    <h2>${this._editingIndex !== null ? 'Редактировать подвес' : 'Новый подвес из букв'}</h2>
                    <button class="btn btn-sm" onclick="Pendant._closeWizard()" style="font-size:18px;line-height:1;">&times;</button>
                </div>
                <div class="pendant-wizard-steps">
                    ${[1,2,3,4,5].map(n => `<button class="pendant-step-btn ${n === this._wizardStep ? 'active' : ''} ${n < this._wizardStep ? 'done' : ''}" onclick="Pendant._goToStep(${n})" ${n === 1 || this._wizardData.name ? '' : 'disabled'}>${this._stepLabel(n)}</button>`).join('')}
                </div>
                <div class="pendant-wizard-body" id="pendant-wizard-body"></div>
                <div class="pendant-wizard-footer">
                    ${this._wizardStep > 1 ? '<button class="btn btn-outline" onclick="Pendant._prevStep()">← Назад</button>' : '<span></span>'}
                    ${this._wizardStep < 5
                        ? '<button class="btn btn-primary" onclick="Pendant._nextStep()">Далее →</button>'
                        : '<button class="btn btn-primary" onclick="Pendant._savePendant()">✓ ' + (this._editingIndex !== null ? 'Сохранить' : 'Добавить в заказ') + '</button>'}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) Pendant._closeWizard(); });
        this._renderStep();
    },

    _wizardClassName() {
        return `pendant-wizard pendant-wizard-step-${this._wizardStep}`;
    },

    _stepLabel(n) {
        return ['', '1. Надпись', '2. Цвета', '3. Печать', '4. Шнур', '5. Итого'][n];
    },

    _closeWizard() {
        const modal = document.getElementById('pendant-wizard-modal');
        if (modal) modal.remove();
        this._wizardOpen = false;
    },

    _goToStep(n) {
        if (n === 1 || this._wizardData.name) {
            this._wizardStep = n;
            this._showWizardModal();
        }
    },

    _prevStep() {
        if (this._wizardStep > 1) {
            this._wizardStep--;
            this._showWizardModal();
        }
    },

    _nextStep() {
        this._readCurrentStep();
        if (this._wizardStep === 1 && !this._wizardData.name) {
            App.toast('Введите надпись');
            return;
        }
        if (this._wizardStep < 5) {
            this._wizardStep++;
            this._showWizardModal();
        }
    },

    // ==========================================
    // STEP RENDERERS
    // ==========================================

    async _renderStep() {
        const body = document.getElementById('pendant-wizard-body');
        if (!body) return;
        // Ensure warehouse data is loaded for step 4
        if (this._wizardStep === 4) {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Загрузка склада...</div>';
            await Calculator._ensureWhPickerData();
        }
        switch (this._wizardStep) {
            case 1: body.innerHTML = this._renderStep1(); this._bindStep1(); break;
            case 2: body.innerHTML = this._renderStep2(); this._bindStep2(); break;
            case 3: body.innerHTML = this._renderStep3(); this._bindStep3(); break;
            case 4: body.innerHTML = this._renderStep4(); this._bindStep4(); break;
            case 5: body.innerHTML = this._renderStep5(); break;
        }
    },

    // --- STEP 1: Inscription + quantity ---

    _renderStep1() {
        const pnd = this._wizardData;
        const normalizedName = this._normalizeName(pnd.name);
        const elementCount = this._nameChars(normalizedName).length;
        return `
            <div class="pendant-field-group">
                <label>Количество подвесов</label>
                <input type="number" id="pw-qty" value="${pnd.quantity || ''}" min="1" placeholder="500" class="input" style="max-width:200px;">
            </div>
            <div class="pendant-field-group">
                <label>Надпись</label>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="text" id="pw-name" value="${App.escHtml(normalizedName)}" placeholder="КЭШШШ" class="input" style="flex:1;font-size:18px;letter-spacing:2px;text-transform:uppercase;">
                    <button class="btn btn-sm btn-outline" onclick="Pendant._insertSpecial('❤️')" title="Сердечко">❤️</button>
                    <button class="btn btn-sm btn-outline" onclick="Pendant._insertSpecial('😊')" title="Смайлик">😊</button>
                </div>
                ${elementCount > 20 ? '<div style="color:var(--orange);font-size:12px;margin-top:4px;">⚠️ Больше 20 элементов — проверьте, поместятся ли на шнур</div>' : ''}
            </div>
            <div style="margin-top:16px;">
                <label class="text-muted" style="font-size:12px;">Превью</label>
                <div id="pw-beads-preview" class="pendant-beads-row">
                    ${this._renderBeads(normalizedName, pnd.elements)}
                </div>
            </div>
        `;
    },

    _bindStep1() {
        const nameInput = document.getElementById('pw-name');
        if (nameInput) {
            nameInput.addEventListener('input', () => {
                const normalized = this._normalizeName(nameInput.value);
                if (nameInput.value !== normalized) {
                    const caretPos = nameInput.selectionStart || normalized.length;
                    nameInput.value = normalized;
                    nameInput.setSelectionRange(caretPos, caretPos);
                }
                const preview = document.getElementById('pw-beads-preview');
                if (preview) preview.innerHTML = this._renderBeads(normalized, []);
            });
        }
    },

    _insertSpecial(char) {
        const input = document.getElementById('pw-name');
        if (!input) return;
        const pos = input.selectionStart || input.value.length;
        input.value = input.value.slice(0, pos) + char + input.value.slice(pos);
        input.focus();
        input.dispatchEvent(new Event('input'));
    },

    _renderBeads(text, elements) {
        const chars = this._nameChars(text);
        if (chars.length === 0) return '<span class="text-muted" style="font-size:13px;">Введите надпись выше</span>';
        return chars.map((ch, i) => {
            const el = elements && elements[i];
            const color = el ? el.color : null;
            const bgStyle = color ? `background:var(--accent-light);border-color:var(--accent);` : '';
            return `<div class="pendant-bead" style="${bgStyle}" data-idx="${i}">
                <span class="pendant-bead-char">${App.escHtml(ch)}</span>
                ${color ? `<span class="pendant-bead-color">${App.escHtml(color)}</span>` : ''}
            </div>`;
        }).join('');
    },

    _normalizeName(name) {
        return String(name || '')
            .toUpperCase()
            .replace(/\s+/gu, '');
    },

    _stripTechnicalCharParts(char) {
        return String(char || '').replace(/[\u200D\uFE00-\uFE0F\u{E0100}-\u{E01EF}\p{Mark}\u{1F3FB}-\u{1F3FF}]/gu, '');
    },

    _isGraphemeExtender(char) {
        return /[\u200D\uFE00-\uFE0F\u{E0100}-\u{E01EF}\p{Mark}\u{1F3FB}-\u{1F3FF}]/u.test(String(char || ''));
    },

    _isCountableChar(char) {
        const raw = String(char || '');
        if (!raw || !/\S/u.test(raw)) return false;
        return this._stripTechnicalCharParts(raw).length > 0;
    },

    _charsEquivalent(a, b) {
        const left = String(a || '');
        const right = String(b || '');
        return left === right || this._stripTechnicalCharParts(left) === this._stripTechnicalCharParts(right);
    },

    _splitGraphemes(name) {
        const parts = Array.from(String(name || ''));
        if (parts.length === 0) return [];
        const graphemes = [];
        parts.forEach(ch => {
            if (graphemes.length === 0) {
                graphemes.push(ch);
                return;
            }
            const prev = graphemes[graphemes.length - 1];
            if (ch === '\u200D' || this._isGraphemeExtender(ch) || prev.endsWith('\u200D')) {
                graphemes[graphemes.length - 1] += ch;
                return;
            }
            graphemes.push(ch);
        });
        return graphemes.filter(ch => this._isCountableChar(ch));
    },

    _nameChars(name) {
        const normalized = this._normalizeName(name);
        if (!normalized) return [];
        if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
            return Array.from(
                new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(normalized),
                part => part.segment
            ).filter(ch => this._isCountableChar(ch));
        }
        return this._splitGraphemes(normalized);
    },

    _countableElements(elements) {
        return (elements || []).filter(el => this._isCountableChar(el?.char));
    },

    // --- STEP 2: Colors ---

    _renderStep2() {
        const pnd = this._wizardData;
        const chars = this._nameChars(pnd.name);
        // Ensure elements array matches chars
        this._syncElements(chars);
        const elements = pnd.elements;

        return `
            <p class="text-muted" style="font-size:13px;margin-bottom:12px;">Выделите буквы (клик/shift+клик) и введите цвет. Нажмите «Назначить» чтобы применить.</p>
            <div class="pendant-beads-row pendant-beads-selectable" id="pw-color-beads">
                ${elements.map((el, i) => `<div class="pendant-bead ${this._selectedBeads.has(i) ? 'selected' : ''}" data-idx="${i}" onclick="Pendant._toggleBead(${i}, event)">
                    <span class="pendant-bead-char">${App.escHtml(el.char)}</span>
                    ${el.color ? `<span class="pendant-bead-color">${App.escHtml(el.color)}</span>` : ''}
                </div>`).join('')}
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:12px;">
                <select id="pw-color-input" class="input" style="flex:1;">
                    <option value="">— Выберите цвет —</option>
                    ${(Colors.data || []).map(c => `<option value="${App.escHtml(c.name)}">${App.escHtml(c.number ? c.number + ' ' + c.name : c.name)}</option>`).join('')}
                    <option value="__custom__">✏️ Ввести вручную...</option>
                </select>
                <button class="btn btn-primary btn-sm" onclick="Pendant._assignColor()">Назначить</button>
                <button class="btn btn-outline btn-sm" onclick="Pendant._selectAll()">Выделить все</button>
            </div>
        `;
    },

    _bindStep2() {},

    _syncElements(chars) {
        const pnd = this._wizardData;
        const old = (pnd.elements || []).filter(el => this._isCountableChar(el?.char));
        pnd.elements = chars.map((ch, i) => {
            const oldEl = old[i];
            if (oldEl && this._charsEquivalent(oldEl.char, ch)) {
                return { ...oldEl, char: ch };
            }
            return {
                char: ch,
                color: oldEl?.color || '',
                has_print: oldEl?.has_print || false,
                print_price: oldEl?.print_price || 0,
                sell_price: oldEl?.sell_price || 0,
                sell_print: oldEl?.sell_print || 0,
            };
        });
    },

    _toggleBead(idx, event) {
        if (event && event.shiftKey && this._lastClickedBead !== undefined) {
            const from = Math.min(this._lastClickedBead, idx);
            const to = Math.max(this._lastClickedBead, idx);
            for (let i = from; i <= to; i++) this._selectedBeads.add(i);
        } else {
            if (this._selectedBeads.has(idx)) this._selectedBeads.delete(idx);
            else this._selectedBeads.add(idx);
        }
        this._lastClickedBead = idx;
        // Re-render beads only
        const container = document.getElementById('pw-color-beads');
        if (container) {
            container.querySelectorAll('.pendant-bead').forEach((el, i) => {
                el.classList.toggle('selected', this._selectedBeads.has(i));
            });
        }
    },

    _selectAll() {
        const count = this._wizardData.elements.length;
        if (this._selectedBeads.size === count) {
            this._selectedBeads.clear();
        } else {
            for (let i = 0; i < count; i++) this._selectedBeads.add(i);
        }
        const container = document.getElementById('pw-color-beads');
        if (container) {
            container.querySelectorAll('.pendant-bead').forEach((el, i) => {
                el.classList.toggle('selected', this._selectedBeads.has(i));
            });
        }
    },

    _assignColor() {
        const input = document.getElementById('pw-color-input');
        let color = (input?.value || '').trim();
        if (color === '__custom__') {
            color = prompt('Введите название цвета:');
            if (!color) return;
            color = color.trim();
        }
        if (!color) { App.toast('Выберите цвет'); return; }
        if (this._selectedBeads.size === 0) { App.toast('Выделите буквы'); return; }

        this._selectedBeads.forEach(i => {
            if (this._wizardData.elements[i]) this._wizardData.elements[i].color = color;
        });
        this._selectedBeads.clear();
        if (input) input.value = '';
        this._renderStep();
    },

    // --- STEP 3: Print ---

    _renderStep3() {
        const elements = this._wizardData.elements || [];
        return `
            <p class="text-muted" style="font-size:13px;margin-bottom:12px;">Отметьте элементы с печатью и укажите стоимость печати за штуку.</p>
            <div class="pendant-beads-row">
                ${elements.map((el, i) => `<div class="pendant-bead" style="${el.color ? 'background:var(--accent-light);' : ''}">
                    <span class="pendant-bead-char">${App.escHtml(el.char)}</span>
                    ${el.color ? `<span class="pendant-bead-color">${App.escHtml(el.color)}</span>` : ''}
                    <label style="display:flex;align-items:center;gap:3px;margin-top:4px;font-size:11px;cursor:pointer;">
                        <input type="checkbox" ${el.has_print ? 'checked' : ''} onchange="Pendant._togglePrint(${i}, this.checked)">
                        Печать
                    </label>
                    ${el.has_print ? `<input type="number" class="input" style="width:70px;font-size:11px;margin-top:2px;" placeholder="₽/шт" value="${el.print_price || ''}" onchange="Pendant._setPrintPrice(${i}, this.value)">` : ''}
                </div>`).join('')}
            </div>
        `;
    },

    _bindStep3() {},

    _togglePrint(idx, checked) {
        if (this._wizardData.elements[idx]) {
            this._wizardData.elements[idx].has_print = checked;
            if (!checked) this._wizardData.elements[idx].print_price = 0;
            this._renderStep();
        }
    },

    _setPrintPrice(idx, val) {
        if (this._wizardData.elements[idx]) {
            this._wizardData.elements[idx].print_price = parseFloat(val) || 0;
        }
    },

    // --- STEP 4: Cord + Carabiner ---

    _renderStep4() {
        const pnd = this._wizardData;
        const whData = Calculator._whPickerData || {};
        // Build warehouse pickers for cords and carabiners using existing Warehouse component
        const cordPickerHtml = this._renderWhDropdown('cord', pnd.cord, whData);
        const carabinerPickerHtml = this._renderWhDropdown('carabiner', pnd.carabiner, whData);
        const qty = pnd.quantity || 0;
        const cordUnit = pnd.cord?.unit || 'шт';
        const cordIsMetric = (cordUnit === 'м' || cordUnit === 'см');
        const cordLenCm = pnd.cord_length_cm || 0;

        // Cord stock check depends on unit type
        const cordStock = this._getSelectedStock('cord', pnd.cord, whData);
        let cordNeedDisplay = '';
        let cordWarn = false;
        let cordCostPerPendant = 0;

        if (cordIsMetric) {
            // Metric: need length per pendant, stock in м or см
            const cordNeedMeters = round2(cordLenCm * qty / 100);
            const stockInMeters = cordUnit === 'см' && cordStock !== null ? round2(cordStock / 100) : cordStock;
            cordCostPerPendant = pnd.cord?.price_per_unit ? round2(pnd.cord.price_per_unit * cordLenCm / 100) : 0;
            if (cordLenCm > 0 && qty > 0) {
                cordNeedDisplay = `Нужно: <b>${cordNeedMeters} м</b> · Цена за подвес: <b>${formatRub(cordCostPerPendant)}</b>`;
            }
            cordWarn = stockInMeters !== null && cordNeedMeters > stockInMeters;
        } else {
            // Pieces: 1 cord = 1 pendant, no length input needed
            cordCostPerPendant = pnd.cord?.price_per_unit || 0;
            cordWarn = cordStock !== null && qty > cordStock;
        }

        // Carabiner: always pieces
        const carabinerStock = this._getSelectedStock('carabiner', pnd.carabiner, whData);
        const carabinerWarn = carabinerStock !== null && qty > carabinerStock;

        const cordUnitLabel = cordIsMetric ? '/' + cordUnit : '/шт';

        return `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div>
                    <h4 style="margin:0 0 8px;">🧵 Шнур</h4>
                    ${cordPickerHtml}
                    ${pnd.cord?.name ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">
                        ${App.escHtml(pnd.cord.name)} · ${formatRub(pnd.cord.price_per_unit || 0)}${cordUnitLabel}
                    </div>` : ''}
                    ${cordIsMetric ? `<div class="pendant-field-group" style="margin-top:8px;">
                        <label>Длина шнура на 1 подвес (см)</label>
                        <input type="number" class="input" value="${cordLenCm || ''}" placeholder="50" style="max-width:150px;" onchange="Pendant._wizardData.cord_length_cm = parseFloat(this.value)||0; Pendant._renderStep();">
                    </div>` : ''}
                    ${cordNeedDisplay ? `<div style="font-size:12px;color:var(--text-muted);">${cordNeedDisplay}</div>` : ''}
                    ${cordWarn ? `<div style="margin-top:4px;font-size:12px;color:var(--red);font-weight:600;">⚠️ Нужно ${cordIsMetric ? round2(cordLenCm * qty / 100) + ' м' : qty + ' шт'}, на складе ${cordStock} ${cordUnit}!</div>` : ''}
                </div>
                <div>
                    <h4 style="margin:0 0 8px;">🔗 Карабин</h4>
                    ${carabinerPickerHtml}
                    ${pnd.carabiner?.name ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">
                        ${App.escHtml(pnd.carabiner.name)} · ${formatRub(pnd.carabiner.price_per_unit || 0)}/шт
                    </div>` : ''}
                    ${carabinerWarn ? `<div style="margin-top:4px;font-size:12px;color:var(--red);font-weight:600;">⚠️ Нужно ${qty} шт, на складе ${carabinerStock} шт!</div>` : ''}
                </div>
            </div>
        `;
    },

    _renderWhDropdown(type, data, whData) {
        const catKey = type === 'cord' ? 'cords' : 'carabiners';
        const catItems = whData[catKey]?.items || [];
        if (catItems.length === 0) {
            // Fallback to manual input if no warehouse data
            return this._renderManualPicker(type, data);
        }
        const selectedId = data?.warehouse_item_id || null;
        const selectedItem = selectedId
            ? catItems.find(item => String(item.id) === String(selectedId)) || null
            : null;
        const selectedPreview = selectedItem || (data?.warehouse_item_id ? {
            id: data.warehouse_item_id,
            name: data.name || '',
            sku: data.warehouse_sku || '',
            photo_thumbnail: data.photo_thumbnail || '',
            available_qty: this._getSelectedStock(type, data, whData) || 0,
            unit: data.unit || 'шт',
            price_per_unit: data.price_per_unit || 0,
            size: '',
            color: '',
        } : null);
        const ui = type === 'cord'
            ? { icon: '🧵', color: '#fce7f3', textColor: '#9d174d', label: 'шнур' }
            : { icon: '🔗', color: '#dbeafe', textColor: '#1d4ed8', label: 'карабин' };
        const selectedHtml = selectedPreview
            ? (() => {
                const parts = [selectedPreview.name];
                if (selectedPreview.size) parts.push(selectedPreview.size);
                if (selectedPreview.color) parts.push(selectedPreview.color);
                const title = parts.filter(Boolean).join(' · ') || 'Позиция со склада';
                const priceStr = selectedPreview.price_per_unit > 0 ? (' · ' + formatRub(selectedPreview.price_per_unit)) : '';
                const photoHtml = selectedPreview.photo_thumbnail
                    ? `<img src="${selectedPreview.photo_thumbnail}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                    : `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:${ui.color};border-radius:6px;font-size:18px;flex-shrink:0;">${ui.icon}</span>`;
                return `${photoHtml}<span style="flex:1;min-width:0;"><b style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${App.escHtml(title)}</b><span style="font-size:11px;color:var(--text-muted);">${App.escHtml(selectedPreview.sku || '')}${selectedPreview.sku ? ' · ' : ''}${selectedPreview.available_qty} ${App.escHtml(selectedPreview.unit || 'шт')}${priceStr}</span></span>`;
            })()
            : `<span style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:13px;"><span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:${ui.color};border-radius:6px;">${ui.icon}</span><span>— Выберите ${ui.label} —</span></span>`;

        return `
            <div class="pendant-field-group">
                <div id="pw-wh-${type}" class="wh-img-picker pendant-wh-picker">
                    <div class="wh-picker-selected" onclick="Warehouse.togglePicker('pw-wh-${type}')">
                        ${selectedHtml}
                        <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;">&#9662;</span>
                    </div>
                    <div class="wh-picker-dropdown" style="display:none;">
                        <div style="padding:6px 8px;border-bottom:1px solid var(--border);">
                            <input
                                type="text"
                                class="wh-picker-search"
                                placeholder="Поиск по названию или артикулу..."
                                oninput="Warehouse.filterPicker('pw-wh-${type}', this.value)"
                                style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;"
                            >
                        </div>
                        <div class="wh-picker-list">
                            ${catItems.map(item => {
                                const parts = [item.name];
                                if (item.size) parts.push(item.size);
                                if (item.color) parts.push(item.color);
                                const label = parts.join(' · ');
                                const stock = item.available_qty > 0 ? `${item.available_qty} ${item.unit}` : '<span style="color:var(--red);">нет</span>';
                                const priceStr = item.price_per_unit > 0 ? (' · ' + formatRub(item.price_per_unit)) : '';
                                const photoHtml = item.photo_thumbnail
                                    ? `<img src="${item.photo_thumbnail}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                                    : `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:${ui.color};border-radius:6px;font-size:20px;flex-shrink:0;">${ui.icon}</span>`;
                                const isSelected = Number(item.id) === Number(selectedId) ? 'background:rgba(59,130,246,0.1);' : '';
                                return `<div class="wh-picker-item" data-id="${item.id}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);${isSelected}" onclick="Pendant._onWhSelect('${type}', '${item.id}')">
                                    ${photoHtml}
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${App.escHtml(label)}</div>
                                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${App.escHtml(item.sku || '')}${item.sku ? ' · ' : ''}${stock}${priceStr}</div>
                                    </div>
                                </div>`;
                            }).join('')}
                            <div class="wh-picker-item" style="display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;" onclick="Pendant._onWhSelect('${type}', '__custom__')">
                                <span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:#fff7ed;border-radius:6px;font-size:20px;flex-shrink:0;border:1px solid var(--border);">✏️</span>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:13px;font-weight:600;">Ввести вручную</div>
                                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Если нужной позиции нет в списке</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    _renderManualPicker(type, data) {
        return `
            <div class="pendant-field-group">
                <label>Название</label>
                <input type="text" class="input" id="pw-${type}-name" value="${App.escHtml(data?.name || '')}" placeholder="${type === 'cord' ? 'Шнур с силик. наконечником' : 'Круглый карабин 2.3 см'}" onchange="Pendant._updateField('${type}', 'name', this.value)">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div class="pendant-field-group">
                    <label>Цена ₽/шт</label>
                    <input type="number" class="input" value="${data?.price_per_unit || ''}" placeholder="0" onchange="Pendant._updateField('${type}', 'price_per_unit', parseFloat(this.value)||0)">
                </div>
                <div class="pendant-field-group">
                    <label>Доставка ₽/шт</label>
                    <input type="number" class="input" value="${data?.delivery_price || ''}" placeholder="0" onchange="Pendant._updateField('${type}', 'delivery_price', parseFloat(this.value)||0)">
                </div>
            </div>
        `;
    },

    _onWhSelect(type, value) {
        if (value === '__custom__') {
            // Switch to custom mode
            this._wizardData[type] = {
                source: 'custom',
                warehouse_item_id: null,
                warehouse_sku: '',
                photo_thumbnail: '',
                name: '',
                price_per_unit: 0,
                delivery_price: 0,
                assembly_speed: type === 'cord' ? 20 : 0,
            };
            this._renderStep();
            return;
        }
        if (!value) return;
        const whData = Calculator._whPickerData || {};
        const catKey = type === 'cord' ? 'cords' : 'carabiners';
        const item = (whData[catKey]?.items || []).find(i => String(i.id) === String(value));
        if (!item) return;
        const data = this._wizardData[type];
        data.source = 'warehouse';
        data.warehouse_item_id = item.id;
        data.warehouse_sku = item.sku || '';
        data.photo_thumbnail = item.photo_thumbnail || '';
        data.name = [item.name, item.color, item.size].filter(Boolean).join(' ');
        data.price_per_unit = item.price_per_unit || 0;
        data.delivery_price = 0;
        data.unit = item.unit || 'шт'; // 'шт', 'м', 'см'

        // Look up approved sell price from hw blanks catalog
        data.sell_price = 0;
        const linkedBlank = Calculator._findHwBlankByWarehouseItemId?.(item.id);
        if (linkedBlank) {
            const fixedSellPrice = parseFloat(linkedBlank.sell_price) || 0;
            if (fixedSellPrice > 0) data.sell_price = fixedSellPrice;
        }
        // Fallback: 40% net margin
        if (!data.sell_price && data.price_per_unit > 0 && typeof calcSellByNetMargin40 === 'function') {
            data.sell_price = calcSellByNetMargin40(data.price_per_unit, App.params);
        }

        this._renderStep();
    },

    _getSelectedStock(type, data, whData) {
        if (!data?.warehouse_item_id) return null;
        const catKey = type === 'cord' ? 'cords' : 'carabiners';
        const item = (whData[catKey]?.items || []).find(i => String(i.id) === String(data.warehouse_item_id));
        return item ? (item.available_qty || 0) : null;
    },

    _renderSourcePicker(type, data) {
        // Used only for packaging in step 5
        return this._renderManualPicker(type, data);
    },

    _bindStep4() {},

    _setSource(type, source) {
        // Initialize packaging object if null
        if (type === 'packaging' && !this._wizardData.packaging) {
            this._wizardData.packaging = { source: 'warehouse', name: '', price_per_unit: 0, delivery_price: 0, assembly_speed: 0, warehouse_item_id: null };
        }
        this._wizardData[type].source = source;
        this._renderStep();
    },

    _updateField(type, field, value) {
        // Initialize packaging object if null
        if (type === 'packaging' && !this._wizardData.packaging) {
            this._wizardData.packaging = { source: 'warehouse', name: '', price_per_unit: 0, delivery_price: 0, assembly_speed: 0, warehouse_item_id: null };
        }
        this._wizardData[type][field] = value;
    },


    // --- STEP 5: Summary ---

    // Find letter blank pricing from enriched Molds or App.templates
    _getLetterBlankTier(totalElements) {
        if (!totalElements || totalElements <= 0) return null;
        const LETTER_BLANK_IDS = [30, 31];
        const TIERS = [50, 100, 300, 500, 1000, 3000];

        // Find closest tier (round up to next tier)
        let tierQty = TIERS[TIERS.length - 1];
        for (const t of TIERS) {
            if (totalElements <= t) { tierQty = t; break; }
        }

        // Try enriched Molds first (has full cost calculation)
        if (typeof Molds !== 'undefined' && Molds.allMolds?.length) {
            const mold = Molds.allMolds.find(m => LETTER_BLANK_IDS.includes(Number(m.id)));
            if (mold?.tiers?.[tierQty]) {
                const tier = mold.tiers[tierQty];
                return { cost: tier.cost || 0, sellPrice: tier.sellPrice || 0, margin: tier.margin || 0, tierQty };
            }
        }

        // Fallback: use App.templates (always available after login)
        const tpl = (App.templates || []).find(t => LETTER_BLANK_IDS.includes(Number(t.id)));
        if (!tpl) return null;

        // Sell price from custom_prices (user-defined per tier)
        const sellPrice = tpl.custom_prices?.[tierQty] || 0;

        // Compute cost like enrichMolds: calculateItemCost + mold amortization + hw
        const params = App.params;
        if (!params) return sellPrice > 0 ? { cost: 0, sellPrice, margin: 0, tierQty } : null;

        const pph = tpl.pieces_per_hour_avg || tpl.pieces_per_hour_min || 100;
        const weight = tpl.weight_grams || 5;
        const moldCount = tpl.mold_count || 1;
        const singleMoldCost = (tpl.cost_cny || 800) * (tpl.cny_rate || 12.5) + (tpl.delivery_cost || 8000);
        const moldTotalCost = singleMoldCost * moldCount;
        const MOLD_MAX_LIFETIME = 4500;
        const moldAmortPerUnit = moldTotalCost / MOLD_MAX_LIFETIME;

        // Simplified item cost calc (plastic + labor + indirect + mold amort)
        const item = {
            quantity: tierQty,
            pieces_per_hour: pph,
            weight_grams: weight,
            extra_molds: 0,
            complex_design: false,
            is_nfc: false,
            nfc_programming: false,
            hardware_qty: 0,
            packaging_qty: 0,
            printing_qty: 0,
            delivery_included: false,
        };
        let cost = 0;
        if (typeof calculateItemCost === 'function') {
            const result = calculateItemCost(item, params);
            cost = result.costTotal - result.costMoldAmortization + moldAmortPerUnit;
        }

        // Add built-in hw cost (assembly)
        if (tpl.hw_name && (tpl.hw_price_per_unit > 0 || tpl.hw_speed > 0)) {
            let hwCost = tpl.hw_price_per_unit + (tpl.hw_delivery_total ? tpl.hw_delivery_total / tierQty : 0);
            if (tpl.hw_speed > 0) {
                const hwHours = tierQty / tpl.hw_speed * (params.wasteFactor || 1.1);
                hwCost += hwHours * params.fotPerHour / tierQty;
                if (params.indirectCostMode === 'all') {
                    hwCost += params.indirectPerHour * hwHours / tierQty;
                }
            }
            cost += hwCost;
        }
        cost = round2(cost);

        const keepNetRate = 1 - (params.taxRate || 0.06) - 0.065;
        const margin = sellPrice > 0 ? round2(((sellPrice * keepNetRate) - cost) / sellPrice) : 0;

        return { cost, sellPrice, margin, tierQty };
    },

    _calcElementCost(pnd) {
        const totalElements = this._countableElements(pnd.elements).length * (pnd.quantity || 0);
        const tier = this._getLetterBlankTier(totalElements);
        return tier ? tier.cost : 3; // fallback ~3₽
    },

    _calcAutoElementPrice(pnd) {
        const totalElements = this._countableElements(pnd.elements).length * (pnd.quantity || 0);
        const tier = this._getLetterBlankTier(totalElements);
        return tier ? tier.sellPrice : null;
    },

    _renderStep5() {
        const pnd = this._wizardData;
        this._readCurrentStep();

        const elements = this._countableElements(pnd.elements);
        const elemCount = elements.length;
        const qty = pnd.quantity || 0;
        const totalElements = elemCount * qty;

        // Auto-calculate element prices from blanks catalog
        const tier = this._getLetterBlankTier(totalElements);
        const elemCostPerUnit = tier ? tier.cost : 3;
        const autoElemSell = tier ? tier.sellPrice : null;

        // Initialize per-element sell_price if not set
        elements.forEach(el => {
            if (el.sell_price === undefined || el.sell_price === null) {
                el.sell_price = autoElemSell || 0;
            }
        });

        // Group elements by color
        const groups = {};
        elements.forEach((el, i) => {
            const key = el.color || 'без цвета';
            if (!groups[key]) groups[key] = { chars: [], indices: [], sell: el.sell_price || 0 };
            groups[key].chars.push(el.char);
            groups[key].indices.push(i);
            groups[key].sell = el.sell_price || 0;
        });

        // Cord calculations — depends on unit
        const cordUnit = pnd.cord?.unit || 'шт';
        const cordIsMetric = (cordUnit === 'м' || cordUnit === 'см');
        const cordLenCm = pnd.cord_length_cm || 0;
        let cordCostPer, cordSellPer;
        if (cordIsMetric) {
            cordCostPer = pnd.cord?.price_per_unit ? round2(pnd.cord.price_per_unit * cordLenCm / 100) : 0;
            cordSellPer = pnd.cord?.sell_price ? round2(pnd.cord.sell_price * cordLenCm / 100) : 0;
        } else {
            cordCostPer = pnd.cord?.price_per_unit || 0;
            cordSellPer = pnd.cord?.sell_price || 0;
        }
        // Auto-fill cord sell if missing (round to whole rubles)
        if (!cordSellPer && cordCostPer > 0 && typeof calcSellByNetMargin40 === 'function') {
            cordSellPer = Math.round(calcSellByNetMargin40(cordCostPer, App.params));
        }

        // Carabiner
        const carabCostPer = pnd.carabiner?.price_per_unit || 0;
        let carabSellPer = pnd.carabiner?.sell_price || 0;
        if (!carabSellPer && carabCostPer > 0 && typeof calcSellByNetMargin40 === 'function') {
            carabSellPer = Math.round(calcSellByNetMargin40(carabCostPer, App.params));
        }

        // Print — sell price via 40% net margin, editable per-element
        let printCostPerUnit = 0;
        let printSellPerUnit = 0;
        elements.forEach(el => {
            if (el.has_print && el.print_price) {
                printCostPerUnit += el.print_price;
                // Use stored sell_print if set, otherwise auto-calculate rounded
                if (!el.sell_print && typeof calcSellByNetMargin40 === 'function') {
                    el.sell_print = Math.round(calcSellByNetMargin40(el.print_price, App.params));
                }
                printSellPerUnit += (el.sell_print || el.print_price);
            }
        });

        // Totals
        let totalElemSell = 0;
        elements.forEach(el => { totalElemSell += (el.sell_price || 0); });
        const totalCostPerUnit = round2(elemCount * elemCostPerUnit + cordCostPer + carabCostPer + printCostPerUnit);
        const totalSellPerUnit = round2(totalElemSell + cordSellPer + carabSellPer + printSellPerUnit);
        const totalCostAll = round2(totalCostPerUnit * qty);
        const totalSellAll = round2(totalSellPerUnit * qty);
        const vatRate = Number.isFinite(App?.params?.vatRate) ? App.params.vatRate : 0.05;
        const vatAmount = round2(totalSellAll * vatRate);
        const totalSellWithVat = round2(totalSellAll + vatAmount);
        const _taxRate = App.params?.taxRate || 0.06;
        const _keepNetRate = 1 - _taxRate - 0.065;
        const finalMargin = typeof calculateActualMargin === 'function'
            ? calculateActualMargin(totalSellAll, totalCostAll)
            : {
                percent: totalSellAll > 0 ? round2(((totalSellAll * _keepNetRate) - totalCostAll) / totalSellAll * 100) : 0,
            };
        const finalMarginPercent = finalMargin.percent ?? 0;
        const vatLabel = `+${formatPercent(vatRate * 100)} НДС`;

        // Update pnd for calculator engine
        pnd.element_price_per_unit = elemCostPerUnit;
        pnd._elemSellTotal = totalElemSell;
        pnd._totalSellPerUnit = totalSellPerUnit;
        pnd.sell_price_override = null;
        pnd.packaging = null;

        // Helper: margin % between cost and sell
        const marginPct = (cost, sell) => {
            if (!sell || sell <= 0) return '';
            const m = round2(((sell * _keepNetRate) - cost) / sell * 100);
            return `<div style="font-size:10px;color:${m >= 30 ? 'var(--green)' : m >= 0 ? 'var(--orange)' : 'var(--red)'};margin-top:1px;">маржа ${m}%</div>`;
        };

        const groupEntries = Object.entries(groups);
        const inputStyle = 'width:75px;font-size:12px;padding:3px 6px;';

        return `
            <div class="pendant-summary">
                <h4 style="margin:0 0 12px;">Подвес "${App.escHtml(pnd.name)}" × ${qty} шт</h4>
                <table class="pendant-summary-table">
                    <tr class="pendant-summary-header"><td>Позиция</td><td>Кол-во</td><td>Себест.</td><td>Продажа</td><td>Итого</td></tr>
                    ${groupEntries.map(([color, g], gi) => {
                        const gQty = g.chars.length * qty;
                        const gSellTotal = round2(g.chars.length * qty * g.sell);
                        return `
                        <tr>
                            <td>🔤 ${App.escHtml(g.chars.join(', '))} (${App.escHtml(color)})</td>
                            <td>${gQty}</td>
                            <td>${formatRub(elemCostPerUnit)}${marginPct(elemCostPerUnit, g.sell)}</td>
                            <td><input type="number" class="input" style="${inputStyle}" value="${g.sell || ''}" placeholder="0" onchange="Pendant._setGroupSellPrice(${gi}, parseFloat(this.value)||0)"></td>
                            <td>${formatRub(gSellTotal)}</td>
                        </tr>`;
                    }).join('')}
                    <tr>
                        <td>🧵 ${App.escHtml(pnd.cord?.name || 'Шнур')}${cordLenCm > 0 ? ' (' + cordLenCm + ' см)' : ''}</td>
                        <td>${qty}</td>
                        <td>${formatRub(cordCostPer)}${marginPct(cordCostPer, cordSellPer)}</td>
                        <td><input type="number" class="input" style="${inputStyle}" value="${cordSellPer || ''}" placeholder="0" onchange="Pendant._wizardData.cord.sell_price = round2(parseFloat(this.value)||0); Pendant._renderStep();"></td>
                        <td>${formatRub(qty * cordSellPer)}</td>
                    </tr>
                    <tr>
                        <td>🔗 ${App.escHtml(pnd.carabiner?.name || 'Карабин')}</td>
                        <td>${qty}</td>
                        <td>${formatRub(carabCostPer)}${marginPct(carabCostPer, carabSellPer)}</td>
                        <td><input type="number" class="input" style="${inputStyle}" value="${carabSellPer || ''}" placeholder="0" onchange="Pendant._wizardData.carabiner.sell_price = round2(parseFloat(this.value)||0); Pendant._renderStep();"></td>
                        <td>${formatRub(qty * carabSellPer)}</td>
                    </tr>
                    ${printCostPerUnit > 0 ? `<tr>
                        <td>🖨 Печать (${elements.filter(e => e.has_print).map(e => e.char).join(', ')})</td>
                        <td>${qty}</td>
                        <td>${formatRub(printCostPerUnit)}${marginPct(printCostPerUnit, printSellPerUnit)}</td>
                        <td><input type="number" class="input" style="${inputStyle}" value="${printSellPerUnit || ''}" placeholder="0" onchange="Pendant._setPrintSellPrice(parseFloat(this.value)||0)"></td>
                        <td>${formatRub(qty * printSellPerUnit)}</td>
                    </tr>` : ''}
                    <tr class="pendant-summary-total">
                        <td><b>Итого за подвес</b></td>
                        <td></td>
                        <td><b>${formatRub(totalCostPerUnit)}</b></td>
                        <td><b>${formatRub(totalSellPerUnit)}</b></td>
                        <td><b>${formatRub(totalSellAll)}</b></td>
                    </tr>
                    <tr style="font-size:12px;color:var(--text-muted);">
                        <td colspan="4" style="text-align:right;">${vatLabel}</td>
                        <td>${formatRub(vatAmount)}</td>
                    </tr>
                    <tr class="pendant-summary-total" style="font-size:14px;">
                        <td><b>Итого с НДС</b></td>
                        <td></td>
                        <td><b>${formatRub(totalCostAll)}</b></td>
                        <td></td>
                        <td><b>${formatRub(totalSellWithVat)}</b></td>
                    </tr>
                    <tr style="font-size:12px;">
                        <td colspan="4" style="text-align:right;"><b>Маржа без НДС</b></td>
                        <td style="color:${finalMarginPercent >= 30 ? 'var(--green)' : finalMarginPercent >= 0 ? 'var(--orange)' : 'var(--red)'};font-weight:600;">${finalMarginPercent}%</td>
                    </tr>
                </table>
            </div>
        `;
    },

    _setGroupSellPrice(groupIndex, price) {
        const pnd = this._wizardData;
        const groups = {};
        const groupOrder = [];
        (pnd.elements || []).forEach((el, i) => {
            const key = el.color || 'без цвета';
            if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
            groups[key].push(i);
        });
        const key = groupOrder[groupIndex];
        if (key && groups[key]) {
            groups[key].forEach(i => {
                pnd.elements[i].sell_price = price;
            });
        }
        this._renderStep();
    },

    _setPrintSellPrice(totalSellPrice) {
        const pnd = this._wizardData;
        const printElems = (pnd.elements || []).filter(el => el.has_print);
        if (printElems.length === 0) return;
        // Distribute evenly across print elements
        const perElem = Math.round(totalSellPrice / printElems.length);
        printElems.forEach(el => { el.sell_print = perElem; });
        this._renderStep();
    },

    // ==========================================
    // READ + SAVE
    // ==========================================

    _readCurrentStep() {
        const pnd = this._wizardData;
        if (this._wizardStep === 1) {
            pnd.quantity = parseInt(document.getElementById('pw-qty')?.value) || 0;
            const rawName = document.getElementById('pw-name')?.value || '';
            const newName = this._normalizeName(rawName);
            if (newName !== pnd.name) {
                pnd.name = newName;
                this._syncElements(this._nameChars(newName));
            }
        }
    },

    _savePendant() {
        this._readCurrentStep();
        const pnd = this._wizardData;

        if (!pnd.name) { App.toast('Введите надпись'); return; }
        if (!pnd.quantity || pnd.quantity <= 0) { App.toast('Введите количество'); return; }

        // sell_price_override and packaging are no longer used
        pnd.sell_price_override = null;
        pnd.packaging = null;

        if (this._editingIndex !== null) {
            Calculator.pendants[this._editingIndex] = pnd;
        } else {
            Calculator.pendants.push(pnd);
        }

        this._closeWizard();
        this.renderAllCards();
        Calculator.recalculate();
        Calculator.scheduleAutosave();
    },
};
