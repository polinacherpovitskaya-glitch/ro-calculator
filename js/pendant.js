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
            cord: { source: 'warehouse', warehouse_item_id: null, name: '', price_per_unit: 0, delivery_price: 0, assembly_speed: 20 },
            carabiner: { source: 'warehouse', warehouse_item_id: null, name: '', price_per_unit: 0, delivery_price: 0 },
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

        const elemCount = (pnd.elements || []).length;
        const printCount = (pnd.elements || []).filter(e => e.has_print).length;
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
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="pendant-wizard" onclick="event.stopPropagation()">
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

    _renderStep() {
        const body = document.getElementById('pendant-wizard-body');
        if (!body) return;
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
        return `
            <div class="pendant-field-group">
                <label>Количество подвесов</label>
                <input type="number" id="pw-qty" value="${pnd.quantity || ''}" min="1" placeholder="500" class="input" style="max-width:200px;">
            </div>
            <div class="pendant-field-group">
                <label>Надпись</label>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="text" id="pw-name" value="${App.escHtml(pnd.name || '')}" placeholder="КЭШШШ" class="input" style="flex:1;font-size:18px;letter-spacing:2px;">
                    <button class="btn btn-sm btn-outline" onclick="Pendant._insertSpecial('❤️')" title="Сердечко">❤️</button>
                    <button class="btn btn-sm btn-outline" onclick="Pendant._insertSpecial('😊')" title="Смайлик">😊</button>
                </div>
                ${pnd.name && pnd.name.length > 20 ? '<div style="color:var(--orange);font-size:12px;margin-top:4px;">⚠️ Больше 20 элементов — проверьте, поместятся ли на шнур</div>' : ''}
            </div>
            <div style="margin-top:16px;">
                <label class="text-muted" style="font-size:12px;">Превью</label>
                <div id="pw-beads-preview" class="pendant-beads-row">
                    ${this._renderBeads(pnd.name || '', pnd.elements)}
                </div>
            </div>
        `;
    },

    _bindStep1() {
        const nameInput = document.getElementById('pw-name');
        if (nameInput) {
            nameInput.addEventListener('input', () => {
                const preview = document.getElementById('pw-beads-preview');
                if (preview) preview.innerHTML = this._renderBeads(nameInput.value, []);
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
        if (!text) return '<span class="text-muted" style="font-size:13px;">Введите надпись выше</span>';
        const chars = [...text];  // proper unicode split
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

    // --- STEP 2: Colors ---

    _renderStep2() {
        const pnd = this._wizardData;
        const chars = [...(pnd.name || '')];
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
                <input type="text" id="pw-color-input" placeholder="Цвет (напр. белый, голубой)" class="input" style="flex:1;">
                <button class="btn btn-primary btn-sm" onclick="Pendant._assignColor()">Назначить</button>
                <button class="btn btn-outline btn-sm" onclick="Pendant._selectAll()">Выделить все</button>
            </div>
        `;
    },

    _bindStep2() {},

    _syncElements(chars) {
        const pnd = this._wizardData;
        const old = pnd.elements || [];
        pnd.elements = chars.map((ch, i) => {
            if (old[i] && old[i].char === ch) return old[i];
            return { char: ch, color: old[i]?.color || '', has_print: old[i]?.has_print || false, print_price: old[i]?.print_price || 0 };
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
        const color = (input?.value || '').trim();
        if (!color) { App.toast('Введите цвет'); return; }
        if (this._selectedBeads.size === 0) { App.toast('Выделите буквы'); return; }

        this._selectedBeads.forEach(i => {
            if (this._wizardData.elements[i]) this._wizardData.elements[i].color = color;
        });
        this._selectedBeads.clear();
        input.value = '';
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
        return `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div>
                    <h4 style="margin:0 0 8px;">🧵 Шнур</h4>
                    ${this._renderSourcePicker('cord', pnd.cord)}
                </div>
                <div>
                    <h4 style="margin:0 0 8px;">🔗 Карабин</h4>
                    ${this._renderSourcePicker('carabiner', pnd.carabiner)}
                </div>
            </div>
        `;
    },

    _renderSourcePicker(type, data) {
        const isWarehouse = data.source === 'warehouse';
        return `
            <div class="pendant-field-group">
                <div style="display:flex;gap:4px;margin-bottom:8px;">
                    <button class="btn btn-sm ${isWarehouse ? 'btn-primary' : 'btn-outline'}" onclick="Pendant._setSource('${type}', 'warehouse')">Со склада</button>
                    <button class="btn btn-sm ${!isWarehouse ? 'btn-primary' : 'btn-outline'}" onclick="Pendant._setSource('${type}', 'custom')">Кастом</button>
                </div>
                <div class="pendant-field-group">
                    <label>Название</label>
                    <input type="text" class="input" id="pw-${type}-name" value="${App.escHtml(data.name || '')}" placeholder="${type === 'cord' ? 'Шнур с силик. наконечником' : 'Круглый карабин 2.3 см'}" onchange="Pendant._updateField('${type}', 'name', this.value)">
                </div>
                ${isWarehouse ? `<div class="pendant-field-group"><button class="btn btn-sm btn-outline" onclick="Pendant._pickFromWarehouse('${type}')" style="width:100%;">🔍 Выбрать со склада</button></div>` : ''}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="pendant-field-group">
                        <label>Цена ₽/шт</label>
                        <input type="number" class="input" value="${data.price_per_unit || ''}" placeholder="0" onchange="Pendant._updateField('${type}', 'price_per_unit', parseFloat(this.value)||0)">
                    </div>
                    <div class="pendant-field-group">
                        <label>Доставка ₽/шт</label>
                        <input type="number" class="input" value="${data.delivery_price || ''}" placeholder="0" onchange="Pendant._updateField('${type}', 'delivery_price', parseFloat(this.value)||0)">
                    </div>
                </div>
                ${type === 'cord' ? `<div class="pendant-field-group">
                    <label>Скорость сборки (шт/час)</label>
                    <input type="number" class="input" value="${data.assembly_speed || 20}" placeholder="20" onchange="Pendant._updateField('${type}', 'assembly_speed', parseFloat(this.value)||0)">
                </div>` : ''}
            </div>
        `;
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

    async _pickFromWarehouse(type) {
        const category = type === 'cord' ? 'cords' : 'carabiners';
        // Load warehouse items
        await Calculator._ensureWhPickerData();
        const items = (Calculator._whPickerData || []).filter(w => w.category === category && (w.qty > 0 || !w.qty));

        if (items.length === 0) {
            App.toast('Нет позиций на складе в категории ' + category);
            return;
        }

        // Show simple picker modal
        let picker = document.getElementById('pendant-wh-picker');
        if (picker) picker.remove();

        picker = document.createElement('div');
        picker.id = 'pendant-wh-picker';
        picker.className = 'modal-overlay';
        picker.style.zIndex = '10001';
        picker.innerHTML = `
            <div class="pendant-wizard" style="max-width:500px;max-height:70vh;" onclick="event.stopPropagation()">
                <div class="pendant-wizard-header">
                    <h3>Выбрать ${type === 'cord' ? 'шнур' : 'карабин'} со склада</h3>
                    <button class="btn btn-sm" onclick="document.getElementById('pendant-wh-picker').remove()" style="font-size:18px;">&times;</button>
                </div>
                <div style="padding:12px;overflow-y:auto;max-height:calc(70vh - 60px);">
                    <input type="text" class="input" placeholder="Поиск..." id="pw-wh-search" oninput="Pendant._filterWhPicker()" style="margin-bottom:8px;">
                    <div id="pw-wh-list">
                        ${items.map((w, i) => `<div class="pendant-wh-item" data-idx="${i}" onclick="Pendant._selectWhItem('${type}', ${i})" style="padding:8px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;">
                            <b>${App.escHtml(w.name || '')}</b> ${w.color ? '· ' + App.escHtml(w.color) : ''} ${w.size ? '· ' + App.escHtml(w.size) : ''}
                            <br><span class="text-muted">${App.escHtml(w.sku || '')} · ${w.qty || '?'} шт · ${formatRub(w.price_per_unit || 0)}</span>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(picker);
        picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });
        this._whPickerItems = items;
    },

    _filterWhPicker() {
        const q = (document.getElementById('pw-wh-search')?.value || '').toLowerCase();
        document.querySelectorAll('#pw-wh-list .pendant-wh-item').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    },

    _selectWhItem(type, idx) {
        const w = this._whPickerItems[idx];
        if (!w) return;
        const data = this._wizardData[type];
        data.warehouse_item_id = w.id || w.sku;
        data.name = [w.name, w.color, w.size].filter(Boolean).join(' ');
        data.price_per_unit = w.price_per_unit || 0;
        data.delivery_price = 0;
        document.getElementById('pendant-wh-picker')?.remove();
        this._renderStep();
    },

    // --- STEP 5: Summary ---

    _renderStep5() {
        const pnd = this._wizardData;
        this._readCurrentStep();

        // Auto-calculate element price from blanks
        const elemCount = (pnd.elements || []).length;
        const qty = pnd.quantity || 0;
        const totalElements = elemCount * qty;

        let autoPrice = null;
        if (totalElements > 0 && typeof calcBlankSellPrice === 'function' && App.templates) {
            // Find reference blank for letters from settings
            const refBlankId = App.settings?.pendant_letter_blank_id;
            if (refBlankId) {
                const tpl = App.templates.find(t => t.id == refBlankId);
                if (tpl) {
                    const fakeItem = {
                        quantity: totalElements,
                        pieces_per_hour: tpl.pph_actual || tpl.pph_max || 100,
                        weight_grams: tpl.weight_grams || 5,
                        is_blank_mold: true,
                        extra_molds: 0,
                        complex_design: false,
                        is_nfc: false,
                        nfc_programming: false,
                        delivery_included: false,
                        printings: [],
                        builtin_hw_name: '',
                        builtin_hw_price: 0,
                        builtin_hw_speed: 0,
                    };
                    const result = calculateItemCost(fakeItem, App.params);
                    autoPrice = calcBlankSellPrice(result.costTotal, totalElements, App.params);
                }
            }
        }

        if (pnd.element_price_per_unit === null && autoPrice !== null) {
            pnd.element_price_per_unit = autoPrice;
        }

        const elemPrice = pnd.element_price_per_unit || 0;

        // Calculate inline for preview
        const cordCost = (pnd.cord?.price_per_unit || 0) + (pnd.cord?.delivery_price || 0);
        const carabinerCost = (pnd.carabiner?.price_per_unit || 0) + (pnd.carabiner?.delivery_price || 0);
        let printCostPerUnit = 0;
        (pnd.elements || []).forEach(el => { if (el.has_print) printCostPerUnit += (el.print_price || 0); });
        const pkgCost = pnd.packaging ? (pnd.packaging.price_per_unit || 0) + (pnd.packaging.delivery_price || 0) : 0;
        const totalPerUnit = elemCount * elemPrice + cordCost + carabinerCost + printCostPerUnit + pkgCost;
        const totalAll = totalPerUnit * qty;

        // Group elements by color for preview
        const groups = {};
        (pnd.elements || []).forEach(el => {
            const key = el.color || 'без цвета';
            if (!groups[key]) groups[key] = [];
            groups[key].push(el.char);
        });

        return `
            <div class="pendant-summary">
                <h4 style="margin:0 0 12px;">Подвес "${App.escHtml(pnd.name)}" × ${qty} шт</h4>
                <table class="pendant-summary-table">
                    <tr class="pendant-summary-header"><td>Позиция</td><td>Кол-во</td><td>Цена/шт</td><td>Итого</td></tr>
                    ${Object.entries(groups).map(([color, chars]) => `
                        <tr>
                            <td>Буквы ${App.escHtml(chars.join(', '))} (${App.escHtml(color)})</td>
                            <td>${chars.length * qty}</td>
                            <td>${formatRub(elemPrice)}</td>
                            <td>${formatRub(chars.length * qty * elemPrice)}</td>
                        </tr>
                    `).join('')}
                    <tr>
                        <td>🧵 ${App.escHtml(pnd.cord?.name || 'Шнур')}</td>
                        <td>${qty}</td>
                        <td>${formatRub(pnd.cord?.price_per_unit || 0)}</td>
                        <td>${formatRub(qty * (pnd.cord?.price_per_unit || 0))}</td>
                    </tr>
                    <tr>
                        <td>🔗 ${App.escHtml(pnd.carabiner?.name || 'Карабин')}</td>
                        <td>${qty}</td>
                        <td>${formatRub(pnd.carabiner?.price_per_unit || 0)}</td>
                        <td>${formatRub(qty * (pnd.carabiner?.price_per_unit || 0))}</td>
                    </tr>
                    ${(pnd.elements || []).filter(el => el.has_print).map(el => `
                        <tr>
                            <td>🖨 Печать на ${App.escHtml(el.char)}</td>
                            <td>${qty}</td>
                            <td>${formatRub(el.print_price || 0)}</td>
                            <td>${formatRub(qty * (el.print_price || 0))}</td>
                        </tr>
                    `).join('')}
                    ${pnd.packaging ? `<tr>
                        <td>📦 ${App.escHtml(pnd.packaging.name || 'Упаковка')}</td>
                        <td>${qty}</td>
                        <td>${formatRub(pnd.packaging.price_per_unit || 0)}</td>
                        <td>${formatRub(qty * (pnd.packaging.price_per_unit || 0))}</td>
                    </tr>` : ''}
                    <tr class="pendant-summary-total">
                        <td><b>Итого</b></td>
                        <td></td>
                        <td><b>${formatRub(totalPerUnit)}</b></td>
                        <td><b>${formatRub(totalAll)}</b></td>
                    </tr>
                </table>

                <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="pendant-field-group">
                        <label>Цена элемента ₽/шт ${autoPrice !== null ? '<span class="text-muted">(авто из бланков)</span>' : '<span style="color:var(--orange);">(задайте вручную)</span>'}</label>
                        <input type="number" class="input" id="pw-elem-price" value="${elemPrice || ''}" placeholder="0" onchange="Pendant._wizardData.element_price_per_unit = parseFloat(this.value)||0; Pendant._renderStep();">
                    </div>
                    <div class="pendant-field-group">
                        <label>Цена продажи за подвес (переписать)</label>
                        <input type="number" class="input" id="pw-sell-override" value="${pnd.sell_price_override || ''}" placeholder="Авто" onchange="Pendant._wizardData.sell_price_override = parseFloat(this.value)||null;">
                    </div>
                </div>

                <details style="margin-top:12px;">
                    <summary class="text-muted" style="font-size:12px;cursor:pointer;">📦 Добавить упаковку</summary>
                    <div style="padding:8px 0;">
                        ${this._renderSourcePicker('packaging', pnd.packaging || { source: 'warehouse', name: '', price_per_unit: 0, delivery_price: 0, assembly_speed: 0, warehouse_item_id: null })}
                    </div>
                </details>
            </div>
        `;
    },

    // ==========================================
    // READ + SAVE
    // ==========================================

    _readCurrentStep() {
        const pnd = this._wizardData;
        if (this._wizardStep === 1) {
            pnd.quantity = parseInt(document.getElementById('pw-qty')?.value) || 0;
            const newName = document.getElementById('pw-name')?.value || '';
            if (newName !== pnd.name) {
                pnd.name = newName;
                this._syncElements([...newName]);
            }
        }
    },

    _savePendant() {
        this._readCurrentStep();
        const pnd = this._wizardData;

        if (!pnd.name) { App.toast('Введите надпись'); return; }
        if (!pnd.quantity || pnd.quantity <= 0) { App.toast('Введите количество'); return; }

        // Read element price from step 5
        const epInput = document.getElementById('pw-elem-price');
        if (epInput) pnd.element_price_per_unit = parseFloat(epInput.value) || 0;
        const soInput = document.getElementById('pw-sell-override');
        if (soInput) pnd.sell_price_override = parseFloat(soInput.value) || null;

        // Handle packaging
        if (pnd.packaging && (!pnd.packaging.name || pnd.packaging.price_per_unit <= 0)) {
            pnd.packaging = null;
        }

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
