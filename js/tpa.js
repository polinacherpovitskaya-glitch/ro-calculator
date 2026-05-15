// =============================================
// Recycle Object — TPA XPM-17 live calculator
// =============================================

const TPA = {
    TIER_QTYS: [1000, 3000, 5000, 10000, 30000, 50000, 100000, 200000, 300000],
    MACHINE: Object.freeze({
        model: 'XPM-17',
        clampTons: 17,
        shotWeightGrams: 40,
        moldSize: '200x250x200 мм',
        screw: '22 мм',
        stroke: '125 мм',
    }),
    PRESETS: Object.freeze({
        flat: {
            label: 'Плоский бланк',
            values: {
                geometry: 'flat',
                quantity: 30000,
                weight: 5.9,
                cavities: 4,
                openingsPerHour: 60,
                moldCost: 200000,
                setupCost: 8571,
            },
        },
        jenga: {
            label: 'Дженга',
            values: {
                geometry: 'ribbed',
                quantity: 30000,
                weight: 16,
                cavities: 2,
                openingsPerHour: 60,
                moldCost: 200000,
                setupCost: 8571,
            },
        },
        custom: {
            label: 'Свой сценарий',
            values: {},
        },
    }),

    root: null,
    state: null,
    boundRoots: new WeakSet(),

    async load() {
        const host = document.getElementById('settings-tpa-host');
        if (host) await this.mount(host);
    },

    async mount(container) {
        if (!container) return;
        if (this.root && this.root !== container) {
            this.root.innerHTML = '';
        }
        this.root = container;
        if (!this.state) this.state = this.getDefaultState();
        this.renderShell();
        if (!this.boundRoots.has(container)) {
            this.bindEvents(container);
            this.boundRoots.add(container);
        }
        this.refresh();
    },

    getDefaultState() {
        const params = (typeof App !== 'undefined' && App.params) || (typeof getProductionParams === 'function' ? getProductionParams((typeof App !== 'undefined' && App.settings) || {}) : {});
        return {
            preset: 'flat',
            geometry: 'flat',
            quantity: 30000,
            weight: 5.9,
            cavities: 4,
            openingsPerHour: 60,
            moldCost: 200000,
            setupCost: 8571,
            materialCostPerKg: this.round2(Number(params.plasticCostPerKg || 250) || 250),
            operatorRatePerHour: this.round2(Number(params.fotPerHour || 550) || 550),
            indirectRatePerHour: this.round2(Number(params.indirectPerHour || 0) || 0),
            wasteFactor: this.round2(Number(params.wasteFactor || 1.1) || 1.1),
            targetMarginPct: this.normalizePercent(params.marginTarget, 40),
        };
    },

    normalizePercent(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return numeric <= 1 ? this.round2(numeric * 100) : this.round2(numeric);
    },

    renderShell() {
        this.root.innerHTML = `
            <div class="tpa-page">
                <section class="card">
                    <div class="card-header">
                        <h3>Быстрый расчет ТПА XPM-17</h3>
                        <span class="badge badge-blue">${this.escape(this.MACHINE.clampTons)}T · ${this.escape(this.MACHINE.shotWeightGrams)} г выстрел</span>
                    </div>
                    <div class="tpa-copy">
                        Консервативная модель: оператор занят у станка всю партию, ФОТ и косвенные ложатся на часы партии, стоимость клиентского молда размазывается по тиражу заказа.
                    </div>
                    <div class="tpa-preset-row">
                        <button class="tpa-preset-btn" data-tpa-preset="flat">Плоский бланк</button>
                        <button class="tpa-preset-btn" data-tpa-preset="jenga">Дженга</button>
                        <button class="tpa-preset-btn" data-tpa-preset="custom">Свой сценарий</button>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Тираж, шт</label>
                            <input id="tpa-quantity" type="number" min="1" step="100">
                        </div>
                        <div class="form-group">
                            <label>Геометрия</label>
                            <select id="tpa-geometry">
                                <option value="flat">Плоская / тонкая</option>
                                <option value="small">Мелкая / компактная</option>
                                <option value="ribbed">Объемная, но ребристая</option>
                                <option value="thick">Толстая / монолитная</option>
                                <option value="insert">Со вставкой / ручной операцией</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Вес детали, г</label>
                            <input id="tpa-weight" type="number" min="0" step="0.1">
                        </div>
                        <div class="form-group">
                            <label>Гнезд в форме</label>
                            <input id="tpa-cavities" type="number" min="1" step="1">
                        </div>
                        <div class="form-group">
                            <label>Открытий в час</label>
                            <input id="tpa-openings" type="number" min="1" step="1">
                        </div>
                        <div class="form-group">
                            <label>Стоимость молда, ₽</label>
                            <input id="tpa-mold-cost" type="number" min="0" step="1000">
                        </div>
                        <div class="form-group">
                            <label>Запуск партии, ₽</label>
                            <input id="tpa-setup-cost" type="number" min="0" step="100">
                        </div>
                        <div class="form-group">
                            <label>Пластик, ₽/кг</label>
                            <input id="tpa-material-cost" type="number" min="0" step="1">
                        </div>
                        <div class="form-group">
                            <label>ФОТ оператора, ₽/ч</label>
                            <input id="tpa-operator-rate" type="number" min="0" step="1">
                        </div>
                        <div class="form-group">
                            <label>Косвенные, ₽/ч</label>
                            <input id="tpa-indirect-rate" type="number" min="0" step="1">
                        </div>
                        <div class="form-group">
                            <label>Коэф. брака / времени</label>
                            <input id="tpa-waste-factor" type="number" min="1" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>Целевая маржа, %</label>
                            <input id="tpa-target-margin" type="number" min="1" max="95" step="1">
                        </div>
                    </div>
                    <div class="tpa-formula" id="tpa-formula-box"></div>
                    <div id="tpa-results" class="tpa-results-grid"></div>
                    <div id="tpa-alerts" class="tpa-alerts"></div>
                </section>

                <section class="card">
                    <div class="card-header">
                        <h3>Тиражная таблица</h3>
                        <span class="tpa-badge" id="tpa-current-verdict">Считаем</span>
                    </div>
                    <div class="table-wrap">
                        <table style="font-size:12px;">
                            <thead>
                                <tr>
                                    <th>Тираж</th>
                                    <th>Скорость</th>
                                    <th>Часы</th>
                                    <th>Runtime / шт</th>
                                    <th>Форма / шт</th>
                                    <th>Себест. / шт</th>
                                    <th>Цена без НДС</th>
                                    <th>Вердикт</th>
                                </tr>
                            </thead>
                            <tbody id="tpa-tier-table"></tbody>
                        </table>
                    </div>
                </section>
            </div>
        `;
    },

    bindEvents(root) {
        root.addEventListener('click', (event) => {
            const presetBtn = event.target.closest('[data-tpa-preset]');
            if (!presetBtn) return;
            this.applyPreset(presetBtn.dataset.tpaPreset);
        });

        root.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const key = {
                'tpa-quantity': 'quantity',
                'tpa-weight': 'weight',
                'tpa-cavities': 'cavities',
                'tpa-openings': 'openingsPerHour',
                'tpa-mold-cost': 'moldCost',
                'tpa-setup-cost': 'setupCost',
                'tpa-material-cost': 'materialCostPerKg',
                'tpa-operator-rate': 'operatorRatePerHour',
                'tpa-indirect-rate': 'indirectRatePerHour',
                'tpa-waste-factor': 'wasteFactor',
                'tpa-target-margin': 'targetMarginPct',
            }[target.id];
            if (!key) return;
            this.state[key] = this.readNumber(target.value, this.state[key]);
            this.state.preset = 'custom';
            this.refresh();
        });

        root.addEventListener('change', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || target.id !== 'tpa-geometry') return;
            this.state.geometry = target.value || 'flat';
            this.state.preset = 'custom';
            this.refresh();
        });
    },

    readNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    },

    applyPreset(presetName) {
        const preset = this.PRESETS[presetName];
        if (!preset) return;
        this.state = { ...this.state, ...preset.values, preset: presetName };
        this.refresh();
    },

    refresh() {
        if (!this.root || !this.state) return;
        this.syncInputs();
        this.refreshResults();
    },

    syncInputs() {
        const state = this.state;
        this.setInputValue('tpa-quantity', state.quantity);
        this.setInputValue('tpa-weight', state.weight);
        this.setInputValue('tpa-cavities', state.cavities);
        this.setInputValue('tpa-openings', state.openingsPerHour);
        this.setInputValue('tpa-mold-cost', state.moldCost);
        this.setInputValue('tpa-setup-cost', state.setupCost);
        this.setInputValue('tpa-material-cost', state.materialCostPerKg);
        this.setInputValue('tpa-operator-rate', state.operatorRatePerHour);
        this.setInputValue('tpa-indirect-rate', state.indirectRatePerHour);
        this.setInputValue('tpa-waste-factor', state.wasteFactor);
        this.setInputValue('tpa-target-margin', state.targetMarginPct);
        const geometryEl = this.byId('tpa-geometry');
        if (geometryEl) geometryEl.value = state.geometry;
        this.root.querySelectorAll('[data-tpa-preset]').forEach(button => {
            button.classList.toggle('active', button.dataset.tpaPreset === state.preset);
        });
    },

    setInputValue(id, value) {
        const el = this.byId(id);
        if (el) el.value = String(value ?? '');
    },

    byId(id) {
        return this.root ? this.root.querySelector(`#${id}`) : null;
    },

    refreshResults() {
        const scenario = this.calculateScenario(this.state);
        const technical = this.getTechnicalAssessment(this.state);
        const verdict = this.getEconomicVerdict(scenario, technical);

        const verdictEl = this.byId('tpa-current-verdict');
        if (verdictEl) {
            verdictEl.className = `tpa-badge ${verdict.key}`;
            verdictEl.textContent = verdict.label;
        }

        const formulaEl = this.byId('tpa-formula-box');
        if (formulaEl) {
            formulaEl.innerHTML = `
                <strong>Формула:</strong> runtime / шт = пластик + ФОТ + косвенные + запуск партии.<br>
                <strong>Итог / шт:</strong> runtime / шт + молд / тираж.<br>
                <strong>Здесь сейчас:</strong> ${this.rub(scenario.plasticPerUnit)} + ${this.rub(scenario.fotPerUnit)} + ${this.rub(scenario.indirectPerUnit)} + ${this.rub(scenario.setupPerUnit)} + ${this.rub(scenario.moldPerUnit)} = <strong>${this.rub(scenario.totalPerUnit)}</strong>.
            `;
        }

        const resultsEl = this.byId('tpa-results');
        if (resultsEl) {
            resultsEl.innerHTML = [
                this.renderResultCard('Производительность', `${this.formatQty(scenario.piecesPerHour)} шт/ч`, `${this.state.cavities} гнезд x ${this.formatQty(this.state.openingsPerHour)} открытий/ч`),
                this.renderResultCard('Часы партии', this.formatHours(scenario.hoursTotal), `1 смена в месяц: ${this.formatQty(scenario.oneShiftMonthly)} шт`),
                this.renderResultCard('Runtime без формы', this.rub(scenario.runtimePerUnit), `${this.rub(scenario.runtimeTotal)} на всю партию`),
                this.renderResultCard('Форма на 1 шт', this.rub(scenario.moldPerUnit), `${this.rub(this.state.moldCost)} / ${this.formatQty(this.state.quantity)} шт`),
                this.renderResultCard('Себестоимость', this.rub(scenario.totalPerUnit), `${this.rub(scenario.totalCost)} на весь тираж`),
                this.renderResultCard('Цена без НДС', scenario.sellNoVat > 0 ? this.rub(scenario.sellNoVat) : '—', scenario.sellWithVat > 0 ? `с НДС: ${this.rub(scenario.sellWithVat)}` : 'проверьте целевую маржу'),
            ].join('');
        }

        const alertsEl = this.byId('tpa-alerts');
        if (alertsEl) {
            alertsEl.innerHTML = this.getScenarioAlerts(scenario, technical, verdict).map(alert => (
                `<div class="tpa-alert ${alert.type}">${alert.text}</div>`
            )).join('');
        }

        const tierEl = this.byId('tpa-tier-table');
        if (tierEl) {
            tierEl.innerHTML = this.TIER_QTYS.map(quantity => {
                const tierScenario = this.calculateScenario({ ...this.state, quantity });
                const tierVerdict = this.getEconomicVerdict(tierScenario, technical);
                return `
                    <tr>
                        <td>${this.formatQty(quantity)}</td>
                        <td>${this.formatQty(tierScenario.piecesPerHour)} шт/ч</td>
                        <td>${this.formatHours(tierScenario.hoursTotal)}</td>
                        <td>${this.rub(tierScenario.runtimePerUnit)}</td>
                        <td>${this.rub(tierScenario.moldPerUnit)}</td>
                        <td><strong>${this.rub(tierScenario.totalPerUnit)}</strong></td>
                        <td>${tierScenario.sellNoVat > 0 ? this.rub(tierScenario.sellNoVat) : '—'}</td>
                        <td><span class="tpa-badge ${tierVerdict.key}">${tierVerdict.label}</span></td>
                    </tr>
                `;
            }).join('');
        }
    },

    renderResultCard(label, value, sub) {
        return `
            <div class="tpa-result-card">
                <div class="tpa-result-label">${this.escape(label)}</div>
                <div class="tpa-result-value">${this.escape(value)}</div>
                <div class="tpa-result-sub">${this.escape(sub)}</div>
            </div>
        `;
    },

    calculateScenario(input) {
        const quantity = Math.max(1, Number(input.quantity || 0) || 1);
        const cavities = Math.max(1, Number(input.cavities || 0) || 1);
        const openingsPerHour = Math.max(1, Number(input.openingsPerHour || 0) || 1);
        const weight = Math.max(0, Number(input.weight || 0) || 0);
        const wasteFactor = Math.max(1, Number(input.wasteFactor || 1.1) || 1.1);
        const materialCostPerKg = Math.max(0, Number(input.materialCostPerKg || 0) || 0);
        const operatorRatePerHour = Math.max(0, Number(input.operatorRatePerHour || 0) || 0);
        const indirectRatePerHour = Math.max(0, Number(input.indirectRatePerHour || 0) || 0);
        const moldCost = Math.max(0, Number(input.moldCost || 0) || 0);
        const setupCost = Math.max(0, Number(input.setupCost || 0) || 0);
        const marginPct = Math.max(0, Number(input.targetMarginPct || 0) || 0);
        const piecesPerHour = cavities * openingsPerHour;
        const hoursTotal = (quantity / piecesPerHour) * wasteFactor;
        const plasticPerUnit = this.round2((materialCostPerKg / 1000) * weight * wasteFactor);
        const fotPerUnit = this.round2((hoursTotal * operatorRatePerHour) / quantity);
        const indirectPerUnit = this.round2((hoursTotal * indirectRatePerHour) / quantity);
        const setupPerUnit = this.round2(setupCost / quantity);
        const runtimePerUnit = this.round2(plasticPerUnit + fotPerUnit + indirectPerUnit + setupPerUnit);
        const moldPerUnit = this.round2(moldCost / quantity);
        const totalPerUnit = this.round2(runtimePerUnit + moldPerUnit);
        const keepRate = this.getKeepRate(marginPct / 100);
        const sellNoVat = keepRate > 0 ? this.roundTo5(totalPerUnit / keepRate) : 0;
        const vatRate = (typeof App !== 'undefined' && Number.isFinite(App?.params?.vatRate)) ? Number(App.params.vatRate) : 0.05;

        return {
            quantity,
            cavities,
            openingsPerHour,
            weight,
            piecesPerHour,
            hoursTotal: this.round2(hoursTotal),
            plasticPerUnit,
            fotPerUnit,
            indirectPerUnit,
            setupPerUnit,
            runtimePerUnit,
            moldPerUnit,
            totalPerUnit,
            runtimeTotal: this.round2(runtimePerUnit * quantity),
            totalCost: this.round2(totalPerUnit * quantity),
            sellNoVat,
            sellWithVat: sellNoVat > 0 ? this.round2(sellNoVat * (1 + vatRate)) : 0,
            oneShiftMonthly: Math.round(piecesPerHour * 8 * 21),
        };
    },

    getKeepRate(targetMargin) {
        const params = (typeof App !== 'undefined' && App.params) || {};
        if (typeof getKeepRateForTargetMargin === 'function') {
            return getKeepRateForTargetMargin(params, targetMargin);
        }
        const taxRate = Number.isFinite(params.taxRate) ? Number(params.taxRate) : 0.07;
        const charityRate = Number.isFinite(params.charityRate) ? Number(params.charityRate) : 0.01;
        return 1 - taxRate - 0.065 - charityRate - (Number(targetMargin) || 0);
    },

    getTechnicalAssessment(input) {
        const geometry = String(input.geometry || 'flat');
        const weight = Number(input.weight || 0);
        const cavities = Number(input.cavities || 0);
        if (geometry === 'insert') return { key: 'bad', reason: 'Есть ручная вставка или операция внутри цикла, поэтому маленький ТПА теряет главный смысл.' };
        if (geometry === 'thick') return { key: weight <= 10 && cavities <= 2 ? 'transition' : 'bad', reason: 'Толстая монолитная геометрия быстро упирается в вес выстрела и охлаждение.' };
        if (geometry === 'ribbed') return { key: weight <= 20 && cavities <= 2 ? 'good' : 'transition', reason: 'Ребристая объемная форма может жить на XPM-17, но только при аккуратном весе и гнездности.' };
        if (geometry === 'small') return { key: weight <= 5 && cavities <= 8 ? 'good' : 'transition', reason: 'Мелкие детали хороши для ТПА, пока не становятся тяжелыми или слишком рельефными.' };
        return { key: weight <= 8 && cavities <= 6 ? 'good' : 'transition', reason: 'Плоская тонкая геометрия лучше всего раскрывает XPM-17 на длинных тиражах.' };
    },

    getEconomicVerdict(scenario, technical) {
        if (!scenario || !technical) return { key: 'transition', label: 'Считаем' };
        if (technical.key === 'bad') return { key: 'injector', label: 'Сейчас лучше инжектор' };
        const ratio = scenario.moldPerUnit / Math.max(scenario.runtimePerUnit, 0.01);
        if (scenario.quantity < 10000 || ratio > 2.2) return { key: 'injector', label: 'Сейчас лучше инжектор' };
        if (technical.key === 'transition' || scenario.quantity < 50000 || ratio > 1) return { key: 'transition', label: 'Переходная зона' };
        return { key: 'tpa', label: 'Хорошо для ТПА' };
    },

    getScenarioAlerts(scenario, technical, verdict) {
        const shotWeight = Number(this.state.weight || 0) * Number(this.state.cavities || 0);
        return [
            {
                type: verdict.key === 'tpa' ? 'good' : (verdict.key === 'transition' ? 'warn' : 'bad'),
                text: `<strong>${this.escape(verdict.label)}.</strong> ${this.escape(technical.reason)}`,
            },
            {
                type: 'warn',
                text: `Молд дает <strong>${this.rub(scenario.moldPerUnit)}</strong> на штуку, runtime без формы дает <strong>${this.rub(scenario.runtimePerUnit)}</strong>. Их соотношение объясняет, почему маленький тираж еще не раскрывает ТПА.`,
            },
            {
                type: shotWeight > this.MACHINE.shotWeightGrams * 0.85 ? 'bad' : 'good',
                text: `Пакет веса на цикл: <strong>${this.round2(shotWeight)} г</strong> из лимита ${this.MACHINE.shotWeightGrams} г.`,
            },
        ];
    },

    roundTo5(value) {
        return Math.round((Number(value) || 0) / 5) * 5;
    },

    round2(value) {
        if (typeof round2 === 'function') return round2(value);
        return Math.round((Number(value) || 0) * 100) / 100;
    },

    rub(value) {
        if (typeof formatRub === 'function') return formatRub(value);
        return `${Math.round(Number(value) || 0).toLocaleString('ru-RU')} ₽`;
    },

    formatQty(value) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0));
    },

    formatHours(value) {
        return `${this.round2(Number(value || 0)).toLocaleString('ru-RU')} ч`;
    },

    escape(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
};
