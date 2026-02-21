// =============================================
// Recycle Object — Settings Page
// Now with inline editing for forms catalog
// =============================================

const Settings = {
    currentTab: 'production',
    moldsData: [],   // local copy of molds for inline editing
    dirtyMolds: {},  // track which molds were edited { id: true }

    async load() {
        this.populateFields();
        await this.loadMoldsForEditing();
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

    // ==========================================
    // MOLDS / TEMPLATES — INLINE EDITING
    // ==========================================

    async loadMoldsForEditing() {
        this.moldsData = await loadMolds();
        this.dirtyMolds = {};
        this.renderMoldsTable();
    },

    renderMoldsTable() {
        const tbody = document.getElementById('settings-templates-body');
        if (!this.moldsData || this.moldsData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = this.moldsData.map(m => {
            const dirty = this.dirtyMolds[m.id] ? ' style="background:var(--green-light);"' : '';
            const catBadge = m.category === 'nfc' ? '<span class="badge badge-yellow">NFC</span>'
                : m.category === 'blank' ? '<span class="badge badge-blue">Бланк</span>'
                : '<span class="badge">Кастом</span>';

            return `
            <tr${dirty} id="tpl-row-${m.id}">
                <td style="font-weight:600;font-size:12px;max-width:160px;">${this.escHtml(m.name)}</td>
                <td style="text-align:center;">${catBadge}</td>
                <td>
                    <input type="number" min="0" value="${m.pph_min || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'pph_min', this.value)">
                </td>
                <td>
                    <input type="number" min="0" value="${m.pph_max || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'pph_max', this.value)">
                </td>
                <td>
                    <input type="number" min="0" value="${m.pph_actual || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'pph_actual', this.value)" placeholder="—">
                </td>
                <td>
                    <input type="number" min="0" value="${m.weight_grams || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'weight_grams', this.value)">
                </td>
                <td>
                    <input type="number" min="1" value="${m.mold_count || 1}" style="width:50px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'mold_count', this.value)">
                </td>
                <td>
                    <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px" title="Открыть в бланках" onclick="Settings.goToMold(${m.id})">&#10140;</button>
                </td>
            </tr>`;
        }).join('');

        // Update save button visibility
        this.updateSaveMoldsBtn();
    },

    onMoldField(id, field, value) {
        const m = this.moldsData.find(x => x.id === id);
        if (!m) return;

        if (field === 'pph_actual') {
            m[field] = value ? parseFloat(value) : null;
        } else {
            m[field] = parseFloat(value) || 0;
        }

        // If pph_max is changed but pph_min > pph_max, sync
        if (field === 'pph_min' && m.pph_min > (m.pph_max || 0) && m.pph_max > 0) {
            m.pph_max = m.pph_min;
        }

        this.dirtyMolds[id] = true;

        // Highlight the row
        const row = document.getElementById('tpl-row-' + id);
        if (row) row.style.background = 'var(--green-light)';

        this.updateSaveMoldsBtn();
    },

    updateSaveMoldsBtn() {
        const btn = document.getElementById('settings-save-molds-btn');
        if (!btn) return;
        const dirtyCount = Object.keys(this.dirtyMolds).length;
        if (dirtyCount > 0) {
            btn.style.display = '';
            btn.textContent = `Сохранить (${dirtyCount} изм.)`;
        } else {
            btn.style.display = 'none';
        }
    },

    async saveMoldsChanges() {
        const dirtyIds = Object.keys(this.dirtyMolds).map(Number);
        if (dirtyIds.length === 0) return;

        for (const id of dirtyIds) {
            const m = this.moldsData.find(x => x.id === id);
            if (m) await saveMold(m);
        }

        // Also regenerate templates from molds
        App.templates = this.moldsData.map(m => {
            const pMin = m.pph_min || 0;
            const pMax = m.pph_max || 0;
            const display = pMin === 0 ? '—' : (pMin === pMax ? String(pMin) : `${pMin}-${pMax}`);
            return {
                id: m.id,
                name: m.name,
                category: m.category === 'nfc' ? 'blank' : m.category,
                pieces_per_hour_display: display,
                pieces_per_hour_min: pMin,
                pieces_per_hour_max: pMax,
                weight_grams: m.weight_grams,
            };
        });

        this.dirtyMolds = {};
        this.renderMoldsTable();
        App.toast(`Сохранено ${dirtyIds.length} бланков`);
    },

    goToMold(id) {
        App.navigate('molds');
        // After navigation, scroll to mold (it will reload)
        setTimeout(() => {
            Molds.editMold(id);
        }, 300);
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};
