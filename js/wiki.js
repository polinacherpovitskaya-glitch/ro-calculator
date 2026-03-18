const Wiki = {
    state: null,
    selectedSectionId: 'all',
    selectedArticleId: null,
    searchQuery: '',
    importOpen: false,
    editMode: false,
    SOURCE_URL: 'https://recycle-object.notion.site/775cbbbf4d224ea0ad565ea90feb9d3b?v=79ea9890039443acadb90e43a5cfae70&pvs=73',
    SOURCE_BASE_URL: 'https://recycle-object.notion.site',

    async load() {
        const root = document.getElementById('wiki-root');
        if (!root) return;
        if (!this.state) {
            const raw = await loadWikiState();
            this.state = this._normalizeState(raw);
            const migration = this._mergeImportedNotionMap(this.state, !raw);
            if (migration.changed) {
                this.state = migration.state;
            }
            if (!raw || migration.changed) {
                await saveWikiState(this.state);
            }
        }
        if (!this.selectedArticleId) {
            const first = this._getVisibleArticles()[0] || this.state.articles[0] || null;
            this.selectedArticleId = first ? first.id : null;
        }
        this.render();
    },

    _clone(value) {
        return JSON.parse(JSON.stringify(value));
    },

    _uid(prefix) {
        return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    },

    _esc(value) {
        return App && App.escHtml ? App.escHtml(value) : String(value || '');
    },

    _nowIso() {
        return new Date().toISOString();
    },

    _currentAuthor() {
        return (App && App.getCurrentEmployeeName && App.getCurrentEmployeeName()) || 'Система';
    },

    _defaultState() {
        const now = this._nowIso();
        const sections = [
            { id: 'quick-start', title: 'Быстрый старт', description: 'Как пользоваться внутренней базой знаний и как переносить материалы из Notion.', sort_index: 10 },
            { id: 'company-core', title: 'Компания и старт', description: 'Что такое RO, базовый онбординг и общая картина процессов.', sort_index: 20 },
            { id: 'sales-clients', title: 'Продажи, клиенты и CRM', description: 'Маркетплейсы, интернет-магазин, ведение проекта, коммуникация и amoCRM.', sort_index: 30 },
            { id: 'production-ops', title: 'Производство и операции', description: 'Производство, калькуляторы, инвентаризация, гайды и производственные FAQ.', sort_index: 40 },
            { id: 'finance-docs', title: 'Финансы и документы', description: 'ФинТабло, оплаты, документы и финансовые справки.', sort_index: 50 },
            { id: 'china-purchasing', title: 'Китай и закупки', description: 'Крипта, переводы, Alipay и закупки в Китае.', sort_index: 60 },
            { id: 'people-hr', title: 'Команда и HR', description: 'Отпуска, вакансии, телефоны, дни рождения и внутренние HR-материалы.', sort_index: 70 },
            { id: 'tools-access', title: 'Инструменты и доступы', description: 'Пароли, скрипты, бот и служебные внутренние инструменты.', sort_index: 80 },
            { id: 'content-brand', title: 'Контент и визуал', description: 'Фото, иллюстрации и материалы для визуального контента.', sort_index: 90 },
            { id: 'drafts', title: 'Черновики переноса', description: 'Временное место для сырого текста из Notion перед разбором.', sort_index: 100 },
        ];
        const articles = [
            {
                id: 'wiki_start',
                section_id: 'quick-start',
                title: 'Как пользоваться внутренней базой знаний',
                summary: 'Короткая инструкция: как искать, редактировать и дополнять статьи прямо в системе.',
                body: [
                    '1. Слева выбирайте раздел, чтобы сузить тему.',
                    '2. Сверху используйте поиск по словам, тегам и тексту статьи.',
                    '3. Справа открывайте статью и редактируйте заголовок, краткое описание, теги и основной текст.',
                    '4. Для переноса из Notion используйте кнопку «Импорт текста» и сначала складывайте сырой текст в раздел «Черновики переноса».',
                    '5. Если текст уже размечен заголовками, используйте «Разбить по # заголовкам».',
                    '6. Потом разбирайте черновик на отдельные понятные статьи по разделам.',
                ].join('\n'),
                tags: ['wiki', 'поиск', 'редактирование'],
                sort_index: 10,
                updated_at: now,
                updated_by: 'Система',
            },
            {
                id: 'wiki_notion_sync',
                section_id: 'quick-start',
                title: 'Как перенести публичный Notion в систему',
                summary: 'Скелет разделов и карточек из домашней страницы Notion уже импортирован. Дальше можно дополнять статьи постепенно.',
                body: [
                    'Что уже сделано:',
                    '',
                    `- Источник: ${this.SOURCE_URL}`,
                    '- Разделы и карточки верхнего уровня перенесены в Базу знаний.',
                    '- У каждой импортированной статьи есть ссылка на исходную страницу Notion.',
                    '- Теперь можно спокойно разносить внутрь регламенты, чеклисты, контакты и ссылки без хаоса.',
                ].join('\n'),
                tags: ['notion', 'перенос', 'структура'],
                sort_index: 20,
                updated_at: now,
                updated_by: 'Система',
            },
            {
                id: 'notion_migration_draft',
                section_id: 'drafts',
                title: 'Черновик переноса из Notion',
                summary: 'Сюда удобно складывать сырой текст из внешней базы знаний перед разбором.',
                body: [
                    'Источник: ' + this.SOURCE_URL,
                    '',
                    'Сама Notion-страница сейчас требует логин в workspace, поэтому автоперенос без доступа невозможен.',
                    'Используйте кнопку «Импорт текста», чтобы вставлять блоки из Notion сюда и потом раскладывать их по нормальным разделам.',
                ].join('\n'),
                tags: ['notion', 'перенос', 'черновик'],
                sort_index: 10,
                updated_at: now,
                updated_by: 'Система',
            },
        ];
        return {
            version: 1,
            source_url: this.SOURCE_URL,
            updated_at: now,
            updated_by: 'Система',
            sections,
            articles,
        };
    },

    _getPublicNotionSiteMap() {
        return [
            {
                id: 'company_core',
                section_id: 'company-core',
                title: 'Компания и старт',
                description: 'Что такое RO, базовый онбординг и общая картина процессов.',
                links: [
                    ['🧩 О Recycle Object', '/Recycle-Object-c6357e76fd7d4c049879064c575e7016?pvs=25'],
                ],
            },
            {
                id: 'sales_clients',
                section_id: 'sales-clients',
                title: 'Продажи, клиенты и CRM',
                description: 'Маркетплейсы, интернет-магазин, ведение проекта, коммуникация и amoCRM.',
                links: [
                    ['💻 Работа с ИМ и МП', '/4bfa8b46ec004d6f8d60dc3058550ebf?pvs=25'],
                    ['🛒 Маркетплейсы', '/a3ab7ed0995d43e1bc3a03495f81cf95?pvs=25'],
                    ['🤪 Ведение проекта', '/2093e666a1eb803c9155d1ba912ef87c?pvs=25'],
                    ['📊 Работа в amoCRM', '/amoCRM-1f53e666a1eb80f79fc7f3152e8cd00a?pvs=25'],
                    ['🤑 Инструкция по заполнению Юнит-экономики', '/2023e666a1eb80dc86f7cc262c2a287c?pvs=25'],
                    ['💬 Скрипт для общения с клиентом', '/21f3e666a1eb80759f85db7cd585785f?pvs=25'],
                    ['☎️ Список контактов клиентов', '/0473cddc59e449d2bc492f5fa49fcc26?pvs=25'],
                    ['🏛️ Музеи', '/8c4a1ff29dd84161a3ba3fc352ac7a69?pvs=25'],
                ],
            },
            {
                id: 'production_ops',
                section_id: 'production-ops',
                title: 'Производство и операции',
                description: 'Производство, калькуляторы, инвентаризация, гайды и производственные FAQ.',
                links: [
                    ['🔧 Производство (общая инфа, полезные ссылки, контакты поставщиков и подрядчиков)', '/adff3c8f7cb441d7a62b66a58261da4b?pvs=25'],
                    ['🧮 Калькуляторы, прайсы, инвентаризация', '/1ad3e666a1eb80f8b40fe38ba0e91562?pvs=25'],
                    ['ℹ️ Гайды', '/b8350468caa0486c9b3bf989584aba81?pvs=25'],
                    ['❓ FAQ Изделия из АБС', '/FAQ-79128817511a455bb679912863573f0c?pvs=25'],
                    ['❓ FAQ Литье', '/FAQ-be9a41c4df214c009ab824946881f1de?pvs=25'],
                    ['❓ FAQ Дмитров', '/FAQ-5b0dce1bde9a4f5dbd40a05aaa82ee93?pvs=25'],
                ],
            },
            {
                id: 'finance_docs',
                section_id: 'finance-docs',
                title: 'Финансы и документы',
                description: 'ФинТабло, оплаты, документы и финансовые справки.',
                links: [
                    ['💸 Финансы: Финтабло и Точка', '/5cca97efb6fc4bd5970865075681132e?pvs=25'],
                    ['📄 Документы Полина', '/b10f6528052d406285451e53211ddb5f?pvs=25'],
                    ['📄 Документы Никита', '/ce00a9838a09431a92bfc71cb6ee296b?pvs=25'],
                    ['💵 Оплата', '/dfe635b5a8124df0b0e735f05ef46b50?pvs=25'],
                ],
            },
            {
                id: 'china_purchasing',
                section_id: 'china-purchasing',
                title: 'Китай и закупки',
                description: 'Крипта, переводы, Alipay и закупки в Китае.',
                links: [
                    ['🤑 Покупка криптовалюты в BINACE', '/BINACE-1e3a5d5294ad408da2c5003347afbc10?pvs=25'],
                    ['💸 Перевод криптовалюты c BINANCE в BYBIT', '/c-BINANCE-BYBIT-87e3238910cd45358777a0eeb7ff6522?pvs=25'],
                    ['💱 Перевод с BYBIT на ALIPAY', '/BYBIT-ALIPAY-c80bf40bbd5c4321ad8c36395787b27d?pvs=25'],
                    ['🈲 Alipay', '/Alipay-0be4f1a8c9ae443aa9ceb83486ccade6?pvs=25'],
                    ['🧰 Закупки в Китае', '/22c3e666a1eb807bb68aece6bf52ca20?pvs=25'],
                ],
            },
            {
                id: 'people_hr',
                section_id: 'people-hr',
                title: 'Команда и HR',
                description: 'Отпуска, вакансии, телефоны, дни рождения и внутренние HR-материалы.',
                links: [
                    ['🏖️ Отпуск и больничный', '/125dff96d7444a9f82ba598515af1e6b?pvs=25'],
                    ['📞 Телефоны сотрудников', '/3f7cdf24579849248ff0a4a45f856756?pvs=25'],
                    ['🎂 Дни рождения', '/73b14634d6cd463b82aa3d3266b2084c?pvs=25'],
                    ['🏗️ Актуальные вакансии в RO', '/RO-1e03e666a1eb80009138eb52bb6db7d3?pvs=25'],
                ],
            },
            {
                id: 'tools_access',
                section_id: 'tools-access',
                title: 'Инструменты и доступы',
                description: 'Пароли, скрипты, бот и служебные внутренние инструменты.',
                links: [
                    ['🤖 Бот RO', '/RO-ae30db333237459ebc779fe5e69482a9?pvs=25'],
                    ['🔐 Пароли', '/ef027345e13f4bc8a33af6f82cb765bf?pvs=25'],
                    ['💌 Скрипты', '/94034de2740c474b8cd1cc579f85b401?pvs=25'],
                ],
            },
            {
                id: 'content_brand',
                section_id: 'content-brand',
                title: 'Контент и визуал',
                description: 'Фото, иллюстрации и материалы для визуального контента.',
                links: [
                    ['📸 Ссылки на фото', '/f84c01568654450bb55d3ce0731eae01?pvs=25'],
                    ['ТЗ для иллюстратора', '/1e33e666a1eb8060a0a1e57a71d7538f?pvs=25'],
                ],
            },
        ];
    },

    _stripEmoji(value) {
        return String(value || '')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    _slug(value) {
        return this._stripEmoji(value)
            .toLowerCase()
            .replace(/[^a-zа-яё0-9]+/giu, '_')
            .replace(/^_+|_+$/g, '') || 'item';
    },

    _buildNotionUrl(path) {
        if (!path) return this.SOURCE_URL;
        if (/^https?:\/\//i.test(path)) return path;
        return `${this.SOURCE_BASE_URL}${path}`;
    },

    _buildImportedArticle(sectionConfig, linkTitle, href, index) {
        const cleanTitle = this._stripEmoji(linkTitle);
        const sourceUrl = this._buildNotionUrl(href);
        const now = this._nowIso();
        return {
            id: `notion_article_${sectionConfig.id}_${this._slug(cleanTitle)}`,
            section_id: sectionConfig.section_id,
            title: cleanTitle,
            summary: `Импортировано из публичной карты Notion. Откройте источник и перенесите сюда нормальную структурированную инструкцию.`,
            body: [
                `# ${cleanTitle}`,
                '',
                'Импортировано из публичной wiki Notion как стартовая карточка.',
                '',
                '## Источник',
                sourceUrl,
                '',
                '## Что стоит перенести сюда',
                '- пошаговый процесс',
                '- важные ссылки и доступы',
                '- частые ошибки и проверки',
                '- ответственных и обновления',
            ].join('\n'),
            tags: ['notion', 'импорт', this._slug(sectionConfig.title)],
            sort_index: (index + 1) * 10,
            updated_at: now,
            updated_by: 'Система',
            source_url: sourceUrl,
        };
    },

    _isStarterState(state) {
        const starterSectionIds = ['quick-start', 'company-core', 'sales-clients', 'production-ops', 'finance-docs', 'china-purchasing', 'people-hr', 'tools-access', 'content-brand', 'drafts'];
        const currentSectionIds = (state.sections || []).map(section => section.id).sort();
        const starterArticles = ['wiki_start', 'wiki_notion_sync', 'notion_migration_draft'];
        const currentArticleIds = (state.articles || []).map(article => article.id);
        return starterSectionIds.every(id => currentSectionIds.includes(id))
            && starterArticles.every(id => currentArticleIds.includes(id))
            && !currentArticleIds.some(id => String(id).startsWith('notion_article_'));
    },

    _mergeImportedNotionMap(state, forceReplace = false) {
        const next = this._clone(state);
        const notionMap = this._getPublicNotionSiteMap();
        let changed = false;
        const shouldReplaceStarter = forceReplace || this._isStarterState(next);

        if (shouldReplaceStarter) {
            const keepArticles = (next.articles || []).filter(article => ['wiki_start', 'wiki_notion_sync', 'notion_migration_draft'].includes(article.id));
            next.sections = this._defaultState().sections;
            next.articles = keepArticles;
            changed = true;
        }

        const sectionIds = new Set((next.sections || []).map(section => section.id));
        notionMap.forEach((sectionConfig, sectionIndex) => {
            if (!sectionIds.has(sectionConfig.section_id)) {
                next.sections.push({
                    id: sectionConfig.section_id,
                    title: sectionConfig.title,
                    description: sectionConfig.description,
                    sort_index: 20 + (sectionIndex * 10),
                });
                sectionIds.add(sectionConfig.section_id);
                changed = true;
            }
        });

        const articleIds = new Set((next.articles || []).map(article => article.id));
        notionMap.forEach(sectionConfig => {
            sectionConfig.links.forEach((linkEntry, index) => {
                const [title, href] = linkEntry;
                const article = this._buildImportedArticle(sectionConfig, title, href, index);
                if (!articleIds.has(article.id)) {
                    next.articles.push(article);
                    articleIds.add(article.id);
                    changed = true;
                }
            });
        });

        if (changed) {
            next.source_url = this.SOURCE_URL;
            next.articles.sort((a, b) => {
                if (a.section_id !== b.section_id) return String(a.section_id).localeCompare(String(b.section_id), 'ru');
                return (Number(a.sort_index) - Number(b.sort_index)) || String(a.title).localeCompare(String(b.title), 'ru');
            });
            next.sections.sort((a, b) => (Number(a.sort_index) - Number(b.sort_index)) || String(a.title).localeCompare(String(b.title), 'ru'));
        }

        return { state: next, changed };
    },

    _normalizeState(raw) {
        const base = raw && typeof raw === 'object' ? this._clone(raw) : this._defaultState();
        const state = {
            version: Number(base.version) || 1,
            source_url: base.source_url || this.SOURCE_URL,
            updated_at: base.updated_at || this._nowIso(),
            updated_by: base.updated_by || 'Система',
            sections: Array.isArray(base.sections) ? base.sections : [],
            articles: Array.isArray(base.articles) ? base.articles : [],
        };

        if (!state.sections.length) {
            const fallback = this._defaultState();
            state.sections = fallback.sections;
            if (!state.articles.length) state.articles = fallback.articles;
        }

        state.sections = state.sections
            .map((section, index) => ({
                id: section.id || this._uid('section'),
                title: section.title || `Раздел ${index + 1}`,
                description: section.description || '',
                sort_index: Number(section.sort_index) || ((index + 1) * 10),
            }))
            .sort((a, b) => (a.sort_index - b.sort_index) || String(a.title).localeCompare(String(b.title), 'ru'));

        const validSectionIds = new Set(state.sections.map(section => section.id));
        const fallbackSectionId = state.sections[0] ? state.sections[0].id : 'drafts';
        const legacySectionAliases = {
            'orders-sales': 'sales-clients',
            production: 'production-ops',
            warehouse: 'production-ops',
            finance: 'finance-docs',
            reference: 'tools-access',
            'notion_home_onboarding': 'sales-clients',
            'notion_home_general': 'finance-docs',
            'notion_home_china': 'china-purchasing',
            'notion_home_wholesale': 'sales-clients',
            'notion_home_faq': 'production-ops',
            'notion_home_hiring': 'people-hr',
            'notion_home_illustration': 'content-brand',
        };
        state.articles = state.articles
            .map((article, index) => ({
                id: article.id || this._uid('article'),
                section_id: validSectionIds.has(article.section_id)
                    ? article.section_id
                    : (validSectionIds.has(legacySectionAliases[article.section_id]) ? legacySectionAliases[article.section_id] : fallbackSectionId),
                title: article.title || `Статья ${index + 1}`,
                summary: article.summary || '',
                body: article.body || '',
                source_url: article.source_url || '',
                tags: Array.isArray(article.tags)
                    ? article.tags.map(tag => String(tag || '').trim()).filter(Boolean)
                    : String(article.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
                sort_index: Number(article.sort_index) || ((index + 1) * 10),
                updated_at: article.updated_at || state.updated_at || this._nowIso(),
                updated_by: article.updated_by || state.updated_by || 'Система',
            }))
            .sort((a, b) => {
                if (a.section_id !== b.section_id) return String(a.section_id).localeCompare(String(b.section_id));
                return (a.sort_index - b.sort_index) || String(a.title).localeCompare(String(b.title), 'ru');
            });

        return state;
    },

    _getSection(sectionId) {
        return (this.state.sections || []).find(section => section.id === sectionId) || null;
    },

    _getArticle(articleId) {
        return (this.state.articles || []).find(article => article.id === articleId) || null;
    },

    _getSectionCounts() {
        const counts = new Map();
        (this.state.articles || []).forEach(article => {
            counts.set(article.section_id, (counts.get(article.section_id) || 0) + 1);
        });
        return counts;
    },

    _matchesSearch(article) {
        if (!this.searchQuery) return true;
        const haystack = [
            article.title,
            article.summary,
            article.body,
            (article.tags || []).join(' '),
            (this._getSection(article.section_id) || {}).title || '',
        ].join(' ').toLowerCase();
        return haystack.includes(this.searchQuery.toLowerCase());
    },

    _getVisibleArticles() {
        const selectedSectionId = this.selectedSectionId;
        return (this.state.articles || []).filter(article => {
            if (selectedSectionId !== 'all' && article.section_id !== selectedSectionId) return false;
            return this._matchesSearch(article);
        });
    },

    _excerpt(text, max = 180) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim();
        if (clean.length <= max) return clean;
        return `${clean.slice(0, max).trim()}…`;
    },

    _renderBodyPreview(text) {
        const lines = String(text || '').replace(/\r/g, '').split('\n');
        const html = [];
        let listType = '';
        let listItems = [];
        const flushList = () => {
            if (!listItems.length) return;
            const tag = listType === 'ol' ? 'ol' : 'ul';
            html.push(`<${tag}>${listItems.join('')}</${tag}>`);
            listItems = [];
            listType = '';
        };

        lines.forEach(rawLine => {
            const line = String(rawLine || '').trim();
            if (!line) {
                flushList();
                return;
            }

            const heading1 = line.match(/^#\s+(.+)$/);
            const heading2 = line.match(/^##\s+(.+)$/);
            const ordered = line.match(/^\d+[.)]\s+(.+)$/);
            const bullet = line.match(/^[-*•]\s+(.+)$/);

            if (heading1) {
                flushList();
                html.push(`<h3>${this._esc(heading1[1])}</h3>`);
                return;
            }
            if (heading2) {
                flushList();
                html.push(`<h4>${this._esc(heading2[1])}</h4>`);
                return;
            }
            if (ordered) {
                if (listType && listType !== 'ol') flushList();
                listType = 'ol';
                listItems.push(`<li>${this._esc(ordered[1])}</li>`);
                return;
            }
            if (bullet) {
                if (listType && listType !== 'ul') flushList();
                listType = 'ul';
                listItems.push(`<li>${this._esc(bullet[1])}</li>`);
                return;
            }

            flushList();
            html.push(`<p>${this._esc(line)}</p>`);
        });
        flushList();
        return html.join('') || '<p>Пока пусто. Здесь появится читаемый предпросмотр статьи.</p>';
    },

    _getEditorDraft(article = null) {
        const fallback = article || this._getArticle(this.selectedArticleId) || {};
        const titleInput = document.getElementById('wiki-article-title');
        const sectionSelect = document.getElementById('wiki-article-section');
        const summaryInput = document.getElementById('wiki-article-summary');
        const tagsInput = document.getElementById('wiki-article-tags');
        const bodyInput = document.getElementById('wiki-article-body');
        const tags = String(tagsInput ? tagsInput.value : ((fallback.tags || []).join(', ')))
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);
        return {
            title: String(titleInput ? titleInput.value : (fallback.title || '')).trim(),
            section_id: String(sectionSelect ? sectionSelect.value : (fallback.section_id || '')).trim(),
            summary: String(summaryInput ? summaryInput.value : (fallback.summary || '')).trim(),
            tags,
            body: String(bodyInput ? bodyInput.value : (fallback.body || '')).trim(),
        };
    },

    _renderPreviewCard(draft) {
        const section = this._getSection(draft.section_id);
        return `
            <div class="wiki-preview-header">Предпросмотр</div>
            <div class="wiki-preview-meta">
                <span class="wiki-article-section" id="wiki-preview-section">${this._esc((section && section.title) || 'Без раздела')}</span>
                <span class="wiki-preview-meta-note">Как статья будет выглядеть после сохранения</span>
            </div>
            <div class="wiki-preview-title" id="wiki-preview-title">${this._esc(draft.title || 'Новая статья')}</div>
            <div class="wiki-preview-summary" id="wiki-preview-summary">${this._esc(draft.summary || 'Добавьте короткое описание, чтобы статья лучше находилась через поиск.')}</div>
            <div class="wiki-article-tags wiki-preview-tags" id="wiki-preview-tags">${this._formatTags(draft.tags)}</div>
            <div class="wiki-preview-body" id="wiki-preview-body">${this._renderBodyPreview(draft.body || '')}</div>
        `;
    },

    _splitImportIntoArticles(rawTitle, rawBody, sectionId) {
        const titlePrefix = String(rawTitle || '').trim();
        const body = String(rawBody || '').replace(/\r/g, '');
        const matches = [...body.matchAll(/^#{1,2}\s+(.+)$/gm)];
        if (!matches.length) return [];

        const segments = matches.map((match, index) => {
            const heading = String(match[1] || '').trim();
            const start = match.index + match[0].length;
            const end = index < matches.length - 1 ? matches[index + 1].index : body.length;
            const content = body.slice(start, end).trim();
            return {
                title: titlePrefix ? `${titlePrefix} — ${heading}` : heading,
                body: content,
                section_id: sectionId,
            };
        }).filter(segment => segment.title && segment.body);

        return segments.map((segment, index) => ({
            id: this._uid('article'),
            section_id: segment.section_id || this._ensureDraftsSection(),
            title: segment.title,
            summary: this._excerpt(segment.body, 160),
            body: segment.body,
            tags: ['notion', 'импорт'],
            sort_index: ((this.state.articles || []).reduce((acc, item) => Math.max(acc, Number(item.sort_index) || 0), 0) || 0) + ((index + 1) * 10),
            updated_at: this._nowIso(),
            updated_by: this._currentAuthor(),
        }));
    },

    _formatTags(tags) {
        return (tags || []).map(tag => `<span class="wiki-tag">#${this._esc(tag)}</span>`).join('');
    },

    _syncSelectedArticle() {
        const visible = this._getVisibleArticles();
        if (this.selectedArticleId && visible.some(article => article.id === this.selectedArticleId)) return;
        this.selectedArticleId = visible[0] ? visible[0].id : ((this.state.articles || [])[0] || {}).id || null;
        const selectedArticle = this._getArticle(this.selectedArticleId);
        if (selectedArticle) this.selectedSectionId = selectedArticle.section_id;
    },

    render() {
        const root = document.getElementById('wiki-root');
        if (!root || !this.state) return;
        this._syncSelectedArticle();
        const selectedArticle = this._getArticle(this.selectedArticleId);
        const visibleArticles = this._getVisibleArticles();
        const counts = this._getSectionCounts();
        const selectedSection = this.selectedSectionId === 'all' ? null : this._getSection(this.selectedSectionId);

        root.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>База знаний</h1>
                    <div class="wiki-page-subtitle">Внутренняя wiki в более понятной структуре: ищем по процессам, читаем как документ, дополняем как в рабочем блокноте, а не как в хаосе из карточек.</div>
                </div>
                <div class="flex gap-8" style="flex-wrap:wrap;">
                    <button class="btn btn-outline" onclick="Wiki.toggleImportPanel()">${this.importOpen ? 'Скрыть импорт' : 'Импорт текста'}</button>
                    <button class="btn btn-outline" onclick="Wiki.exportJson()">Экспорт JSON</button>
                    <button class="btn btn-primary" onclick="Wiki.createArticle()">+ Статья</button>
                </div>
            </div>

            <div class="wiki-shell">
                <aside class="wiki-nav-panel">
                    <div class="wiki-nav-top">
                        <div class="wiki-source-title">Навигация по процессам</div>
                        <div class="wiki-source-note">Слева дерево как в Notion, но разделы уже пересобраны по смыслу, а не по старой мешанине.</div>
                        <div class="wiki-toolbar-search">
                            <input type="text" id="wiki-search-input" placeholder="Поиск по статьям, тегам и тексту" value="${this._esc(this.searchQuery)}" oninput="Wiki.setSearch(this.value)">
                        </div>
                        <div class="wiki-toolbar-meta">
                            <span class="wiki-meta-pill">${visibleArticles.length} найдено</span>
                            <span class="wiki-meta-pill">${this.state.sections.length} разделов</span>
                        </div>
                    </div>
                    <div class="wiki-nav-tree">
                        <button class="wiki-nav-home ${this.selectedSectionId === 'all' ? 'active' : ''}" onclick="Wiki.selectSection('all')">
                            <span>Все материалы</span>
                            <span class="wiki-section-count">${visibleArticles.length}</span>
                        </button>
                        ${this.state.sections.map(section => this._renderSectionTree(section, counts)).join('')}
                    </div>
                </aside>

                <section class="wiki-document-panel">
                    <div class="wiki-document-topbar">
                        <div>
                            <div class="wiki-breadcrumbs">
                                <span>База знаний</span>
                                ${selectedSection ? `<span>/</span><span>${this._esc(selectedSection.title)}</span>` : ''}
                                ${selectedArticle ? `<span>/</span><span>${this._esc(selectedArticle.title)}</span>` : ''}
                            </div>
                            <div class="wiki-list-subtitle">${this._esc(selectedSection ? (selectedSection.description || 'Раздел без описания') : 'Внутренняя база знаний по процессам Recycle Object')}</div>
                        </div>
                        <div class="flex gap-8" style="flex-wrap:wrap;">
                            <a class="btn btn-outline btn-sm" href="${this._esc(this.state.source_url || this.SOURCE_URL)}" target="_blank" rel="noopener noreferrer">Открыть Notion</a>
                            ${selectedArticle && !this.editMode ? '<button class="btn btn-outline btn-sm" onclick="Wiki.toggleEditMode(true)">Редактировать</button>' : ''}
                            ${selectedArticle && this.editMode ? '<button class="btn btn-outline btn-sm" onclick="Wiki.toggleEditMode(false)">Закрыть редактирование</button>' : ''}
                        </div>
                    </div>

                    <div id="wiki-import-panel" class="wiki-inline-panel" style="${this.importOpen ? '' : 'display:none;'}">
                        <div class="card-header">
                            <h3>Импорт черновика из Notion</h3>
                            <button class="btn btn-sm btn-outline" onclick="Wiki.toggleImportPanel()">Закрыть</button>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Название статьи</label>
                                <input type="text" id="wiki-import-title" placeholder="Например: Регламент по складу">
                            </div>
                            <div class="form-group">
                                <label>Раздел</label>
                                <select id="wiki-import-section">
                                    ${this._renderSectionOptions('drafts')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Текст для переноса</label>
                            <textarea id="wiki-import-body" rows="10" placeholder="Вставьте сюда сырой текст из Notion. Потом его можно спокойно отредактировать и разложить по разделам."></textarea>
                        </div>
                        <div class="flex gap-8">
                            <button class="btn btn-success" onclick="Wiki.applyImportText(false)">Добавить как одну статью</button>
                            <button class="btn btn-outline" onclick="Wiki.applyImportText(true)">Разбить по # заголовкам</button>
                        </div>
                    </div>

                    ${selectedArticle ? (this.editMode ? this._renderEditor(selectedArticle) : this._renderArticleView(selectedArticle)) : this._renderSectionOverview(selectedSection, visibleArticles)}
                </section>
            </div>
        `;
    },

    _renderSectionTree(section, counts) {
        const sectionArticles = (this.state.articles || []).filter(article => article.section_id === section.id && this._matchesSearch(article));
        if (!sectionArticles.length && this.searchQuery) return '';
        return `
            <div class="wiki-tree-section ${this.selectedSectionId === section.id ? 'active' : ''}">
                <button class="wiki-tree-section-button" onclick="Wiki.selectSection('${this._esc(section.id)}')">
                    <div>
                        <div class="wiki-tree-section-title">${this._esc(section.title)}</div>
                        <div class="wiki-tree-section-desc">${this._esc(section.description || '')}</div>
                    </div>
                    <span class="wiki-section-count">${sectionArticles.length || counts.get(section.id) || 0}</span>
                </button>
                <div class="wiki-tree-pages">
                    ${sectionArticles.map(article => `
                        <button class="wiki-tree-page ${article.id === this.selectedArticleId ? 'active' : ''}" onclick="Wiki.selectArticle('${this._esc(article.id)}')">
                            <span class="wiki-tree-page-title">${this._esc(article.title)}</span>
                        </button>
                    `).join('') || '<div class="wiki-tree-empty">Нет статей в этом фильтре</div>'}
                </div>
            </div>
        `;
    },

    _renderSectionOptions(selectedId) {
        return (this.state.sections || []).map(section => `
            <option value="${this._esc(section.id)}" ${section.id === selectedId ? 'selected' : ''}>${this._esc(section.title)}</option>
        `).join('');
    },

    _renderArticleCard(article) {
        const section = this._getSection(article.section_id);
        return `
            <button class="wiki-article-card ${article.id === this.selectedArticleId ? 'active' : ''}" onclick="Wiki.selectArticle('${this._esc(article.id)}')">
                <div class="wiki-article-card-top">
                    <span class="wiki-article-section">${this._esc((section && section.title) || 'Без раздела')}</span>
                    <span class="wiki-article-date">${this._esc(App.formatDate ? App.formatDate(article.updated_at) : article.updated_at)}</span>
                </div>
                <div class="wiki-article-title">${this._esc(article.title)}</div>
                <div class="wiki-article-summary">${this._esc(article.summary || this._excerpt(article.body, 130) || 'Без краткого описания')}</div>
                <div class="wiki-article-tags">${this._formatTags(article.tags)}</div>
            </button>
        `;
    },

    _renderSectionOverview(section, visibleArticles) {
        return `
            <div class="wiki-document">
                <div class="wiki-document-meta">
                    <span class="wiki-article-section">${this._esc(section ? section.title : 'Все материалы')}</span>
                    <span class="wiki-preview-meta-note">${visibleArticles.length} материалов в текущем фильтре</span>
                </div>
                <h2 class="wiki-document-title">${this._esc(section ? section.title : 'База знаний')}</h2>
                <div class="wiki-document-summary">${this._esc(section ? (section.description || 'Раздел без описания') : 'Выберите статью слева, чтобы открыть ее как обычную страницу, почти как в Notion.')}</div>
                <div class="wiki-document-index">
                    ${visibleArticles.map(article => `
                        <button class="wiki-document-index-item" onclick="Wiki.selectArticle('${this._esc(article.id)}')">
                            <div class="wiki-document-index-title">${this._esc(article.title)}</div>
                            <div class="wiki-document-index-note">${this._esc(article.summary || this._excerpt(article.body, 140))}</div>
                        </button>
                    `).join('') || `
                        <div class="wiki-empty-state">
                            <div class="wiki-empty-title">Ничего не найдено</div>
                            <div class="wiki-empty-note">Попробуйте убрать фильтр или создать новую статью.</div>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    _renderArticleView(article) {
        const section = this._getSection(article.section_id);
        return `
            <div class="wiki-document">
                <div class="wiki-document-meta">
                    <span class="wiki-article-section">${this._esc((section && section.title) || 'Без раздела')}</span>
                    <span class="wiki-preview-meta-note">обновлено ${this._esc(App.formatDate ? App.formatDate(article.updated_at) : article.updated_at)} · ${this._esc(article.updated_by || '—')}</span>
                </div>
                <h2 class="wiki-document-title">${this._esc(article.title)}</h2>
                <div class="wiki-document-summary">${this._esc(article.summary || 'Без краткого описания')}</div>
                <div class="wiki-article-tags wiki-preview-tags">${this._formatTags(article.tags)}</div>
                ${article.source_url ? `
                    <div class="wiki-source-inline">
                        <div>
                            <div class="wiki-source-title">Исходная страница</div>
                            <div class="wiki-source-note">Если нужно свериться с оригиналом, откройте страницу в публичном Notion.</div>
                        </div>
                        <a class="btn btn-outline btn-sm" href="${this._esc(article.source_url)}" target="_blank" rel="noopener noreferrer">Открыть источник</a>
                    </div>
                ` : ''}
                <div class="wiki-document-body">${this._renderBodyPreview(article.body || '')}</div>
            </div>
        `;
    },

    _renderEditor(article) {
        const section = this._getSection(article.section_id);
        const draft = {
            title: article.title || '',
            section_id: section ? section.id : article.section_id,
            summary: article.summary || '',
            tags: article.tags || [],
            body: article.body || '',
        };
        return `
            <div class="wiki-document wiki-document-edit">
                <div class="card-header">
                <div>
                    <h3>Редактирование статьи</h3>
                    <div class="wiki-list-subtitle">Последнее обновление: ${this._esc(App.formatDate ? App.formatDate(article.updated_at) : article.updated_at)} · ${this._esc(article.updated_by || '—')}</div>
                </div>
                <div class="flex gap-8" style="flex-wrap:wrap;">
                    ${article.source_url ? `<a class="btn btn-outline btn-sm" href="${this._esc(article.source_url)}" target="_blank" rel="noopener noreferrer">Источник</a>` : ''}
                    <button class="btn btn-outline btn-sm" onclick="Wiki.duplicateSelectedArticle()">Дубль</button>
                    <button class="btn btn-outline btn-sm" onclick="Wiki.moveSelectedArticle(-10)">↑ Выше</button>
                    <button class="btn btn-outline btn-sm" onclick="Wiki.moveSelectedArticle(10)">↓ Ниже</button>
                    <button class="btn btn-danger btn-sm" onclick="Wiki.deleteSelectedArticle()">Удалить</button>
                </div>
            </div>
            <div class="wiki-editor-stack">
                <div class="form-row">
                    <div class="form-group">
                        <label>Заголовок</label>
                        <input type="text" id="wiki-article-title" value="${this._esc(article.title)}" placeholder="Название статьи" oninput="Wiki.handleEditorInput()">
                    </div>
                    <div class="form-group">
                        <label>Раздел</label>
                        <select id="wiki-article-section" onchange="Wiki.handleEditorInput()">${this._renderSectionOptions(section ? section.id : '')}</select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Кратко</label>
                        <textarea id="wiki-article-summary" rows="3" placeholder="Короткое описание: что здесь можно узнать." oninput="Wiki.handleEditorInput()">${this._esc(article.summary || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Теги</label>
                        <input type="text" id="wiki-article-tags" value="${this._esc((article.tags || []).join(', '))}" placeholder="склад, резерв, логистика" oninput="Wiki.handleEditorInput()">
                        <span class="form-hint">Через запятую. Помогают поиску.</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>Текст статьи</label>
                    <textarea id="wiki-article-body" rows="18" placeholder="Основной текст статьи." oninput="Wiki.handleEditorInput()">${this._esc(article.body || '')}</textarea>
                    <span class="form-hint">Поддерживаются простые заголовки <code>#</code>, <code>##</code>, маркированные и нумерованные списки для предпросмотра.</span>
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-success" onclick="Wiki.saveSelectedArticle()">Сохранить статью</button>
                    <button class="btn btn-outline" onclick="Wiki.toggleEditMode(false)">Отмена</button>
                    <button class="btn btn-outline" onclick="Wiki.createArticle('${this._esc(article.section_id)}')">+ Еще статья в этом разделе</button>
                </div>
                <div class="wiki-preview-card wiki-preview-card-inline">
                    ${this._renderPreviewCard(draft)}
                </div>
            </div>
            </div>
        `;
    },

    setSearch(value) {
        this.searchQuery = String(value || '').trim();
        this.render();
    },

    selectSection(sectionId) {
        this.selectedSectionId = sectionId || 'all';
        this.editMode = false;
        const first = this._getVisibleArticles().find(article => this.selectedSectionId === 'all' || article.section_id === this.selectedSectionId) || null;
        this.selectedArticleId = first ? first.id : null;
        this.render();
    },

    selectArticle(articleId) {
        this.selectedArticleId = articleId || null;
        this.editMode = false;
        const article = this._getArticle(this.selectedArticleId);
        if (article) this.selectedSectionId = article.section_id;
        this.render();
    },

    toggleEditMode(force) {
        this.editMode = typeof force === 'boolean' ? force : !this.editMode;
        this.render();
    },

    async persist() {
        if (!this.state) return;
        this.state.updated_at = this._nowIso();
        this.state.updated_by = this._currentAuthor();
        await saveWikiState(this.state);
    },

    async createSection() {
        const title = prompt('Название нового раздела:');
        if (!title || !title.trim()) return;
        const description = prompt('Короткое описание раздела:') || '';
        const maxSort = (this.state.sections || []).reduce((acc, section) => Math.max(acc, Number(section.sort_index) || 0), 0);
        this.state.sections.push({
            id: this._uid('section'),
            title: title.trim(),
            description: description.trim(),
            sort_index: maxSort + 10,
        });
        this.state.sections.sort((a, b) => (a.sort_index - b.sort_index) || String(a.title).localeCompare(String(b.title), 'ru'));
        await this.persist();
        this.selectedSectionId = this.state.sections[this.state.sections.length - 1].id;
        this.render();
        App.toast('Раздел создан');
    },

    async renameSection(sectionId) {
        const section = this._getSection(sectionId);
        if (!section) return;
        const title = prompt('Новое название раздела:', section.title);
        if (!title || !title.trim()) return;
        const description = prompt('Описание раздела:', section.description || '') || '';
        section.title = title.trim();
        section.description = description.trim();
        await this.persist();
        this.render();
        App.toast('Раздел обновлен');
    },

    _ensureDraftsSection() {
        let drafts = (this.state.sections || []).find(section => section.id === 'drafts');
        if (drafts) return drafts.id;
        drafts = {
            id: 'drafts',
            title: 'Черновики переноса',
            description: 'Временное место для сырого текста перед разбором.',
            sort_index: 999,
        };
        this.state.sections.push(drafts);
        return drafts.id;
    },

    async deleteSection(sectionId) {
        const section = this._getSection(sectionId);
        if (!section) return;
        if (!confirm(`Удалить раздел "${section.title}"? Статьи из него будут перенесены в "Черновики переноса".`)) return;
        const draftsId = this._ensureDraftsSection();
        (this.state.articles || []).forEach(article => {
            if (article.section_id === sectionId) article.section_id = draftsId;
        });
        this.state.sections = (this.state.sections || []).filter(item => item.id !== sectionId);
        if (this.selectedSectionId === sectionId) this.selectedSectionId = draftsId;
        await this.persist();
        this.render();
        App.toast('Раздел удален, статьи перенесены в черновики');
    },

    async createArticle(sectionId = null) {
        const targetSectionId = sectionId || (this.selectedSectionId !== 'all' ? this.selectedSectionId : ((this.state.sections || [])[0] || {}).id);
        const article = {
            id: this._uid('article'),
            section_id: targetSectionId || this._ensureDraftsSection(),
            title: 'Новая статья',
            summary: '',
            body: '',
            tags: [],
            sort_index: ((this.state.articles || []).reduce((acc, item) => Math.max(acc, Number(item.sort_index) || 0), 0) || 0) + 10,
            updated_at: this._nowIso(),
            updated_by: this._currentAuthor(),
        };
        this.state.articles.unshift(article);
        this.selectedArticleId = article.id;
        this.selectedSectionId = article.section_id;
        this.editMode = true;
        await this.persist();
        this.render();
        App.toast('Создана новая статья');
    },

    async saveSelectedArticle() {
        const article = this._getArticle(this.selectedArticleId);
        if (!article) return;
        const draft = this._getEditorDraft(article);
        if (!draft.title.trim()) {
            App.toast('Укажите заголовок статьи');
            return;
        }
        article.title = draft.title;
        article.section_id = draft.section_id || article.section_id;
        article.summary = draft.summary;
        article.body = draft.body;
        article.tags = draft.tags;
        article.updated_at = this._nowIso();
        article.updated_by = this._currentAuthor();
        await this.persist();
        this.editMode = false;
        this.render();
        App.toast('Статья сохранена');
    },

    async deleteSelectedArticle() {
        const article = this._getArticle(this.selectedArticleId);
        if (!article) return;
        if (!confirm(`Удалить статью "${article.title}"?`)) return;
        this.state.articles = (this.state.articles || []).filter(item => item.id !== article.id);
        this.selectedArticleId = ((this.state.articles || [])[0] || {}).id || null;
        await this.persist();
        this.render();
        App.toast('Статья удалена');
    },

    async duplicateSelectedArticle() {
        const article = this._getArticle(this.selectedArticleId);
        if (!article) return;
        const duplicate = {
            ...this._clone(article),
            id: this._uid('article'),
            title: `${article.title} (копия)`,
            updated_at: this._nowIso(),
            updated_by: this._currentAuthor(),
            sort_index: (Number(article.sort_index) || 0) + 1,
        };
        this.state.articles.unshift(duplicate);
        this.selectedArticleId = duplicate.id;
        this.selectedSectionId = duplicate.section_id;
        this.editMode = true;
        await this.persist();
        this.render();
        App.toast('Создана копия статьи');
    },

    async moveSelectedArticle(delta) {
        const article = this._getArticle(this.selectedArticleId);
        if (!article) return;
        article.sort_index = (Number(article.sort_index) || 0) + (Number(delta) || 0);
        article.updated_at = this._nowIso();
        article.updated_by = this._currentAuthor();
        this.state.articles.sort((a, b) => {
            if (a.section_id !== b.section_id) return String(a.section_id).localeCompare(String(b.section_id), 'ru');
            return (Number(a.sort_index) - Number(b.sort_index)) || String(a.title).localeCompare(String(b.title), 'ru');
        });
        await this.persist();
        this.render();
    },

    toggleImportPanel() {
        this.importOpen = !this.importOpen;
        this.render();
    },

    async applyImportText(splitByHeadings = false) {
        const title = (((document.getElementById('wiki-import-title') || {}).value) || '').trim();
        const body = (((document.getElementById('wiki-import-body') || {}).value) || '').trim();
        const sectionId = (((document.getElementById('wiki-import-section') || {}).value) || 'drafts').trim();
        if (!body) {
            App.toast('Вставьте текст для переноса');
            return;
        }
        if (splitByHeadings) {
            const articles = this._splitImportIntoArticles(title, body, sectionId);
            if (articles.length >= 2) {
                this.state.articles.unshift(...articles);
                this.selectedArticleId = articles[0].id;
                this.importOpen = false;
                await this.persist();
                this.render();
                App.toast(`Импортировано ${articles.length} статей по заголовкам`);
                return;
            }
        }
        const article = {
            id: this._uid('article'),
            section_id: sectionId || this._ensureDraftsSection(),
            title: title || 'Импорт из Notion',
            summary: this._excerpt(body, 160),
            body,
            tags: ['notion', 'импорт'],
            sort_index: ((this.state.articles || []).reduce((acc, item) => Math.max(acc, Number(item.sort_index) || 0), 0) || 0) + 10,
            updated_at: this._nowIso(),
            updated_by: this._currentAuthor(),
        };
        this.state.articles.unshift(article);
        this.selectedArticleId = article.id;
        this.importOpen = false;
        await this.persist();
        this.render();
        App.toast('Черновик добавлен в базу знаний');
    },

    handleEditorInput() {
        const draft = this._getEditorDraft();
        const titleEl = document.getElementById('wiki-preview-title');
        const summaryEl = document.getElementById('wiki-preview-summary');
        const tagsEl = document.getElementById('wiki-preview-tags');
        const bodyEl = document.getElementById('wiki-preview-body');
        const sectionEl = document.getElementById('wiki-preview-section');
        const section = this._getSection(draft.section_id);

        if (titleEl) titleEl.textContent = draft.title || 'Новая статья';
        if (summaryEl) {
            summaryEl.textContent = draft.summary || 'Добавьте короткое описание, чтобы статья лучше находилась через поиск.';
        }
        if (tagsEl) tagsEl.innerHTML = this._formatTags(draft.tags);
        if (bodyEl) bodyEl.innerHTML = this._renderBodyPreview(draft.body || '');
        if (sectionEl) sectionEl.textContent = (section && section.title) || 'Без раздела';
    },

    exportJson() {
        if (!this.state) return;
        const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wiki-backup-${(App.todayLocalYMD && App.todayLocalYMD()) || 'export'}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
};
