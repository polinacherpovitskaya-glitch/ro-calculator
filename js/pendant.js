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
        const cords = [this._createEmptyAttachment('cord')];
        const carabiners = [this._createEmptyAttachment('carabiner')];
        return {
            item_type: 'pendant',
            pendant_id: 'pnd_' + Date.now(),
            name: '',
            quantity: 0,
            elements: [],
            cords,
            carabiners,
            cord: { ...cords[0] },
            cord_length_cm: 0,
            carabiner: { ...carabiners[0] },
            packaging: null,
            element_price_per_unit: null,
            sell_price_override: null,
            result: null,
        };
    },

    _getAttachmentCollectionKey(type) {
        return type === 'cord' ? 'cords' : 'carabiners';
    },

    _getAttachmentLegacyKey(type) {
        return type === 'cord' ? 'cord' : 'carabiner';
    },

    _createEmptyAttachment(type) {
        return {
            source: 'warehouse',
            warehouse_item_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            name: '',
            price_per_unit: 0,
            delivery_price: 0,
            sell_price: 0,
            assembly_speed: type === 'cord' ? 20 : 0,
            unit: 'шт',
            allocated_qty: 0,
            qty_per_pendant: 1,
            length_cm: 0,
        };
    },

    _normalizeAttachment(type, data, fallbackLengthCm = 0, totalQty = 0) {
        const sourceData = data || {};
        const normalized = {
            ...this._createEmptyAttachment(type),
            ...sourceData,
        };
        const qtyPerPendant = parseFloat(normalized.qty_per_pendant);
        const hasExplicitAllocatedQty = sourceData.allocated_qty !== undefined && sourceData.allocated_qty !== null && sourceData.allocated_qty !== '';
        const allocatedQty = hasExplicitAllocatedQty ? parseFloat(sourceData.allocated_qty) : NaN;
        normalized.qty_per_pendant = qtyPerPendant > 0 ? qtyPerPendant : 1;
        normalized.allocated_qty = Number.isFinite(allocatedQty)
            ? Math.max(0, Math.round(allocatedQty))
            : (this._hasAttachmentData(sourceData) && !hasExplicitAllocatedQty && totalQty > 0 ? totalQty : 0);
        const lengthCm = parseFloat(normalized.length_cm);
        normalized.length_cm = Number.isFinite(lengthCm) ? lengthCm : (type === 'cord' ? (parseFloat(fallbackLengthCm) || 0) : 0);
        normalized.unit = normalized.unit || 'шт';
        return normalized;
    },

    _hasAttachmentData(entry) {
        return !!(entry && (
            entry.name
            || entry.warehouse_item_id
            || entry.warehouse_sku
            || (parseFloat(entry.price_per_unit) || 0) > 0
            || (parseFloat(entry.delivery_price) || 0) > 0
            || (parseFloat(entry.sell_price) || 0) > 0
            || entry.source === 'custom'
        ));
    },

    _ensureAttachmentCollections(pnd = this._wizardData, options = {}) {
        if (!pnd) return pnd;
        const preserveEmpty = !!options.preserveEmpty;

        ['cord', 'carabiner'].forEach(type => {
            const collectionKey = this._getAttachmentCollectionKey(type);
            const legacyKey = this._getAttachmentLegacyKey(type);
            const fallbackLengthCm = type === 'cord' ? (parseFloat(pnd.cord_length_cm) || 0) : 0;
            const totalQty = parseInt(pnd.quantity, 10) || 0;

            let entries = Array.isArray(pnd[collectionKey]) ? pnd[collectionKey].filter(Boolean) : [];
            if (!entries.length && this._hasAttachmentData(pnd[legacyKey])) {
                entries = [pnd[legacyKey]];
            }

            const normalized = entries
                .map((entry, index) => this._normalizeAttachment(type, entry, index === 0 ? fallbackLengthCm : 0, totalQty));

            const prepared = preserveEmpty
                ? normalized
                : normalized.filter(entry => this._hasAttachmentData(entry));

            pnd[collectionKey] = prepared.length > 0
                ? prepared
                : [this._normalizeAttachment(type, null, fallbackLengthCm)];
        });

        this._syncLegacyAttachments(pnd);
        return pnd;
    },

    _syncLegacyAttachments(pnd = this._wizardData) {
        if (!pnd) return;
        const cords = Array.isArray(pnd.cords) && pnd.cords.length ? pnd.cords : [this._createEmptyAttachment('cord')];
        const carabiners = Array.isArray(pnd.carabiners) && pnd.carabiners.length ? pnd.carabiners : [this._createEmptyAttachment('carabiner')];
        pnd.cord = { ...cords[0] };
        pnd.cord_length_cm = parseFloat(cords[0]?.length_cm) || 0;
        pnd.carabiner = { ...carabiners[0] };
    },

    _getAttachments(pnd, type, options = {}) {
        this._ensureAttachmentCollections(pnd, { preserveEmpty: !!options.includeEmpty });
        const collectionKey = this._getAttachmentCollectionKey(type);
        const entries = Array.isArray(pnd?.[collectionKey]) ? pnd[collectionKey] : [];
        if (options.includeEmpty) return entries;
        return entries.filter(entry => this._hasAttachmentData(entry));
    },

    _getAttachmentAllocatedQty(entry, pnd = this._wizardData) {
        if (typeof getPendantAttachmentAllocatedQty === 'function') {
            return getPendantAttachmentAllocatedQty(pnd, entry);
        }
        const totalQty = parseFloat(pnd?.quantity) || 0;
        if (!entry) return 0;
        const allocatedQty = parseFloat(entry.allocated_qty);
        if (Number.isFinite(allocatedQty) && allocatedQty >= 0) return allocatedQty;
        return this._hasAttachmentData(entry) && totalQty > 0 ? totalQty : 0;
    },

    _getAttachmentAllocatedTotal(type, pnd = this._wizardData, options = {}) {
        const entries = Array.isArray(options.entries)
            ? options.entries
            : this._getAttachments(pnd, type, { includeEmpty: !!options.includeEmpty });
        return round2(entries.reduce((sum, entry, index) => {
            if (index === options.excludeIndex) return sum;
            return sum + this._getAttachmentAllocatedQty(entry, pnd);
        }, 0));
    },

    _getAttachmentRemainingQty(type, pnd = this._wizardData, options = {}) {
        const totalQty = parseFloat(pnd?.quantity) || 0;
        return Math.max(0, round2(totalQty - this._getAttachmentAllocatedTotal(type, pnd, options)));
    },

    _describeAttachmentList(entries, emptyLabel) {
        const names = (entries || []).map(entry => entry?.name).filter(Boolean);
        if (names.length === 0) return emptyLabel;
        if (names.length === 1) return names[0];
        if (names.length === 2) return names.join(', ');
        return `${names[0]}, ${names[1]} и ещё ${names.length - 2}`;
    },

    // ==========================================
    // CARD RENDERING (in calculator)
    // ==========================================

    renderCard(idx) {
        const pnd = Calculator.pendants[idx];
        if (!pnd) return;
        this._ensureAttachmentCollections(pnd);
        const container = document.getElementById('calc-pendants-container');
        if (!container) return;
        const displayName = this._normalizeName(pnd.name || '') || '...';
        const cords = this._getAttachments(pnd, 'cord');
        const carabiners = this._getAttachments(pnd, 'carabiner');

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
                        Подвес "${App.escHtml(displayName)}"
                        <span class="text-muted" style="font-size:13px;font-weight:400;">× ${pnd.quantity || 0} шт</span>
                    </h3>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                        ${App.escHtml(this._describeAttachmentList(cords, 'Шнур не выбран'))} + ${App.escHtml(this._describeAttachmentList(carabiners, 'Карабин не выбран'))}
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
        this._ensureAttachmentCollections(pnd);
        this._wizardData = pnd;
        this._commitName(this._wizardData.name);
        this._wizardStep = 1;
        this._selectedBeads = new Set();
        this._showWizardModal();
    },

    _showWizardModal() {
        if (!(this._selectedBeads instanceof Set)) this._selectedBeads = new Set();
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
        this._readCurrentStep();
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
        if (this._wizardStep === 4 && !this._validateAttachmentDistributions()) {
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
                const rawValue = nameInput.value;
                const caretPos = nameInput.selectionStart ?? rawValue.length;
                const normalized = this._commitName(rawValue);
                if (rawValue !== normalized) {
                    const normalizedCaret = this._normalizeName(rawValue.slice(0, caretPos)).length;
                    nameInput.value = normalized;
                    if (typeof nameInput.setSelectionRange === 'function') {
                        nameInput.setSelectionRange(normalizedCaret, normalizedCaret);
                    }
                }
                const preview = document.getElementById('pw-beads-preview');
                if (preview) preview.innerHTML = this._renderBeads(normalized, this._wizardData.elements);
                this._updateStepAvailability();
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

    _commitName(name) {
        const normalized = this._normalizeName(name);
        this._wizardData.name = normalized;
        this._syncElements(this._nameChars(normalized));
        return normalized;
    },

    _updateStepAvailability() {
        const buttons = document.querySelectorAll('.pendant-step-btn');
        if (!buttons || !buttons.length) return;
        buttons.forEach((btn, idx) => {
            if (idx > 0) btn.disabled = !this._wizardData.name;
        });
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
        this._commitName(pnd.name);
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
            const hasLegacySellPrice = oldEl && Object.prototype.hasOwnProperty.call(oldEl, 'sell_price');
            return {
                char: ch,
                color: oldEl?.color || '',
                has_print: oldEl?.has_print || false,
                print_price: oldEl?.print_price || 0,
                sell_price: hasLegacySellPrice ? oldEl.sell_price : null,
                sell_price_auto: oldEl?.sell_price_auto ?? (!(parseFloat(oldEl?.sell_price) > 0)),
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
        this._ensureAttachmentCollections(pnd, { preserveEmpty: true });
        const whData = Calculator._whPickerData || {};
        const qty = pnd.quantity || 0;

        return `
            <div class="pendant-step4-layout">
                ${this._renderAttachmentSection('cord', this._getAttachments(pnd, 'cord', { includeEmpty: true }), whData, qty)}
                ${this._renderAttachmentSection('carabiner', this._getAttachments(pnd, 'carabiner', { includeEmpty: true }), whData, qty)}
            </div>
        `;
    },

    _renderAttachmentSection(type, entries, whData, qty) {
        const isCord = type === 'cord';
        const title = isCord ? '🧵 Шнур' : '🔗 Фурнитура';
        const addLabel = isCord ? '+ Добавить шнур' : '+ Добавить фурнитуру';
        const allocatedQty = this._getAttachmentAllocatedTotal(type, this._wizardData, { entries, includeEmpty: true });
        const remainingQty = Math.max(0, round2((qty || 0) - allocatedQty));
        const overflowQty = Math.max(0, round2(allocatedQty - (qty || 0)));
        const allocationColor = overflowQty > 0
            ? 'var(--red)'
            : remainingQty > 0
                ? 'var(--orange)'
                : 'var(--green)';
        const allocationText = qty > 0
            ? `Распределено <b>${allocatedQty}</b> из <b>${qty}</b> шт`
                + (overflowQty > 0
                    ? ` · лишних <b>${overflowQty}</b> шт`
                    : ` · осталось <b>${remainingQty}</b> шт`)
            : 'Сначала укажите количество подвесов';

        return `
            <section class="pendant-attachment-section">
                <div class="pendant-attachment-section-header">
                    <h4>${title}</h4>
                    <button class="btn btn-sm btn-outline" onclick="Pendant._addAttachment('${type}')">${addLabel}</button>
                </div>
                <div class="pendant-allocation-summary" style="color:${allocationColor};">${allocationText}</div>
                <div class="pendant-attachment-rows">
                    ${entries.map((entry, index) => this._renderAttachmentRow(type, entry, whData, qty, index, entries.length)).join('')}
                </div>
            </section>
        `;
    },

    _renderAttachmentRow(type, data, whData, qty, index, totalEntries) {
        const isCord = type === 'cord';
        const isMetric = isCord && (data?.unit === 'м' || data?.unit === 'см');
        const selectedStock = this._getSelectedStock(type, data, whData, index);
        const allocatedQty = this._getAttachmentAllocatedQty(data, this._wizardData);
        const qtyPerPendant = parseFloat(data?.qty_per_pendant) || 1;
        const lengthCm = parseFloat(data?.length_cm) || 0;
        const unitLabel = isMetric ? '/' + (data?.unit || 'м') : '/шт';

        let helperText = '';
        let warnText = '';
        let costPerPendant = 0;

        if (isMetric) {
            const needMeters = round2(lengthCm * allocatedQty / 100);
            const stockMeters = data?.unit === 'см' && selectedStock !== null ? round2(selectedStock / 100) : selectedStock;
            costPerPendant = data?.price_per_unit ? round2((data.price_per_unit * this._getMetricAttachmentRateFactor(data)) + (data.delivery_price || 0)) : 0;
            if (lengthCm > 0 && allocatedQty > 0) {
                helperText = `Нужно: <b>${needMeters} м</b> · Подвесов: <b>${allocatedQty} шт</b>${costPerPendant > 0 ? ` · Цена за подвес: <b>${formatRub(costPerPendant)}</b>` : ''}`;
            }
            if (stockMeters !== null && needMeters > stockMeters) {
                warnText = `⚠️ Нужно ${needMeters} м, на складе ${stockMeters} м!`;
            }
        } else {
            const totalNeed = allocatedQty * qtyPerPendant;
            costPerPendant = round2(((data?.price_per_unit || 0) + (data?.delivery_price || 0)) * qtyPerPendant);
            if ((data?.price_per_unit || 0) > 0 || allocatedQty > 0) {
                helperText = `Нужно: <b>${totalNeed} шт</b>${allocatedQty > 0 ? ` · Подвесов: <b>${allocatedQty} шт</b>` : ''}${qtyPerPendant > 1 ? ` · На подвес: <b>${qtyPerPendant} шт</b>` : ''}${costPerPendant > 0 ? ` · Цена за подвес: <b>${formatRub(costPerPendant)}</b>` : ''}`;
            }
            if (selectedStock !== null && totalNeed > selectedStock) {
                warnText = `⚠️ Нужно ${totalNeed} шт, на складе ${selectedStock} шт!`;
            }
        }

        const summaryText = this._hasAttachmentData(data)
            ? `${App.escHtml(data.name || (isCord ? 'Шнур' : 'Фурнитура'))} · ${formatRub(data.price_per_unit || 0)}${unitLabel}${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}${!isMetric && qtyPerPendant > 1 ? ` · ${qtyPerPendant} шт/подвес` : ''}`
            : '';

        return `
            <div class="pendant-attachment-row">
                <div class="pendant-attachment-row-header">
                    <div class="pendant-attachment-row-title">${isCord ? 'Шнур' : 'Фурнитура'} ${index + 1}</div>
                    ${totalEntries > 1 ? `<button class="btn btn-sm btn-outline" onclick="Pendant._removeAttachment('${type}', ${index})" style="color:var(--red);">Удалить</button>` : ''}
                </div>
                ${this._renderWhDropdown(type, data, whData, index)}
                ${summaryText ? `<div class="pendant-attachment-row-summary">${summaryText}</div>` : ''}
                <div class="pendant-field-group pendant-attachment-field">
                    <label>Сколько подвесов с этой позицией</label>
                    <input type="number" class="input" value="${allocatedQty || ''}" min="0" placeholder="${qty || 0}" onchange="Pendant._updateAttachmentField('${type}', ${index}, 'allocated_qty', Math.max(0, Math.round(parseFloat(this.value)||0)))">
                </div>
                ${isMetric ? `<div class="pendant-field-group pendant-attachment-field">
                    <label>Длина на 1 подвес (см)</label>
                    <input type="number" class="input" value="${lengthCm || ''}" placeholder="50" onchange="Pendant._updateAttachmentField('${type}', ${index}, 'length_cm', parseFloat(this.value)||0)">
                </div>` : `<div class="pendant-field-group pendant-attachment-field">
                    <label>Кол-во на 1 подвес</label>
                    <input type="number" class="input" value="${qtyPerPendant || 1}" min="1" placeholder="1" onchange="Pendant._updateAttachmentField('${type}', ${index}, 'qty_per_pendant', Math.max(1, parseFloat(this.value)||1))">
                </div>`}
                ${helperText ? `<div class="pendant-attachment-helper">${helperText}</div>` : ''}
                ${warnText ? `<div class="pendant-attachment-warning">${warnText}</div>` : ''}
            </div>
        `;
    },

    _getWarehouseCategoryMeta(catKey) {
        if (typeof WAREHOUSE_CATEGORIES !== 'undefined' && Array.isArray(WAREHOUSE_CATEGORIES)) {
            return WAREHOUSE_CATEGORIES.find(cat => cat.key === catKey) || null;
        }
        return null;
    },

    _getWarehouseAttachmentCategoryKeys(type) {
        return type === 'cord' ? ['cords'] : ['carabiners', 'rings'];
    },

    _getWarehouseAttachmentGroups(type, whData) {
        return this._getWarehouseAttachmentCategoryKeys(type)
            .map(catKey => {
                const group = whData?.[catKey];
                const items = Array.isArray(group?.items) ? group.items : [];
                if (!items.length) return null;
                const meta = this._getWarehouseCategoryMeta(catKey);
                return {
                    key: catKey,
                    label: group?.label || meta?.label || catKey,
                    icon: group?.icon || meta?.icon || '📦',
                    color: meta?.color || 'var(--accent-light)',
                    textColor: meta?.textColor || 'var(--text)',
                    items,
                };
            })
            .filter(Boolean);
    },

    _findWarehouseAttachmentItem(type, whData, value) {
        if (!value) return null;
        const needle = String(value);
        for (const group of this._getWarehouseAttachmentGroups(type, whData)) {
            const item = group.items.find(entry => String(entry.id) === needle);
            if (item) {
                return { ...item, __categoryKey: group.key };
            }
        }
        return null;
    },

    _getCurrentOrderDraftDemand(itemId, exclude = null) {
        const targetId = Number(itemId) || 0;
        if (!targetId) return 0;

        let demand = 0;
        const shouldSkipWizardRow = (row, useWizardState) => {
            if (!useWizardState || !exclude) return false;
            return String(row?.attachment_type || '') === String(exclude.type || '')
                && Number(row?.attachment_index) === Number(exclude.index);
        };
        const addPendantDemand = (pendant, useWizardState = false) => {
            if (!pendant || typeof getPendantWarehouseDemandRows !== 'function') return;
            getPendantWarehouseDemandRows(pendant).forEach(row => {
                if (Number(row?.warehouse_item_id) !== targetId) return;
                if (shouldSkipWizardRow(row, useWizardState)) return;
                demand += parseFloat(row?.qty) || 0;
            });
        };

        (Calculator.hardwareItems || []).forEach(hw => {
            if (hw?.source !== 'warehouse') return;
            if (Number(hw?.warehouse_item_id) !== targetId) return;
            demand += parseFloat(hw?.qty) || 0;
        });

        (Calculator.packagingItems || []).forEach(pkg => {
            if (pkg?.source !== 'warehouse') return;
            if (Number(pkg?.warehouse_item_id) !== targetId) return;
            demand += parseFloat(pkg?.qty) || 0;
        });

        const hasWizardPendant = !!this._wizardData;
        const editingIndex = Number.isInteger(this._editingIndex) ? this._editingIndex : null;
        let wizardMergedIntoOrder = false;
        (Calculator.pendants || []).forEach((pnd, idx) => {
            if (editingIndex !== null && idx === editingIndex && hasWizardPendant) {
                addPendantDemand(this._wizardData, true);
                wizardMergedIntoOrder = true;
                return;
            }
            addPendantDemand(pnd, false);
        });
        if ((editingIndex === null || !wizardMergedIntoOrder) && hasWizardPendant) {
            addPendantDemand(this._wizardData, true);
        }

        return demand;
    },

    _getEffectiveWarehouseAvailableQty(itemId, exclude = null, fallbackAvailable = 0) {
        const targetId = Number(itemId) || 0;
        if (!targetId) return 0;
        const whItem = typeof Calculator._findWhItem === 'function'
            ? Calculator._findWhItem(targetId)
            : null;
        const baseAvailable = parseFloat(whItem?.available_qty);
        const ownReserved = typeof Calculator._getCurrentOrderReservedQty === 'function'
            ? (parseFloat(Calculator._getCurrentOrderReservedQty(targetId)) || 0)
            : 0;
        const otherDraftDemand = this._getCurrentOrderDraftDemand(targetId, exclude);
        const normalizedBase = Number.isFinite(baseAvailable)
            ? baseAvailable
            : (parseFloat(fallbackAvailable) || 0);
        const effective = normalizedBase + ownReserved - otherDraftDemand;
        return typeof round2 === 'function'
            ? Math.max(0, round2(effective))
            : Math.max(0, effective);
    },

    _getEffectiveWarehouseAttachmentItem(type, index, itemId, whData) {
        const item = this._findWarehouseAttachmentItem(type, whData, itemId);
        if (!item) return null;
        return {
            ...item,
            available_qty: this._getEffectiveWarehouseAvailableQty(
                item.id,
                { type, index },
                item.available_qty
            ),
        };
    },

    _renderWhDropdown(type, data, whData, index = 0) {
        const groups = this._getWarehouseAttachmentGroups(type, whData);
        const catItems = groups.flatMap(group => group.items.map(item => ({ ...item, __categoryKey: group.key })));
        if (data?.source === 'custom' || catItems.length === 0) {
            // Fallback to manual input if no warehouse data
            return this._renderManualPicker(type, data, index, catItems.length > 0);
        }
        const selectedId = data?.warehouse_item_id || null;
        const selectedItem = this._getEffectiveWarehouseAttachmentItem(type, index, selectedId, whData);
        const selectedPreview = selectedItem || (data?.warehouse_item_id ? {
            id: data.warehouse_item_id,
            name: data.name || '',
            sku: data.warehouse_sku || '',
            photo_thumbnail: data.photo_thumbnail || '',
            available_qty: this._getSelectedStock(type, data, whData, index) || 0,
            unit: data.unit || 'шт',
            price_per_unit: data.price_per_unit || 0,
            size: '',
            color: '',
            category: type === 'cord' ? 'cords' : 'carabiners',
        } : null);
        const uiDefault = type === 'cord'
            ? { icon: '🧵', color: '#fce7f3', textColor: '#9d174d', label: 'шнур' }
            : { icon: '🔗', color: '#dbeafe', textColor: '#1d4ed8', label: 'фурнитуру' };
        const selectedMeta = selectedPreview
            ? (this._getWarehouseCategoryMeta(selectedPreview.category || selectedPreview.__categoryKey) || uiDefault)
            : uiDefault;
        const selectedHtml = selectedPreview
            ? (() => {
                const parts = [selectedPreview.name];
                if (selectedPreview.size) parts.push(selectedPreview.size);
                if (selectedPreview.color) parts.push(selectedPreview.color);
                const title = parts.filter(Boolean).join(' · ') || 'Позиция со склада';
                const priceStr = selectedPreview.price_per_unit > 0 ? (' · ' + formatRub(selectedPreview.price_per_unit)) : '';
                const photoHtml = selectedPreview.photo_thumbnail
                    ? `<img src="${selectedPreview.photo_thumbnail}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                    : `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:${selectedMeta.color};border-radius:6px;font-size:18px;flex-shrink:0;">${selectedMeta.icon}</span>`;
                return `${photoHtml}<span style="flex:1;min-width:0;"><b style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${App.escHtml(title)}</b><span style="font-size:11px;color:var(--text-muted);">${App.escHtml(selectedPreview.sku || '')}${selectedPreview.sku ? ' · ' : ''}${selectedPreview.available_qty} ${App.escHtml(selectedPreview.unit || 'шт')}${priceStr}</span></span>`;
            })()
            : `<span style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:13px;"><span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:${uiDefault.color};border-radius:6px;">${uiDefault.icon}</span><span>— Выберите ${uiDefault.label} —</span></span>`;

        return `
            <div class="pendant-field-group">
                <div id="pw-wh-${type}-${index}" class="wh-img-picker pendant-wh-picker">
                    <div class="wh-picker-selected" onclick="Warehouse.togglePicker('pw-wh-${type}-${index}')">
                        ${selectedHtml}
                        <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;">&#9662;</span>
                    </div>
                    <div class="wh-picker-dropdown" style="display:none;">
                        <div style="padding:6px 8px;border-bottom:1px solid var(--border);">
                            <input
                                type="text"
                                class="wh-picker-search"
                                placeholder="Поиск по названию или артикулу..."
                                oninput="Warehouse.filterPicker('pw-wh-${type}-${index}', this.value)"
                                style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;"
                            >
                        </div>
                        <div class="wh-picker-list">
                            ${groups.map(group => {
                                return `
                                    <div class="wh-picker-cat-header" data-group-key="${App.escHtml(group.key)}" style="padding:6px 10px;font-size:11px;font-weight:700;color:${group.textColor};background:${group.color};">${group.icon} ${App.escHtml(group.label)}</div>
                                    ${group.items.map(item => {
                                        const effectiveItem = this._getEffectiveWarehouseAttachmentItem(type, index, item.id, whData) || item;
                                        const parts = [effectiveItem.name];
                                        if (effectiveItem.size) parts.push(effectiveItem.size);
                                        if (effectiveItem.color) parts.push(effectiveItem.color);
                                        const label = parts.join(' · ');
                                        const stock = effectiveItem.available_qty > 0 ? `${effectiveItem.available_qty} ${effectiveItem.unit}` : '<span style="color:var(--red);">нет</span>';
                                        const priceStr = effectiveItem.price_per_unit > 0 ? (' · ' + formatRub(effectiveItem.price_per_unit)) : '';
                                        const photoHtml = effectiveItem.photo_thumbnail
                                            ? `<img src="${effectiveItem.photo_thumbnail}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                                            : `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:${group.color};border-radius:6px;font-size:20px;flex-shrink:0;">${group.icon}</span>`;
                                        const isSelected = Number(effectiveItem.id) === Number(selectedId) ? 'background:rgba(59,130,246,0.1);' : '';
                                        return `<div class="wh-picker-item" data-id="${effectiveItem.id}" data-group-key="${App.escHtml(group.key)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);${isSelected}" onclick="Pendant._onWhSelect('${type}', ${index}, '${effectiveItem.id}')">
                                            ${photoHtml}
                                            <div style="flex:1;min-width:0;">
                                                <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${App.escHtml(label)}</div>
                                                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${App.escHtml(effectiveItem.sku || '')}${effectiveItem.sku ? ' · ' : ''}${stock}${priceStr}</div>
                                            </div>
                                        </div>`;
                                    }).join('')}
                                `;
                            }).join('')}
                            <div class="wh-picker-item" style="display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;" onclick="Pendant._onWhSelect('${type}', ${index}, '__custom__')">
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

    _renderManualPicker(type, data, index = 0, canSwitchToWarehouse = false) {
        return `
            ${canSwitchToWarehouse ? `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
                <button class="btn btn-sm btn-outline" onclick="Pendant._setAttachmentSource('${type}', ${index}, 'warehouse')">Выбрать со склада</button>
            </div>` : ''}
            <div class="pendant-field-group">
                <label>Название</label>
                <input type="text" class="input" id="pw-${type}-name-${index}" value="${App.escHtml(data?.name || '')}" placeholder="${type === 'cord' ? 'Шнур с силик. наконечником' : 'Круглый карабин 2.3 см'}" onchange="Pendant._updateAttachmentField('${type}', ${index}, 'name', this.value)">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div class="pendant-field-group">
                    <label>Цена ₽/шт</label>
                    <input type="number" class="input" value="${data?.price_per_unit || ''}" placeholder="0" onchange="Pendant._updateAttachmentField('${type}', ${index}, 'price_per_unit', parseFloat(this.value)||0)">
                </div>
                <div class="pendant-field-group">
                    <label>Доставка ₽/шт</label>
                    <input type="number" class="input" value="${data?.delivery_price || ''}" placeholder="0" onchange="Pendant._updateAttachmentField('${type}', ${index}, 'delivery_price', parseFloat(this.value)||0)">
                </div>
            </div>
        `;
    },

    _addAttachment(type) {
        const items = this._getAttachments(this._wizardData, type, { includeEmpty: true });
        const newItem = this._createEmptyAttachment(type);
        newItem.allocated_qty = this._getAttachmentRemainingQty(type, this._wizardData, { entries: items, includeEmpty: true });
        items.push(newItem);
        this._syncLegacyAttachments(this._wizardData);
        this._renderStep();
    },

    _removeAttachment(type, index) {
        const collectionKey = this._getAttachmentCollectionKey(type);
        const items = this._getAttachments(this._wizardData, type, { includeEmpty: true });
        items.splice(index, 1);
        this._wizardData[collectionKey] = items.length > 0 ? items : [this._createEmptyAttachment(type)];
        this._syncLegacyAttachments(this._wizardData);
        this._renderStep();
    },

    _setAttachmentSource(type, index, source) {
        const items = this._getAttachments(this._wizardData, type, { includeEmpty: true });
        const previous = items[index] || this._createEmptyAttachment(type);
        items[index] = {
            ...this._createEmptyAttachment(type),
            source,
            allocated_qty: this._getAttachmentAllocatedQty(previous, this._wizardData),
            qty_per_pendant: parseFloat(previous.qty_per_pendant) > 0 ? parseFloat(previous.qty_per_pendant) : 1,
            length_cm: parseFloat(previous.length_cm) || 0,
        };
        this._syncLegacyAttachments(this._wizardData);
        this._renderStep();
    },

    _updateAttachmentField(type, index, field, value) {
        const items = this._getAttachments(this._wizardData, type, { includeEmpty: true });
        if (!items[index]) items[index] = this._createEmptyAttachment(type);
        items[index][field] = value;
        if (field === 'qty_per_pendant') {
            const qtyPerPendant = parseFloat(items[index][field]);
            items[index][field] = qtyPerPendant > 0 ? qtyPerPendant : 1;
        }
        if (field === 'allocated_qty') {
            items[index][field] = Math.max(0, Math.round(parseFloat(items[index][field]) || 0));
        }
        if (field === 'length_cm') {
            items[index][field] = parseFloat(items[index][field]) || 0;
        }
        this._syncLegacyAttachments(this._wizardData);
        this._renderStep();
    },

    _onWhSelect(type, index, value) {
        if (value === '__custom__') {
            this._setAttachmentSource(type, index, 'custom');
            return;
        }
        if (!value) return;
        const whData = Calculator._whPickerData || {};
        const item = this._findWarehouseAttachmentItem(type, whData, value);
        if (!item) return;
        const items = this._getAttachments(this._wizardData, type, { includeEmpty: true });
        const data = items[index] || this._createEmptyAttachment(type);
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

        items[index] = data;
        if (!(parseFloat(items[index].allocated_qty) > 0)) {
            items[index].allocated_qty = this._getAttachmentRemainingQty(type, this._wizardData, {
                entries: items,
                includeEmpty: true,
                excludeIndex: index,
            });
        }
        this._syncLegacyAttachments(this._wizardData);
        this._renderStep();
    },

    _getSelectedStock(type, data, whData, index = 0) {
        if (!data?.warehouse_item_id) return null;
        const item = this._getEffectiveWarehouseAttachmentItem(type, index, data.warehouse_item_id, whData);
        return item ? (item.available_qty || 0) : null;
    },

    _isMetricAttachment(type, entry) {
        return type === 'cord' && (entry?.unit === 'м' || entry?.unit === 'см');
    },

    _getMetricAttachmentRateFactor(entry) {
        if (typeof getPendantMetricRateFactor === 'function') {
            return getPendantMetricRateFactor(entry);
        }
        const lengthCm = parseFloat(entry?.length_cm) || 0;
        if (!(lengthCm > 0)) return 0;
        return entry?.unit === 'см' ? lengthCm : (lengthCm / 100);
    },

    _getAttachmentCostPerPendant(type, entry) {
        if (!entry) return 0;
        if (this._isMetricAttachment(type, entry)) {
            return round2(((entry.price_per_unit || 0) * this._getMetricAttachmentRateFactor(entry)) + (entry.delivery_price || 0));
        }
        const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
        return round2(((entry.price_per_unit || 0) + (entry.delivery_price || 0)) * qtyPerPendant);
    },

    _getAttachmentSellPerPendant(type, entry) {
        if (!entry) return 0;
        if (this._isMetricAttachment(type, entry)) {
            return round2((entry.sell_price || 0) * this._getMetricAttachmentRateFactor(entry));
        }
        const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
        return round2((entry.sell_price || 0) * qtyPerPendant);
    },

    _ensureAttachmentSellPrice(type, entry) {
        if (!entry || (parseFloat(entry.sell_price) || 0) > 0 || typeof calcSellByNetMargin40 !== 'function') return;
        const rowCost = this._getAttachmentCostPerPendant(type, entry);
        if (!(rowCost > 0)) return;
        const recommendedRowSell = Math.round(calcSellByNetMargin40(rowCost, App.params));
        if (this._isMetricAttachment(type, entry)) {
            const factor = this._getMetricAttachmentRateFactor(entry);
            entry.sell_price = factor > 0 ? round2(recommendedRowSell / factor) : recommendedRowSell;
        } else {
            const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
            entry.sell_price = qtyPerPendant > 0 ? round2(recommendedRowSell / qtyPerPendant) : recommendedRowSell;
        }
    },

    _setAttachmentSellPrice(type, index, rowSellPrice) {
        const items = this._getAttachments(this._wizardData, type, { includeEmpty: true });
        const entry = items[index];
        if (!entry) return;
        const rowSell = round2(parseFloat(rowSellPrice) || 0);
        if (this._isMetricAttachment(type, entry)) {
            const factor = this._getMetricAttachmentRateFactor(entry);
            entry.sell_price = factor > 0 ? round2(rowSell / factor) : rowSell;
        } else {
            const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
            entry.sell_price = qtyPerPendant > 0 ? round2(rowSell / qtyPerPendant) : rowSell;
        }
        this._syncLegacyAttachments(this._wizardData);
        this._renderStep();
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
        if (typeof getPendantLetterBlankMetrics === 'function') {
            const metrics = getPendantLetterBlankMetrics(totalElements, App.params);
            if (metrics) {
                return {
                    cost: metrics.cost || 0,
                    sellPrice: metrics.sellPrice || 0,
                    margin: metrics.margin || 0,
                    tierQty: metrics.tierQty,
                };
            }
        }
        if (!totalElements || totalElements <= 0) return null;
        const LETTER_BLANK_IDS = [30, 31];
        const TIERS = [10, 50, 100, 300, 500, 1000, 3000];
        const resolveDefaultBlankMargin = (qty) => {
            if (typeof getBlankMargin === 'function') return getBlankMargin(qty);
            if (qty <= 10) return 0.65;
            if (qty <= 50) return 0.60;
            if (qty <= 100) return 0.55;
            if (qty <= 300) return 0.50;
            if (qty <= 500) return 0.45;
            if (qty <= 1000) return 0.40;
            return 0.35;
        };
        const roundPriceTo5 = (value) => {
            if (typeof roundTo5 === 'function') return roundTo5(value);
            return Math.round(value / 5) * 5;
        };

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
        const customPrice = Number(tpl.custom_prices?.[tierQty]);

        // Compute cost like enrichMolds: calculateItemCost + mold amortization + hw
        const params = App.params;
        if (!params) {
            return Number.isFinite(customPrice) && customPrice > 0
                ? { cost: 0, sellPrice: customPrice, margin: 0, tierQty }
                : null;
        }

        const pph = tpl.pieces_per_hour_avg || tpl.pieces_per_hour_min || 100;
        const weight = tpl.weight_grams || 5;
        const moldCount = tpl.mold_count || 1;
        const singleMoldCost = (tpl.cost_cny || 800) * (tpl.cny_rate || 12.5) + (tpl.delivery_cost || 8000);
        const moldTotalCost = singleMoldCost * moldCount;
        const MOLD_MAX_LIFETIME = 4500;
        const moldAmortPerUnit = moldTotalCost / MOLD_MAX_LIFETIME;

        // Simplified item cost calc (plastic + labor + indirect + mold amort)
        const baseQtyForCost = 50;
        const item = {
            quantity: baseQtyForCost,
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
            let hwCost = tpl.hw_price_per_unit + (tpl.hw_delivery_total ? tpl.hw_delivery_total / baseQtyForCost : 0);
            if (tpl.hw_speed > 0) {
                const hwHours = baseQtyForCost / tpl.hw_speed * (params.wasteFactor || 1.1);
                hwCost += hwHours * params.fotPerHour / baseQtyForCost;
                if (params.indirectCostMode === 'all') {
                    hwCost += params.indirectPerHour * hwHours / baseQtyForCost;
                }
            }
            cost += hwCost;
        }
        cost = round2(cost);

        let sellPrice = Number.isFinite(customPrice) && customPrice > 0 ? customPrice : 0;
        let targetMargin = 0;

        if (sellPrice <= 0 && cost > 0) {
            const customMargin = Number(tpl.custom_margins?.[tierQty]);
            targetMargin = Number.isFinite(customMargin) ? customMargin : resolveDefaultBlankMargin(tierQty);
            const keepNetRate = 1
                - (Number.isFinite(params.vatRate) ? params.vatRate : 0.05)
                - (Number.isFinite(params.taxRate) ? params.taxRate : 0.06)
                - (Number.isFinite(params.charityRate) ? params.charityRate : 0.01)
                - 0.065;
            if (keepNetRate > 0 && targetMargin < 1) {
                sellPrice = roundPriceTo5(round2(cost / (1 - targetMargin) / keepNetRate));
            }
        }

        const keepNetRate = 1
            - (Number.isFinite(params.vatRate) ? params.vatRate : 0.05)
            - (Number.isFinite(params.taxRate) ? params.taxRate : 0.06)
            - (Number.isFinite(params.charityRate) ? params.charityRate : 0.01)
            - 0.065;
        const margin = sellPrice > 0
            ? round2(((sellPrice * keepNetRate) - cost) / sellPrice)
            : targetMargin;

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
        this._commitName(pnd.name);

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
            const currentSell = parseFloat(el.sell_price);
            const shouldAutoFill = el.sell_price_auto !== false && (autoElemSell || 0) > 0;
            if (shouldAutoFill) {
                el.sell_price = autoElemSell;
                el.sell_price_auto = true;
            } else if (!Number.isFinite(currentSell)) {
                el.sell_price = 0;
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

        const cords = this._getAttachments(pnd, 'cord');
        const carabiners = this._getAttachments(pnd, 'carabiner');

        cords.forEach(entry => this._ensureAttachmentSellPrice('cord', entry));
        carabiners.forEach(entry => this._ensureAttachmentSellPrice('carabiner', entry));

        const cordRows = cords.map((entry, index) => {
            const isMetric = this._isMetricAttachment('cord', entry);
            const allocatedQty = this._getAttachmentAllocatedQty(entry, pnd);
            const lengthCm = parseFloat(entry.length_cm) || 0;
            const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
            const costPer = this._getAttachmentCostPerPendant('cord', entry);
            const sellPer = this._getAttachmentSellPerPendant('cord', entry);
            const totalQtyLabel = isMetric
                ? `${round2(lengthCm * allocatedQty / 100)} м${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}`
                : `${round2(allocatedQty * qtyPerPendant)} шт${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}`;
            const titleSuffix = isMetric && lengthCm > 0
                ? ` (${lengthCm} см/подвес)`
                : (!isMetric && qtyPerPendant > 1 ? ` × ${qtyPerPendant}` : '');
            return {
                index,
                title: `🧵 ${App.escHtml(entry.name || 'Шнур')}${titleSuffix}`,
                qtyLabel: totalQtyLabel,
                costPer,
                sellPer,
                totalCostValue: round2(allocatedQty * costPer),
                totalSellValue: round2(allocatedQty * sellPer),
                totalSell: formatRub(round2(allocatedQty * sellPer)),
            };
        });

        const carabinerRows = carabiners.map((entry, index) => {
            const allocatedQty = this._getAttachmentAllocatedQty(entry, pnd);
            const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
            const costPer = this._getAttachmentCostPerPendant('carabiner', entry);
            const sellPer = this._getAttachmentSellPerPendant('carabiner', entry);
            const titleSuffix = qtyPerPendant > 1 ? ` × ${qtyPerPendant}` : '';
            return {
                index,
                title: `🔗 ${App.escHtml(entry.name || 'Фурнитура')}${titleSuffix}`,
                qtyLabel: `${round2(allocatedQty * qtyPerPendant)} шт${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}`,
                costPer,
                sellPer,
                totalCostValue: round2(allocatedQty * costPer),
                totalSellValue: round2(allocatedQty * sellPer),
                totalSell: formatRub(round2(allocatedQty * sellPer)),
            };
        });

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
        const totalCordCostAll = round2(cordRows.reduce((sum, row) => sum + row.totalCostValue, 0));
        const totalCordSellAll = round2(cordRows.reduce((sum, row) => sum + row.totalSellValue, 0));
        const totalCarabinerCostAll = round2(carabinerRows.reduce((sum, row) => sum + row.totalCostValue, 0));
        const totalCarabinerSellAll = round2(carabinerRows.reduce((sum, row) => sum + row.totalSellValue, 0));
        const totalCostAll = round2((qty * elemCount * elemCostPerUnit) + totalCordCostAll + totalCarabinerCostAll + (printCostPerUnit * qty));
        const totalSellAll = round2((qty * totalElemSell) + totalCordSellAll + totalCarabinerSellAll + (printSellPerUnit * qty));
        const totalCostPerUnit = qty > 0 ? round2(totalCostAll / qty) : 0;
        const totalSellPerUnit = qty > 0 ? round2(totalSellAll / qty) : 0;
        const vatRate = Number.isFinite(App?.params?.vatRate) ? App.params.vatRate : 0.05;
        const vatAmount = round2(totalSellAll * vatRate);
        const totalSellWithVat = round2(totalSellAll + vatAmount);
        const _taxRate = App.params?.taxRate || 0.06;
        const _charityRate = Number.isFinite(App?.params?.charityRate) ? App.params.charityRate : 0.01;
        const _keepNetRate = 1 - _taxRate - _charityRate - 0.065;
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
        this._syncLegacyAttachments(pnd);

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
                <div class="pendant-summary-table-wrap">
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
                    ${cordRows.map(row => `<tr>
                        <td>${row.title}</td>
                        <td>${row.qtyLabel}</td>
                        <td>${formatRub(row.costPer)}${marginPct(row.costPer, row.sellPer)}</td>
                        <td><input type="number" class="input" style="${inputStyle}" value="${row.sellPer || ''}" placeholder="0" onchange="Pendant._setAttachmentSellPrice('cord', ${row.index}, parseFloat(this.value)||0)"></td>
                        <td>${row.totalSell}</td>
                    </tr>`).join('')}
                    ${carabinerRows.map(row => `<tr>
                        <td>${row.title}</td>
                        <td>${row.qtyLabel}</td>
                        <td>${formatRub(row.costPer)}${marginPct(row.costPer, row.sellPer)}</td>
                        <td><input type="number" class="input" style="${inputStyle}" value="${row.sellPer || ''}" placeholder="0" onchange="Pendant._setAttachmentSellPrice('carabiner', ${row.index}, parseFloat(this.value)||0)"></td>
                        <td>${row.totalSell}</td>
                    </tr>`).join('')}
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
                pnd.elements[i].sell_price_auto = !(price > 0);
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

    _validateAttachmentDistributions() {
        const pnd = this._wizardData;
        const totalQty = parseInt(pnd?.quantity, 10) || 0;
        if (!(totalQty > 0)) return true;

        const checks = [
            { type: 'cord', label: 'Шнур' },
            { type: 'carabiner', label: 'Фурнитура' },
        ];

        for (const check of checks) {
            const entries = this._getAttachments(pnd, check.type);
            if (entries.length === 0) continue;
            const allocatedQty = this._getAttachmentAllocatedTotal(check.type, pnd, { entries });
            if (allocatedQty > totalQty) {
                App.toast(`${check.label}: распределено на ${allocatedQty - totalQty} шт больше тиража`);
                return false;
            }
            if (allocatedQty < totalQty) {
                App.toast(`${check.label}: распределите ещё ${totalQty - allocatedQty} шт`);
                return false;
            }
        }

        return true;
    },

    _readCurrentStep() {
        const pnd = this._wizardData;
        if (this._wizardStep === 1) {
            pnd.quantity = parseInt(document.getElementById('pw-qty')?.value) || 0;
            const rawName = document.getElementById('pw-name')?.value || '';
            this._commitName(rawName);
        }
    },

    _savePendant() {
        this._readCurrentStep();
        const pnd = this._wizardData;
        this._commitName(pnd.name);
        this._ensureAttachmentCollections(pnd);

        if (!pnd.name) { App.toast('Введите надпись'); return; }
        if (!pnd.quantity || pnd.quantity <= 0) { App.toast('Введите количество'); return; }
        if (!this._validateAttachmentDistributions()) return;

        // sell_price_override and packaging are no longer used
        pnd.sell_price_override = null;
        pnd.packaging = null;
        pnd.cords = this._getAttachments(pnd, 'cord');
        pnd.carabiners = this._getAttachments(pnd, 'carabiner');
        this._syncLegacyAttachments(pnd);

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
