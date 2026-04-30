// =============================================
// Recycle Object — TPA XPM-17 explainer + calculator
// =============================================

const TPA = {
    TIER_QTYS: [1000, 3000, 5000, 10000, 30000, 50000, 100000, 200000, 300000],
    PLACEHOLDER_WEIGHTS: new Set([5, 10, 15, 20, 30, 40]),
    REAL_WEIGHT_OVERRIDES: Object.freeze({
        'Отельный': 6.5,
        'Бланк прямоугольник': 5.9,
        'Бланк треугольник': 3,
        'Бланк квадрат': 4.5,
        'Бланк круг': 3.5,
        'Бланк сердце': 3.5,
        'Ключ': 2.5,
    }),
    MACHINE: Object.freeze({
        model: 'XPM-17',
        clampTons: 17,
        shotWeightGrams: 40,
        moldSize: '200×250×200 мм',
        screw: '22 мм',
        stroke: '125 мм',
        voltage: '220V',
    }),
    PRESETS: Object.freeze({
        flat: {
            label: 'Плоский бланк',
            note: 'Базовый сценарий для разговора с клиентом: тонкая плоская форма, 4 гнезда, консервативные 60 открытий в час.',
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
            note: 'Кейс с большой ребристой деталью: 2 гнезда, 60 открытий в час, вес около 16 г.',
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
            note: 'Свободный режим. Подставьте свои вес, гнездность и скорость и проверьте, когда ТПА начинает дышать.',
            values: {},
        },
    }),

    root: null,
    blanks: [],
    state: null,
    shellRendered: false,
    bound: false,

    async load() {
        this.root = document.getElementById('tpa-root');
        if (!this.root) return;
        if (!this.state) this.state = this.getDefaultState();
        await this.loadBlanks();
        if (!this.shellRendered) {
            this.renderShell();
            this.shellRendered = true;
        }
        if (!this.bound) {
            this.bindEvents();
            this.bound = true;
        }
        this.refresh();
    },

    getDefaultState() {
        const params = App.params || getProductionParams(App.settings || {});
        const marginTarget = this.normalizePercent(params.marginTarget, 40);

        return {
            preset: 'flat',
            geometry: 'flat',
            quantity: 30000,
            weight: 5.9,
            cavities: 4,
            openingsPerHour: 60,
            moldCost: 200000,
            setupCost: 8571,
            materialCostPerKg: round2(Number(params.plasticCostPerKg || 250) || 250),
            operatorRatePerHour: round2(Number(params.fotPerHour || 550) || 550),
            indirectRatePerHour: round2(Number(params.indirectPerHour || 0) || 0),
            wasteFactor: round2(Number(params.wasteFactor || 1.1) || 1.1),
            targetMarginPct: marginTarget,
            selectedBlankId: null,
            collectionFilter: 'all',
            verdictFilter: 'all',
        };
    },

    normalizePercent(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return numeric <= 1 ? round2(numeric * 100) : round2(numeric);
    },

    async loadBlanks() {
        let molds = [];
        try {
            molds = await loadMolds();
        } catch (error) {
            console.error('[TPA] loadMolds failed:', error);
        }

        this.blanks = (molds || [])
            .filter(mold => mold && mold.category === 'blank')
            .map(mold => {
                const tpaWeight = this.getDisplayWeight(mold);
                return {
                    ...mold,
                    tpaWeight,
                };
            })
            .sort((a, b) => {
                const collectionA = String(a.collection || '').localeCompare(String(b.collection || ''), 'ru');
                if (collectionA !== 0) return collectionA;
                return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
            });

        if (this.state && this.state.selectedBlankId != null) {
            const exists = this.blanks.some(blank => String(blank.id) === String(this.state.selectedBlankId));
            if (!exists) this.state.selectedBlankId = null;
        }
    },

    getDisplayWeight(blank) {
        const liveWeight = Number(blank?.weight_grams || 0);
        const override = Number(this.REAL_WEIGHT_OVERRIDES[String(blank?.name || '')] || 0);
        if (override > 0 && (!liveWeight || this.PLACEHOLDER_WEIGHTS.has(liveWeight))) return override;
        if (liveWeight > 0) return round2(liveWeight);
        return override > 0 ? round2(override) : 0;
    },

    renderShell() {
        this.root.innerHTML = `
            <div class="tpa-page">
                <div class="page-header">
                    <div>
                        <h1>ТПА XPM-17</h1>
                        <div class="tpa-copy">Отдельная страница для разговора с клиентом: где ещё логичнее инжектор, а где на больших тиражах уже начинает выигрывать ТПА.</div>
                    </div>
                    <div class="flex gap-8">
                        <button class="btn btn-outline" data-tpa-action="open-molds">Открыть бланки</button>
                        <button class="btn btn-outline" data-tpa-action="open-calculator">К заказу</button>
                    </div>
                </div>

                <section class="tpa-hero">
                    <div class="tpa-hero-top">
                        <div>
                            <h1>Не “ещё один калькулятор”, а понятная история про то, когда клиенту уже стоит идти в ТПА.</h1>
                            <p>Бланки ниже нужны не как будущий ассортимент ТПА, а как понятные референсы для переговоров. Смотрим на форму, вес и тираж и на пальцах объясняем: здесь выгоднее инжектор, здесь переходная зона, а здесь новый клиентский молд на ТПА уже имеет смысл.</p>
                            <div class="tpa-chip-row">
                                <span class="tpa-chip">Кастомный молд под клиента</span>
                                <span class="tpa-chip">Оператор полностью занят у станка</span>
                                <span class="tpa-chip">ФОТ и косвенные падают на все часы партии</span>
                                <span class="tpa-chip">Обрезание литника не считаем отдельно</span>
                            </div>
                        </div>
                        <div class="tpa-hero-side">
                            <div class="tpa-hero-stat">
                                <div class="tpa-hero-stat-label">Станок</div>
                                <div class="tpa-hero-stat-value">${this.escape(this.MACHINE.model)}</div>
                                <div class="tpa-hero-stat-sub">17 тонн, компактный all-electric</div>
                            </div>
                            <div class="tpa-hero-stat">
                                <div class="tpa-hero-stat-label">Лимит по выстрелу</div>
                                <div class="tpa-hero-stat-value">${this.MACHINE.shotWeightGrams} г</div>
                                <div class="tpa-hero-stat-sub">то есть легкие и тонкие детали выигрывают</div>
                            </div>
                            <div class="tpa-hero-stat">
                                <div class="tpa-hero-stat-label">Макс. молд</div>
                                <div class="tpa-hero-stat-value">${this.escape(this.MACHINE.moldSize)}</div>
                                <div class="tpa-hero-stat-sub">большие монолитные штуки быстро упираются в размер и охлаждение</div>
                            </div>
                            <div class="tpa-hero-stat">
                                <div class="tpa-hero-stat-label">Старт интереса</div>
                                <div class="tpa-hero-stat-value">30–50k</div>
                                <div class="tpa-hero-stat-sub">на простых плоских формах, если геометрия подходит</div>
                            </div>
                        </div>
                    </div>
                </section>

                <div class="tpa-layout">
                    <div class="tpa-stack">
                        <section class="card">
                            <div class="card-header">
                                <h3>Как мы считаем ТПА сейчас</h3>
                                <span class="badge badge-blue">Консервативная модель</span>
                            </div>
                            <div class="tpa-copy">
                                Здесь нет “мягкого наблюдения боком”. Мы специально считаем жестко и честно: <strong>человек сидит у станка всю партию</strong>, параллельно только подрезает литник, поэтому отдельную операцию обрезания не добавляем. Зато <strong>весь ФОТ в час</strong> и <strong>все косвенные в час</strong> ложатся на часы этой партии.
                            </div>
                            <div class="tpa-key-grid">
                                <div class="tpa-key-card">
                                    <strong>Что ложится в runtime</strong>
                                    <p>Пластик, ФОТ оператора за все часы партии, косвенные за эти же часы и запуск партии.</p>
                                </div>
                                <div class="tpa-key-card">
                                    <strong>Что отдельно размазывается</strong>
                                    <p>Только стоимость клиентской формы: молд делится на тираж заказа, а не на гипотетический сток.</p>
                                </div>
                                <div class="tpa-key-card">
                                    <strong>Почему это полезно</strong>
                                    <p>Получается строгий ориентир для продаж: если даже в такой модели ТПА уже дышит, значит кейс правда сильный.</p>
                                </div>
                                <div class="tpa-key-card">
                                    <strong>Зачем бланки снизу</strong>
                                    <p>Они помогают объяснять клиенту не “наш ассортимент”, а саму логику: плоская тонкая геометрия любит ТПА, толстая и вставная нет.</p>
                                </div>
                            </div>
                            <div class="tpa-note-box" id="tpa-assumption-note"></div>
                        </section>

                        <section class="card">
                            <div class="card-header">
                                <h3>Живой расчет</h3>
                                <span class="badge badge-green" id="tpa-current-verdict">Считаем</span>
                            </div>
                            <div class="tpa-copy">Подставьте свой сценарий или ткните в конкретную бланковую форму ниже. Страница пересчитает и общую себестоимость, и “вердикт для клиента” на выбранном тираже.</div>
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
                            <div id="tpa-selected-blank" class="tpa-note-box" style="display:none;"></div>
                            <div id="tpa-results" class="tpa-results-grid"></div>
                            <div id="tpa-alerts" class="tpa-alerts"></div>
                        </section>

                        <section class="card">
                            <div class="card-header">
                                <h3>Тиражная таблица</h3>
                                <span class="badge badge-yellow">Один взгляд на “когда начинает дышать”</span>
                            </div>
                            <div class="tpa-copy">Берем текущий сценарий выше и размазываем форму по разным тиражам. Если форма на штуку больше самого runtime, клиенту проще объяснять инжектор. Когда форма садится ниже runtime, ТПА уже становится вкусным.</div>
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

                    <div class="tpa-stack">
                        <section class="card">
                            <div class="card-header">
                                <h3>Ограничения XPM-17</h3>
                                <span class="badge badge-red">Физика важнее желания</span>
                            </div>
                            <div class="tpa-meta-list">
                                <div class="tpa-meta-item"><span>Усилие смыкания</span><strong>${this.MACHINE.clampTons}T</strong></div>
                                <div class="tpa-meta-item"><span>Макс. вес выстрела</span><strong>${this.MACHINE.shotWeightGrams} г</strong></div>
                                <div class="tpa-meta-item"><span>Размер формы</span><strong>${this.escape(this.MACHINE.moldSize)}</strong></div>
                                <div class="tpa-meta-item"><span>Шнек / сопло</span><strong>${this.escape(this.MACHINE.screw)} / 3 мм</strong></div>
                                <div class="tpa-meta-item"><span>Ход раскрытия</span><strong>${this.escape(this.MACHINE.stroke)}</strong></div>
                                <div class="tpa-meta-item"><span>Вывод</span><strong>любит тонкие, легкие и повторяемые детали</strong></div>
                            </div>
                        </section>

                        <section class="card">
                            <div class="card-header">
                                <h3>Что продает ТПА клиенту</h3>
                            </div>
                            <div class="tpa-side-list">
                                <div class="tpa-side-list-item">
                                    <strong>Хорошо для ТПА</strong>
                                    Плоские бланки, тэги, ключи, буквы, мелкие фигурки и другие легкие детали, где можно разложить 4–8 гнезд и крутить длинные тиражи.
                                </div>
                                <div class="tpa-side-list-item">
                                    <strong>Переходная зона</strong>
                                    Средние по площади формы, сложный контур, ребристая объемная деталь типа дженги. Технически можно, но тираж и гнездность решают всё.
                                </div>
                                <div class="tpa-side-list-item">
                                    <strong>Где объяснять инжектор</strong>
                                    Толстые монолитные формы, вещи со вставкой, NFC, карабины 6–8 мм, большие драконы, кроссовки и другие детали, где этот XPM-17 слишком слаб или теряет свой безлюдный смысл.
                                </div>
                            </div>
                        </section>

                        <section class="card">
                            <div class="card-header">
                                <h3>Как говорить про косвенные</h3>
                            </div>
                            <div class="tpa-copy" id="tpa-indirect-explainer"></div>
                        </section>
                    </div>
                </div>

                <section class="card">
                    <div class="tpa-blank-toolbar">
                        <div>
                            <h3 style="margin-bottom:4px;">Бланковые формы как референсы для клиентов</h3>
                            <div class="tpa-copy" style="margin:0;">Ниже не “что мы обязаны делать на ТПА”, а удобный язык продаж. Берем знакомую форму и быстро объясняем клиенту, в каком режиме его тираж сейчас живет.</div>
                        </div>
                        <div class="tpa-filter-row">
                            <select id="tpa-collection-filter"></select>
                            <select id="tpa-verdict-filter">
                                <option value="all">Все вердикты</option>
                                <option value="injector">Сейчас лучше инжектор</option>
                                <option value="transition">Переходная зона</option>
                                <option value="tpa">Хорошо для ТПА</option>
                            </select>
                        </div>
                    </div>
                    <div id="tpa-blanks-grid" class="tpa-blanks-grid"></div>
                </section>
            </div>
        `;
    },

    bindEvents() {
        this.root.addEventListener('click', (event) => {
            const presetBtn = event.target.closest('[data-tpa-preset]');
            if (presetBtn) {
                this.applyPreset(presetBtn.dataset.tpaPreset);
                return;
            }

            const actionBtn = event.target.closest('[data-tpa-action]');
            if (actionBtn) {
                const action = actionBtn.dataset.tpaAction;
                if (action === 'open-molds') App.navigate('molds');
                if (action === 'open-calculator') App.navigate('calculator');
                return;
            }

            const blankBtn = event.target.closest('[data-tpa-fill-blank]');
            if (blankBtn) {
                this.selectBlank(blankBtn.dataset.tpaFillBlank);
            }
        });

        this.root.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            const idMap = {
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
            };

            const key = idMap[target.id];
            if (!key) return;
            this.state[key] = this.readNumber(target.value, this.state[key]);
            this.state.preset = 'custom';
            this.refresh();
        });

        this.root.addEventListener('change', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            if (target.id === 'tpa-geometry') {
                this.state.geometry = target.value || 'flat';
                this.state.preset = 'custom';
                this.refresh();
                return;
            }

            if (target.id === 'tpa-collection-filter') {
                this.state.collectionFilter = target.value || 'all';
                this.refreshBlanks();
                return;
            }

            if (target.id === 'tpa-verdict-filter') {
                this.state.verdictFilter = target.value || 'all';
                this.refreshBlanks();
            }
        });
    },

    readNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    },

    applyPreset(presetName) {
        const preset = this.PRESETS[presetName];
        if (!preset) return;
        this.state = {
            ...this.state,
            ...preset.values,
            preset: presetName,
            selectedBlankId: null,
        };
        this.refresh();
    },

    selectBlank(blankId) {
        const blank = this.blanks.find(item => String(item.id) === String(blankId));
        if (!blank) return;

        const assessment = this.assessBlank(blank);
        this.state = {
            ...this.state,
            preset: 'custom',
            selectedBlankId: blank.id,
            geometry: assessment.geometry,
            weight: blank.tpaWeight || this.state.weight,
            cavities: assessment.recommendedCavities,
            openingsPerHour: assessment.openingsPerHour,
        };
        this.refresh();
    },

    refresh() {
        if (!this.root) return;
        this.syncInputs();
        this.refreshStaticBlocks();
        this.refreshResults();
        this.refreshBlanks();
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

        const geometryEl = document.getElementById('tpa-geometry');
        if (geometryEl) geometryEl.value = state.geometry;

        const collectionEl = document.getElementById('tpa-collection-filter');
        const collections = ['all', ...new Set(this.blanks.map(blank => String(blank.collection || '').trim()).filter(Boolean))];
        if (collectionEl) {
            const currentHtml = collections.map(collection => collection).join('|');
            if (collectionEl.dataset.signature !== currentHtml) {
                collectionEl.dataset.signature = currentHtml;
                collectionEl.innerHTML = collections.map(collection => {
                    const label = collection === 'all' ? 'Все коллекции' : collection;
                    return `<option value="${this.escapeAttr(collection)}">${this.escape(label)}</option>`;
                }).join('');
            }
            collectionEl.value = state.collectionFilter;
        }

        const verdictEl = document.getElementById('tpa-verdict-filter');
        if (verdictEl) verdictEl.value = state.verdictFilter;

        this.root.querySelectorAll('[data-tpa-preset]').forEach(button => {
            button.classList.toggle('active', button.dataset.tpaPreset === state.preset);
        });
    },

    setInputValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = String(value ?? '');
    },

    refreshStaticBlocks() {
        const assumptionEl = document.getElementById('tpa-assumption-note');
        if (assumptionEl) {
            assumptionEl.innerHTML = `<strong>Базовая договоренность:</strong> все формы здесь считаем как <strong>новый клиентский молд</strong>. Бланки ниже нужны лишь как наглядные примеры геометрии, чтобы объяснить клиенту: при такой форме и таком тираже логичнее инжектор или уже пора смотреть в сторону ТПА.`;
        }

        const indirectEl = document.getElementById('tpa-indirect-explainer');
        const scenario = this.calculateScenario(this.state);
        if (indirectEl) {
            indirectEl.innerHTML = `
                <strong>${formatRub(this.state.indirectRatePerHour)}/ч</strong> умножается на все часы партии.<br>
                В текущем сценарии это <strong>${this.formatHours(scenario.hoursTotal)}</strong>, то есть <strong>${formatRub(scenario.indirectTotal)}</strong> косвенных на всю партию или <strong>${formatRub(scenario.indirectPerUnit)}</strong> на штуку.<br>
                Логика максимально простая: пока оператор у станка, ТПА забирает не только ФОТ, но и всю часовую косвенную нагрузку этого производственного времени.
            `;
        }
    },

    refreshResults() {
        const scenario = this.calculateScenario(this.state);
        const technical = this.getTechnicalAssessment(this.state);
        const verdict = this.getEconomicVerdict(scenario, technical);

        const verdictEl = document.getElementById('tpa-current-verdict');
        if (verdictEl) {
            verdictEl.className = `tpa-badge ${verdict.key}`;
            verdictEl.textContent = verdict.label;
        }

        const formulaEl = document.getElementById('tpa-formula-box');
        if (formulaEl) {
            formulaEl.innerHTML = `
                <strong>Формула:</strong> runtime / шт = пластик + ФОТ + косвенные + запуск партии.<br>
                <strong>Итог / шт:</strong> runtime / шт + молд / тираж.<br>
                <strong>Здесь сейчас:</strong> ${formatRub(scenario.plasticPerUnit)} + ${formatRub(scenario.fotPerUnit)} + ${formatRub(scenario.indirectPerUnit)} + ${formatRub(scenario.setupPerUnit)} + ${formatRub(scenario.moldPerUnit)} = <strong>${formatRub(scenario.totalPerUnit)}</strong>.
            `;
        }

        const selectedBlankEl = document.getElementById('tpa-selected-blank');
        if (selectedBlankEl) {
            if (this.state.selectedBlankId == null) {
                selectedBlankEl.style.display = 'none';
                selectedBlankEl.innerHTML = '';
            } else {
                const blank = this.blanks.find(item => String(item.id) === String(this.state.selectedBlankId));
                const assessment = blank ? this.assessBlank(blank) : null;
                selectedBlankEl.style.display = '';
                selectedBlankEl.innerHTML = blank
                    ? `<strong>Сейчас выбран референс:</strong> ${this.escape(blank.name)}. Мы берем его как понятную геометрию для клиента: ${assessment ? this.escape(assessment.shortWhy) : ''}`
                    : '';
            }
        }

        const resultsEl = document.getElementById('tpa-results');
        if (resultsEl) {
            resultsEl.innerHTML = [
                this.renderResultCard('Производительность', `${this.formatQty(scenario.piecesPerHour)} шт/ч`, `${this.state.cavities} гнезд × ${this.formatQty(this.state.openingsPerHour)} открытий/ч`),
                this.renderResultCard('Часы партии', this.formatHours(scenario.hoursTotal), `1 смена в месяц: ${this.formatQty(scenario.oneShiftMonthly)} шт`),
                this.renderResultCard('Runtime без формы', formatRub(scenario.runtimePerUnit), `${formatRub(scenario.runtimeTotal)} на всю партию`),
                this.renderResultCard('Форма на 1 шт', formatRub(scenario.moldPerUnit), `${formatRub(this.state.moldCost)} / ${this.formatQty(this.state.quantity)} шт`),
                this.renderResultCard('Себестоимость', formatRub(scenario.totalPerUnit), `${formatRub(scenario.totalCost)} на весь тираж`),
                this.renderResultCard('Цена без НДС', scenario.sellNoVat > 0 ? formatRub(scenario.sellNoVat) : '—', scenario.sellWithVat > 0 ? `с НДС: ${formatRub(scenario.sellWithVat)}` : 'проверьте целевую маржу'),
            ].join('');
        }

        const alertsEl = document.getElementById('tpa-alerts');
        if (alertsEl) {
            alertsEl.innerHTML = this.getScenarioAlerts(scenario, technical, verdict).map(alert => (
                `<div class="tpa-alert ${alert.type}">${alert.text}</div>`
            )).join('');
        }

        const tierEl = document.getElementById('tpa-tier-table');
        if (tierEl) {
            tierEl.innerHTML = this.TIER_QTYS.map(quantity => {
                const tierScenario = this.calculateScenario({ ...this.state, quantity });
                const tierVerdict = this.getEconomicVerdict(tierScenario, technical);
                return `
                    <tr>
                        <td>${this.formatQty(quantity)}</td>
                        <td>${this.formatQty(tierScenario.piecesPerHour)} шт/ч</td>
                        <td>${this.formatHours(tierScenario.hoursTotal)}</td>
                        <td>${formatRub(tierScenario.runtimePerUnit)}</td>
                        <td>${formatRub(tierScenario.moldPerUnit)}</td>
                        <td><strong>${formatRub(tierScenario.totalPerUnit)}</strong></td>
                        <td>${tierScenario.sellNoVat > 0 ? formatRub(tierScenario.sellNoVat) : '—'}</td>
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
        const plasticPerUnit = round2((materialCostPerKg / 1000) * weight * wasteFactor);
        const fotPerUnit = round2((hoursTotal * operatorRatePerHour) / quantity);
        const indirectPerUnit = round2((hoursTotal * indirectRatePerHour) / quantity);
        const setupPerUnit = round2(setupCost / quantity);
        const runtimePerUnit = round2(plasticPerUnit + fotPerUnit + indirectPerUnit + setupPerUnit);
        const moldPerUnit = round2(moldCost / quantity);
        const totalPerUnit = round2(runtimePerUnit + moldPerUnit);

        const runtimeTotal = round2(runtimePerUnit * quantity);
        const moldTotal = round2(moldPerUnit * quantity);
        const totalCost = round2(totalPerUnit * quantity);

        const keepRate = this.getKeepRate(marginPct / 100);
        const sellNoVat = keepRate > 0 ? this.roundTo5(totalPerUnit / keepRate) : 0;
        const vatRate = Number.isFinite(App?.params?.vatRate) ? Number(App.params.vatRate) : 0.05;
        const sellWithVat = sellNoVat > 0 ? round2(sellNoVat * (1 + vatRate)) : 0;

        return {
            quantity,
            cavities,
            openingsPerHour,
            weight,
            piecesPerHour,
            hoursTotal: round2(hoursTotal),
            plasticPerUnit,
            fotPerUnit,
            indirectPerUnit,
            setupPerUnit,
            runtimePerUnit,
            moldPerUnit,
            totalPerUnit,
            runtimeTotal,
            moldTotal,
            totalCost,
            indirectTotal: round2(indirectPerUnit * quantity),
            sellNoVat,
            sellWithVat,
            oneShiftMonthly: Math.round(piecesPerHour * 8 * 21),
            fullMonthly: Math.round(piecesPerHour * 24 * 30),
        };
    },

    getKeepRate(targetMargin) {
        if (typeof getKeepRateForTargetMargin === 'function') {
            return getKeepRateForTargetMargin(App.params || getProductionParams(App.settings || {}), targetMargin);
        }
        const taxRate = Number.isFinite(App?.params?.taxRate) ? Number(App.params.taxRate) : 0.07;
        const charityRate = Number.isFinite(App?.params?.charityRate) ? Number(App.params.charityRate) : 0.01;
        return 1 - taxRate - 0.065 - charityRate - (Number(targetMargin) || 0);
    },

    getTechnicalAssessment(input) {
        const geometry = String(input.geometry || 'flat');
        const weight = Number(input.weight || 0);
        const cavities = Number(input.cavities || 0);

        if (geometry === 'insert') {
            return {
                key: 'bad',
                short: 'ручная вставка',
                reason: 'Если в детали есть вставка или ручная операция внутри цикла, у XPM-17 пропадает главный плюс: отсутствие постоянного ручного участия.',
            };
        }

        if (geometry === 'thick') {
            if (weight <= 10 && cavities <= 2) {
                return {
                    key: 'transition',
                    short: 'толстая деталь',
                    reason: 'Толстая монолитная геометрия на таком маленьком ТПА уже на грани. Это скорее зона аккуратного редизайна, а не комфортного массового режима.',
                };
            }
            return {
                key: 'bad',
                short: 'слишком толстая геометрия',
                reason: 'Для монолитной толщины этот XPM-17 слабоват по впрыску и охлаждению. Это лучше объяснять клиенту как территорию инжектора или редизайна.',
            };
        }

        if (geometry === 'ribbed') {
            if (weight <= 20 && cavities <= 2) {
                return {
                    key: 'good',
                    short: 'ребристая объемная форма',
                    reason: 'Если деталь объемная, но ее можно облегчить ребрами, XPM-17 уже может с ней жить. Дженга как раз показывает эту зону.',
                };
            }
            return {
                key: 'transition',
                short: 'объемная форма',
                reason: 'Объемные детали на XPM-17 возможны, но быстро упираются в вес выстрела и количество гнезд. Тут важен точный редизайн.',
            };
        }

        if (geometry === 'small') {
            if (weight <= 5 && cavities <= 8) {
                return {
                    key: 'good',
                    short: 'мелкая деталь',
                    reason: 'Мелкие детали и буквы это сильная территория ТПА: много гнезд, легкий выстрел и понятный длинный тираж.',
                };
            }
            return {
                key: 'transition',
                short: 'компактная деталь',
                reason: 'По размеру подходит, но если деталь тяжелеет или становится слишком рельефной, ТПА уже не такой сладкий.',
            };
        }

        if (weight <= 8 && cavities <= 6) {
            return {
                key: 'good',
                short: 'плоская тонкая форма',
                reason: 'Это лучший сценарий для XPM-17: легкая тонкая геометрия, в которую можно упаковать несколько гнезд и ровный массовый цикл.',
            };
        }

        return {
            key: 'transition',
            short: 'плоская, но уже тяжеловатая',
            reason: 'Геометрия еще похожа на ТПА-кандидата, но чем больше вес и площадь, тем меньше останется места для гнездности и скорости.',
        };
    },

    getEconomicVerdict(scenario, technical) {
        if (!scenario || !technical) return { key: 'transition', label: 'Считаем' };
        if (technical.key === 'bad') return { key: 'injector', label: 'Сейчас лучше инжектор' };

        const ratio = scenario.moldPerUnit / Math.max(scenario.runtimePerUnit, 0.01);

        if (scenario.quantity < 10000 || ratio > 2.2) {
            return { key: 'injector', label: 'Сейчас лучше инжектор' };
        }

        if (technical.key === 'transition' || scenario.quantity < 50000 || ratio > 1) {
            return { key: 'transition', label: 'Переходная зона' };
        }

        return { key: 'tpa', label: 'Хорошо для ТПА' };
    },

    getScenarioAlerts(scenario, technical, verdict) {
        const alerts = [];
        const shotWeight = Number(this.state.weight || 0) * Number(this.state.cavities || 0);

        alerts.push({
            type: verdict.key === 'tpa' ? 'good' : (verdict.key === 'transition' ? 'warn' : 'bad'),
            text: `<strong>${verdict.label}.</strong> ${this.escape(technical.reason)}`,
        });

        alerts.push({
            type: 'warn',
            text: `Сейчас молд дает <strong>${formatRub(scenario.moldPerUnit)}</strong> на штуку, а runtime без формы дает <strong>${formatRub(scenario.runtimePerUnit)}</strong>. Именно их соотношение лучше всего объясняет клиенту, почему на маленьком тираже ТПА еще не раскрылся.`,
        });

        if (shotWeight > this.MACHINE.shotWeightGrams * 0.85) {
            alerts.push({
                type: 'bad',
                text: `Пакет веса на цикл уже около <strong>${round2(shotWeight)} г</strong>. Это слишком близко к заявленному пределу ${this.MACHINE.shotWeightGrams} г, значит текущая гнездность выглядит оптимистично.`,
            });
        } else {
            alerts.push({
                type: 'good',
                text: `Пакет веса на цикл сейчас <strong>${round2(shotWeight)} г</strong>. По весу выстрела это пока выглядит внутри коридора для ${this.MACHINE.model}.`,
            });
        }

        if (scenario.quantity >= 30000 && scenario.quantity < 50000) {
            alerts.push({
                type: 'warn',
                text: 'Диапазон 30–50k обычно и есть точка, где ТПА только начинает становиться убедительным. Именно здесь клиенту полезно показывать таблицу тиражей, а не одну цифру.',
            });
        }

        if (scenario.quantity >= 100000 && verdict.key !== 'injector') {
            alerts.push({
                type: 'good',
                text: 'На 100k+ форма уже размазывается заметно лучше, и разговор с клиентом обычно смещается с “дорого сделать молд” на “как быстро и стабильно отгрузить объем”.',
            });
        }

        return alerts;
    },

    refreshBlanks() {
        const grid = document.getElementById('tpa-blanks-grid');
        if (!grid) return;

        const collectionFilter = this.state.collectionFilter;
        const verdictFilter = this.state.verdictFilter;

        const rows = this.blanks
            .map(blank => {
                const assessment = this.assessBlank(blank);
                const scenario = this.calculateScenario({
                    ...this.state,
                    geometry: assessment.geometry,
                    weight: blank.tpaWeight || this.state.weight,
                    cavities: assessment.recommendedCavities,
                    openingsPerHour: assessment.openingsPerHour,
                });
                const verdict = this.getEconomicVerdict(scenario, assessment.technical);
                return { blank, assessment, scenario, verdict };
            })
            .filter(row => {
                if (collectionFilter !== 'all' && String(row.blank.collection || '') !== collectionFilter) return false;
                if (verdictFilter !== 'all' && row.verdict.key !== verdictFilter) return false;
                return true;
            });

        if (!rows.length) {
            grid.innerHTML = `<div class="tpa-empty-state">Под этот фильтр сейчас ничего не попало. Смените коллекцию или вердикт.</div>`;
            return;
        }

        grid.innerHTML = rows.map(row => this.renderBlankCard(row)).join('');
    },

    renderBlankCard(row) {
        const { blank, assessment, scenario, verdict } = row;
        const selected = String(blank.id) === String(this.state.selectedBlankId);
        const media = blank.photo_url
            ? `<img src="${this.escapeAttr(blank.photo_url)}" alt="${this.escapeAttr(blank.name || '')}" onerror="this.remove()">`
            : this.escape(String(blank.name || '?').trim().slice(0, 1).toUpperCase());
        const verdictReason = this.getVerdictReason(scenario, assessment.technical, verdict);

        return `
            <article class="tpa-blank-card ${selected ? 'is-selected' : ''}">
                <div class="tpa-blank-media">${media}</div>
                <div>
                    <div class="tpa-blank-top">
                        <div>
                            <div class="tpa-blank-title">${this.escape(blank.name || 'Без названия')}</div>
                            <div class="tpa-blank-meta">${this.escape(blank.collection || 'Без коллекции')} · ${blank.tpaWeight > 0 ? `${blank.tpaWeight} г` : 'вес не обновлен'}</div>
                        </div>
                        <span class="tpa-badge ${verdict.key}">${verdict.label}</span>
                    </div>
                    <div class="tpa-blank-copy">
                        <strong>${this.escape(assessment.title)}.</strong> ${this.escape(assessment.shortWhy)} ${this.escape(verdictReason)}
                    </div>
                    <div class="tpa-blank-facts">
                        <div class="tpa-blank-fact">
                            <div class="tpa-blank-fact-label">Рекомендуемая гнездность</div>
                            <div class="tpa-blank-fact-value">${this.escape(assessment.cavitiesLabel)}</div>
                        </div>
                        <div class="tpa-blank-fact">
                            <div class="tpa-blank-fact-label">Runtime / шт</div>
                            <div class="tpa-blank-fact-value">${formatRub(scenario.runtimePerUnit)}</div>
                        </div>
                        <div class="tpa-blank-fact">
                            <div class="tpa-blank-fact-label">Форма / шт</div>
                            <div class="tpa-blank-fact-value">${formatRub(scenario.moldPerUnit)}</div>
                        </div>
                        <div class="tpa-blank-fact">
                            <div class="tpa-blank-fact-label">Цена без НДС сейчас</div>
                            <div class="tpa-blank-fact-value">${scenario.sellNoVat > 0 ? formatRub(scenario.sellNoVat) : '—'}</div>
                        </div>
                    </div>
                    <div class="tpa-blank-actions">
                        <span>${this.formatQty(this.state.quantity)} шт · ${this.formatQty(scenario.piecesPerHour)} шт/ч · ${this.formatHours(scenario.hoursTotal)}</span>
                        <button class="btn btn-outline btn-sm" data-tpa-fill-blank="${this.escapeAttr(String(blank.id))}">Посчитать как этот референс</button>
                    </div>
                </div>
            </article>
        `;
    },

    getVerdictReason(scenario, technical, verdict) {
        if (verdict.key === 'injector') {
            if (technical.key === 'bad') {
                return 'Здесь клиенту проще всего объяснять, что проблема не только в цене формы, но и в самой геометрии для этого станка.';
            }
            return `Сейчас форму приходится размазывать как минимум на ${formatRub(scenario.moldPerUnit)} / шт, и она душит экономику сильнее, чем сам runtime.`;
        }

        if (verdict.key === 'transition') {
            return 'Это уже разговор не “нет”, а “смотря какой тираж”. По геометрии шанс есть, но форма на штуку еще чувствуется.';
        }

        return 'Здесь клиенту уже можно уверенно показывать ТПА как рабочий сценарий: геометрия подходит, а форма на штуку перестает быть главным убийцей экономики.';
    },

    assessBlank(blank) {
        const name = String(blank.name || '').trim();
        const lower = name.toLowerCase();
        const collection = String(blank.collection || '').trim().toLowerCase();
        const weight = Number(blank.tpaWeight || 0);

        if (collection === 'nfc' || lower.includes('nfc')) {
            return this.makeBlankAssessment('Вставка внутри детали', 'Для NFC нужна ручная операция внутри процесса. Для XPM-17 это сразу ломает идею “человек не стоит все время”.', 'insert', 1, 1, 20, 'Нужна вставка / ручное участие', 'Референс для объяснения, почему тут лучше не обещать ТПА.', 'bad');
        }

        if (lower.includes('карабин')) {
            return this.makeBlankAssessment('Толстый монолит', 'Карабин это как раз хороший пример, почему не вся “простая” форма подходит ТПА. Здесь мешает толщина и монолитная масса, а не просто контур.', 'thick', 1, 2, 40, '1–2', 'Хороший пример, почему карабины лучше аргументировать через инжектор или через серьезный редизайн.', 'bad');
        }

        if (lower.includes('зеркало')) {
            return this.makeBlankAssessment('После литья нужна ручная сборка', 'По самому молду еще можно спорить, но зеркало потом надо вклеивать. Это уже не чистый безлюдный ТПА-кейс.', 'insert', 1, 2, 30, '1–2', 'Хороший пример переходной формы: литье возможно, но ручная сборка съедает смысл.', 'bad');
        }

        if (/(бегов|кроссовк|мыльниц|кардхолдер|картхолдер|подставка|ракетк|падл|велосипед|волчок|гребень|смайл|тюльпан|змея|ласт|большой дракон|большой конь|лошадь большая)/.test(lower)) {
            return this.makeBlankAssessment('Слишком большая или толстая геометрия', 'Это уже зона крупных монолитных форм. Для такого XPM-17 она слишком тяжелая и слишком “долго остывающая”.', 'thick', 1, 1, 25, '1', 'Удобный пример для клиента, почему размер сам по себе еще не делает кейс подходящим для ТПА.', 'bad');
        }

        if (collection === 'буквы' || lower.includes('буква')) {
            return this.makeBlankAssessment('Мелкая легкая деталь', 'Буквы показывают сильную сторону ТПА: маленький вес, высокая гнездность и длинные повторяемые серии.', 'small', 6, 8, 70, '6–8', 'Здесь ТПА объясняется клиенту очень легко: много гнезд и длинные тиражи.', 'good');
        }

        if (lower.includes('бусин')) {
            return this.makeBlankAssessment('Мелкая серийная геометрия', 'Бусины и похожие мелкие элементы идеально объясняют, зачем вообще нужен ТПА: компактная форма, много гнезд и ровный цикл.', 'small', 6, 8, 70, '6–8', 'Классический аргумент в пользу ТПА.', 'good');
        }

        if (lower.includes('тэг') || lower.includes('бирк')) {
            return this.makeBlankAssessment('Плоский массовый бланк', 'Тэг это одна из самых показательных форм: маленький вес, понятный контур и очень хороший потенциал по гнездности.', 'flat', 6, 8, 65, '6–8', 'Клиенту легко показать, почему здесь ТПА становится интересным рано.', 'good');
        }

        if (lower.includes('ключ')) {
            return this.makeBlankAssessment('Легкий плоский контур', 'Ключ хороший референс для ТПА: маленький вес и понятная плоская геометрия позволяют думать даже про высокую гнездность.', 'flat', 6, 8, 65, '6–8', 'Сильный кейс для объяснения преимуществ ТПА.', 'good');
        }

        if (lower.includes('отельн')) {
            return this.makeBlankAssessment('Плоская форма средней площади', 'Отельный уже не такой миниатюрный, как ключ или тэг, но все еще остается хорошим кандидатом для 4 гнезд и больших тиражей.', 'flat', 4, 4, 60, '4', 'Хороший референс для форм, которые уже побольше, но еще очень живые для ТПА.', 'good');
        }

        if (lower.includes('прямоуголь')) {
            return this.makeBlankAssessment('Плоская базовая геометрия', 'Прямоугольник это почти идеальный учебный кейс для клиента: простая геометрия, понятная масса и ясная логика по гнездности.', 'flat', 4, 5, 60, '4–5', 'Один из самых наглядных примеров, где ТПА раскрывается.', 'good');
        }

        if (lower.includes('квадрат')) {
            return this.makeBlankAssessment('Плоская легкая форма', 'Квадрат тоже хорошо работает как референс: вес небольшой, форма читаемая, гнездность можно поднимать.', 'flat', 4, 6, 60, '4–6', 'Простой способ показать клиенту силу ТПА на плоских изделиях.', 'good');
        }

        if (lower.includes('круг')) {
            return this.makeBlankAssessment('Плоская компактная форма', 'Круг прекрасно объясняет механику ТПА: маленький вес, аккуратный контур и хороший шанс на 4–6 гнезд.', 'flat', 4, 6, 60, '4–6', 'Хороший учебный пример для клиента.', 'good');
        }

        if (lower.includes('сердц')) {
            return this.makeBlankAssessment('Плоская, но уже декоративная', 'Сердце показывает, что даже неидеально квадратная форма может отлично жить на ТПА, если она тонкая и легкая.', 'flat', 4, 6, 60, '4–6', 'Показывает клиенту, что важна не только форма контура, а именно толщина и вес.', 'good');
        }

        if (lower.includes('треуголь')) {
            return this.makeBlankAssessment('Плоская очень легкая форма', 'Треугольник при таком весе отлично объясняет, зачем нужна гнездность: легкая деталь быстро превращает ТПА в серийную машину.', 'flat', 4, 6, 60, '4–6', 'Очень наглядный ТПА-кандидат.', 'good');
        }

        if (lower.includes('конверт')) {
            return this.makeBlankAssessment('Плоская, но уже крупная по площади', 'Конверт полезен как промежуточный референс: форма все еще плоская, но площадь детали уже начинает съедать комфорт по компоновке.', 'flat', 2, 4, 55, '2–4', 'Хорошо показывает клиенту, что площадь детали тоже влияет на экономику ТПА.', 'transition');
        }

        if ((lower.includes('цветок') && lower.includes('бланк')) || lower.includes('цветоч')) {
            return this.makeBlankAssessment('Плоская форма со сложным контуром', 'Контур сложнее прямоугольника, но если деталь тонкая и легкая, ТПА все еще остается рабочим сценарием.', 'flat', 4, 4, 55, '4', 'Полезный переходный пример между простым бланком и декоративной фигуркой.', 'transition');
        }

        if (lower.includes('шар')) {
            return this.makeBlankAssessment('Округлая объемная деталь', 'Шаром удобно объяснять границу: деталь уже не плоская, остывание сложнее, а значит ТПА становится куда капризнее.', 'ribbed', 2, 2, 45, '2', 'Переходная зона между понятным плоским бланком и спорной объемной формой.', 'transition');
        }

        if (lower.includes('маленьк') || lower.includes('снежин') || lower.includes('елоч') || lower.includes('цветоч') || lower.includes('сердеч')) {
            return this.makeBlankAssessment('Мелкая декоративная форма', 'Небольшие фигурки можно использовать как хороший аргумент в пользу ТПА, если они остаются легкими и не становятся толстыми.', 'small', 4, 6, 55, '4–6', 'Хороший пример для небольших декоративных тиражей.', 'good');
        }

        if (weight > 0 && weight <= 4) {
            return this.makeBlankAssessment('Очень легкая деталь', 'При таком весе клиенту обычно легко показать, почему на длинном тираже ТПА начинает выигрывать по штуке.', 'flat', 4, 6, 60, '4–6', 'Вес уже говорит в пользу ТПА.', 'good');
        }

        if (weight > 0 && weight <= 7) {
            return this.makeBlankAssessment('Легкая плоская деталь', 'По массе это еще комфортная территория для XPM-17, особенно если форма не толстая и без вставок.', 'flat', 4, 5, 60, '4–5', 'Нормальный пример для объяснения перехода в ТПА.', 'good');
        }

        if (weight > 0 && weight <= 12) {
            return this.makeBlankAssessment('Уже ощутимая по массе форма', 'Это еще не “нет”, но клиенту уже нужно объяснять, что выигрыш ТПА придет только на нормальном тираже и без лишней толщины.', 'flat', 2, 4, 50, '2–4', 'Переходный сценарий.', 'transition');
        }

        return this.makeBlankAssessment('Форма тяжелее среднего', 'Если форма не маленькая и уже тяжелая, XPM-17 быстро теряет свои преимущества. Тут проще продавать инжектор или другой станок.', 'thick', 1, 2, 40, '1–2', 'Удобный пример, почему не все стоит вести в ТПА.', 'bad');
    },

    makeBlankAssessment(title, shortWhy, geometry, minCavities, maxCavities, openingsPerHour, cavitiesLabel, note, technicalKey = '') {
        const autoTechnical = this.getTechnicalAssessment({ geometry, cavities: minCavities, weight: 0 });
        const technical = technicalKey
            ? {
                ...autoTechnical,
                key: technicalKey,
                reason: shortWhy,
            }
            : autoTechnical;
        return {
            title,
            shortWhy,
            geometry,
            recommendedCavities: minCavities,
            openingsPerHour,
            cavitiesLabel,
            shortNote: note,
            technical,
        };
    },

    roundTo5(value) {
        return Math.round((Number(value) || 0) / 5) * 5;
    },

    formatQty(value) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0));
    },

    formatHours(value) {
        const numeric = round2(Number(value || 0));
        return `${numeric.toLocaleString('ru-RU')} ч`;
    },

    escape(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    escapeAttr(value) {
        return this.escape(value);
    },
};
