// =============================================
// Recycle Object — FinTablo Import Page
// =============================================

const Import = {
    pendingData: null,

    async load() {
        await this.loadOrderSelect();
    },

    async loadOrderSelect() {
        const orders = await loadOrders({});
        const select = document.getElementById('import-order-select');
        select.innerHTML = '<option value="">-- Выберите заказ --</option>';
        orders.forEach(o => {
            select.innerHTML += `<option value="${o.id}">${o.order_name} (${App.formatDate(o.created_at)})</option>`;
        });
    },

    processCSV() {
        const orderId = document.getElementById('import-order-select').value;
        if (!orderId) {
            App.toast('Выберите заказ');
            return;
        }

        const fileInput = document.getElementById('import-csv-file');
        if (!fileInput.files.length) {
            App.toast('Выберите CSV-файл');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const data = this.parseCSV(text);
                this.pendingData = {
                    orderId: parseInt(orderId),
                    ...data,
                    periodStart: document.getElementById('import-period-start').value || null,
                    periodEnd: document.getElementById('import-period-end').value || null,
                };
                this.showPreview();
            } catch (err) {
                App.toast('Ошибка чтения CSV: ' + err.message);
            }
        };
        reader.readAsText(fileInput.files[0], 'utf-8');
    },

    parseCSV(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const result = {
            fact_salary: 0,
            fact_materials: 0,
            fact_hardware: 0,
            fact_delivery: 0,
            fact_printing: 0,
            fact_molds: 0,
            fact_taxes: 0,
            fact_other: 0,
            fact_total: 0,
            fact_revenue: 0,
            raw_data: { lines },
        };

        // Try to match known FinTablo expense categories
        const categoryMap = {
            'зарплата': 'fact_salary',
            'зп': 'fact_salary',
            'фот': 'fact_salary',
            'материал': 'fact_materials',
            'пластик': 'fact_materials',
            'сырье': 'fact_materials',
            'фурнитура': 'fact_hardware',
            'доставка': 'fact_delivery',
            'логистика': 'fact_delivery',
            'печат': 'fact_printing',
            'нанесение': 'fact_printing',
            'молд': 'fact_molds',
            'форма': 'fact_molds',
            'налог': 'fact_taxes',
            'ндс': 'fact_taxes',
            'выручка': 'fact_revenue',
            'доход': 'fact_revenue',
        };

        lines.forEach(line => {
            // Try semicolon and comma separators
            const parts = line.includes(';') ? line.split(';') : line.split(',');
            if (parts.length < 2) return;

            const label = (parts[0] || '').toLowerCase().trim();
            const value = parseFloat((parts[parts.length - 1] || '0').replace(/\s/g, '').replace(',', '.')) || 0;

            let matched = false;
            for (const [keyword, field] of Object.entries(categoryMap)) {
                if (label.includes(keyword)) {
                    result[field] += value;
                    matched = true;
                    break;
                }
            }
            if (!matched && value !== 0 && !label.includes('итого')) {
                result.fact_other += value;
            }
        });

        result.fact_total = result.fact_salary + result.fact_materials + result.fact_hardware
            + result.fact_delivery + result.fact_printing + result.fact_molds
            + result.fact_taxes + result.fact_other;

        return result;
    },

    showPreview() {
        const d = this.pendingData;
        document.getElementById('import-preview').style.display = '';

        const html = `
            <div class="cost-row"><span class="cost-label">Зарплата</span><span class="cost-value">${formatRub(d.fact_salary)}</span></div>
            <div class="cost-row"><span class="cost-label">Материалы</span><span class="cost-value">${formatRub(d.fact_materials)}</span></div>
            <div class="cost-row"><span class="cost-label">Фурнитура</span><span class="cost-value">${formatRub(d.fact_hardware)}</span></div>
            <div class="cost-row"><span class="cost-label">Доставка</span><span class="cost-value">${formatRub(d.fact_delivery)}</span></div>
            <div class="cost-row"><span class="cost-label">Нанесение</span><span class="cost-value">${formatRub(d.fact_printing)}</span></div>
            <div class="cost-row"><span class="cost-label">Молды</span><span class="cost-value">${formatRub(d.fact_molds)}</span></div>
            <div class="cost-row"><span class="cost-label">Налоги</span><span class="cost-value">${formatRub(d.fact_taxes)}</span></div>
            <div class="cost-row"><span class="cost-label">Прочее</span><span class="cost-value">${formatRub(d.fact_other)}</span></div>
            <div class="cost-row cost-total"><span class="cost-label">ИТОГО расходы</span><span class="cost-value">${formatRub(d.fact_total)}</span></div>
            <div class="cost-row" style="margin-top:8px"><span class="cost-label">Выручка</span><span class="cost-value text-green">${formatRub(d.fact_revenue)}</span></div>
        `;
        document.getElementById('import-preview-data').innerHTML = html;
    },

    async confirmImport() {
        if (!this.pendingData) return;

        const d = this.pendingData;
        const importData = {
            order_id: d.orderId,
            period_start: d.periodStart,
            period_end: d.periodEnd,
            fact_salary: d.fact_salary,
            fact_materials: d.fact_materials,
            fact_hardware: d.fact_hardware,
            fact_delivery: d.fact_delivery,
            fact_printing: d.fact_printing,
            fact_molds: d.fact_molds,
            fact_taxes: d.fact_taxes,
            fact_other: d.fact_other,
            fact_total: d.fact_total,
            fact_revenue: d.fact_revenue,
            raw_data: d.raw_data,
            source: 'csv_upload',
        };

        const id = await saveFintabloImport(importData);
        if (id) {
            App.toast('Импорт сохранен');
            this.pendingData = null;
            document.getElementById('import-preview').style.display = 'none';
            document.getElementById('import-csv-file').value = '';
        } else {
            App.toast('Ошибка сохранения');
        }
    },

    cancelImport() {
        this.pendingData = null;
        document.getElementById('import-preview').style.display = 'none';
    },
};
