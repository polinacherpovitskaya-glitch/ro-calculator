// =============================================
// Recycle Object — Settings Page
// =============================================

const Settings = {
    currentTab: 'production',

    async load() {
        this.populateFields();
        this.loadTemplatesTable();
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.settings-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.tabs .tab').forEach(el => {
            el.classList.toggle('active', el.dataset.tab === tab);
        });
        const target = document.getElementById('settings-tab-' + tab);
        if (target) target.style.display = '';
    },

    populateFields() {
        const s = App.settings;
        if (!s) return;

        // Fill all inputs with data-key attribute
        document.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            if (s[key] !== undefined) {
                input.value = s[key];
            }
        });
    },

    async saveAll() {
        const newSettings = { ...App.settings };

        document.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            newSettings[key] = parseFloat(input.value) || 0;
        });

        await saveAllSettings(newSettings);

        // Update app state
        App.settings = newSettings;
        App.params = getProductionParams(newSettings);

        App.toast('Настройки сохранены');
    },

    // === Templates ===

    loadTemplatesTable() {
        const tbody = document.getElementById('settings-templates-body');
        if (!App.templates) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = App.templates.map(t => `
            <tr>
                <td>${this.escHtml(t.name)}</td>
                <td><span class="badge ${t.category === 'blank' ? 'badge-blue' : 'badge-yellow'}">${t.category === 'blank' ? 'Бланк' : 'Кастом'}</span></td>
                <td class="text-right">${t.pieces_per_hour_min}</td>
                <td class="text-right">${t.pieces_per_hour_max}</td>
                <td class="text-right">${t.weight_grams || '—'}</td>
                <td><button class="btn btn-sm btn-outline" onclick="Settings.editTemplate(${t.id})">&#9998;</button></td>
            </tr>
        `).join('');
    },

    addTemplate() {
        App.toast('Добавление форм — скоро');
    },

    editTemplate(id) {
        App.toast('Редактирование форм — скоро');
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};
