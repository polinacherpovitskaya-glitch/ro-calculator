// =============================================
// Recycle Object — Colors (Справочник цветов)
// =============================================

const Colors = {
    data: [],
    editId: null,
    _pendingPhoto: '',

    async load() {
        try {
            this.data = await loadColors();
            this.filterAndRender();
        } catch (e) {
            console.error('[Colors.load] error:', e);
            const container = document.getElementById('colors-cards-container');
            if (container) container.innerHTML = '<div class="empty-state"><p style="color:var(--red)">Ошибка загрузки цветов</p></div>';
        }
    },

    filterAndRender() {
        const search = (document.getElementById('colors-search')?.value || '').toLowerCase().trim();
        let filtered = [...this.data];
        if (search) filtered = filtered.filter(c =>
            (c.name || '').toLowerCase().includes(search) ||
            (c.number || '').includes(search)
        );
        filtered.sort((a, b) => {
            const na = parseInt(a.number) || 0;
            const nb = parseInt(b.number) || 0;
            return na - nb;
        });

        // Update stats
        const totalEl = document.getElementById('colors-total');
        if (totalEl) totalEl.textContent = this.data.length;

        this.renderTable(filtered);
    },

    renderTable(colors) {
        const container = document.getElementById('colors-cards-container');
        if (!container) return;

        if (colors.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Нет цветов</p></div>';
            return;
        }

        let html = '<div class="colors-grid">';
        colors.forEach(c => {
            const photo = c.photo_url
                ? `<img src="${this.esc(c.photo_url)}" class="color-thumb" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : '';
            const placeholder = `<span class="color-thumb-placeholder" style="${c.photo_url ? 'display:none' : ''}">${(c.name || '?')[0]}</span>`;

            html += `
            <div class="color-card" onclick="Colors.editColor(${c.id})">
                <div class="color-card-photo">
                    ${photo}${placeholder}
                </div>
                <div class="color-card-info">
                    <span class="color-card-number">${this.esc(c.number)}</span>
                    <span class="color-card-name">${this.esc(c.name)}</span>
                </div>
                <button class="btn-remove" title="Удалить" onclick="event.stopPropagation(); Colors.deleteColor(${c.id})">&#10005;</button>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    showAddForm() {
        this.editId = null;
        this._pendingPhoto = '';
        document.getElementById('color-form-title').textContent = 'Новый цвет';
        document.getElementById('color-number').value = this.getNextNumber();
        document.getElementById('color-name').value = '';
        document.getElementById('color-notes').value = '';
        document.getElementById('color-photo-url').value = '';
        document.getElementById('color-photo-file').value = '';
        this.updatePhotoPreview('');
        document.getElementById('color-edit-form').style.display = '';
        document.getElementById('color-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editColor(id) {
        const c = this.data.find(x => x.id === id);
        if (!c) return;
        this.editId = id;
        this._pendingPhoto = c.photo_url || '';
        document.getElementById('color-form-title').textContent = 'Редактировать цвет';
        document.getElementById('color-number').value = c.number || '';
        document.getElementById('color-name').value = c.name || '';
        document.getElementById('color-notes').value = c.notes || '';
        document.getElementById('color-photo-url').value = (c.photo_url && !c.photo_url.startsWith('data:')) ? c.photo_url : '';
        document.getElementById('color-photo-file').value = '';
        this.updatePhotoPreview(c.photo_url || '');
        document.getElementById('color-edit-form').style.display = '';
        document.getElementById('color-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    async saveColor() {
        const number = (document.getElementById('color-number').value || '').trim();
        const name = (document.getElementById('color-name').value || '').trim();
        const notes = (document.getElementById('color-notes').value || '').trim();

        if (!name) {
            App.toast('Введите название цвета');
            return;
        }

        const color = {
            id: this.editId || null,
            number: number,
            name: name,
            photo_url: this._pendingPhoto || '',
            notes: notes,
        };

        await saveColor(color);
        this.hideForm();
        await this.load();
        App.toast(this.editId ? 'Цвет обновлён' : 'Цвет добавлен');
    },

    async deleteColor(id) {
        if (!confirm('Удалить этот цвет?')) return;
        await deleteColor(id);
        await this.load();
        App.toast('Цвет удалён');
    },

    hideForm() {
        document.getElementById('color-edit-form').style.display = 'none';
        this.editId = null;
        this._pendingPhoto = '';
    },

    getNextNumber() {
        if (this.data.length === 0) return '001';
        const maxNum = Math.max(...this.data.map(c => parseInt(c.number) || 0));
        return String(maxNum + 1).padStart(3, '0');
    },

    // === Photo handling (same pattern as molds.js) ===

    onPhotoFileChange(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) {
            App.toast('Файл слишком большой (макс 2MB)');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            this.resizeImage(e.target.result, 200, (thumb) => {
                this._pendingPhoto = thumb;
                this.updatePhotoPreview(thumb);
                document.getElementById('color-photo-url').value = '';
            });
        };
        reader.readAsDataURL(file);
    },

    onPhotoUrlChange(url) {
        if (url && url.trim()) {
            this._pendingPhoto = url.trim();
            this.updatePhotoPreview(url.trim());
        } else {
            this._pendingPhoto = '';
            this.updatePhotoPreview('');
        }
    },

    resizeImage(dataUrl, maxSize, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    },

    updatePhotoPreview(url) {
        const el = document.getElementById('color-photo-preview');
        if (!el) return;
        if (url) {
            el.innerHTML = `<img src="${this.esc(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" onerror="this.parentNode.innerHTML='<span style=\\'font-size:24px;color:var(--red)\\'>!</span>'">`;
        } else {
            el.innerHTML = '<span style="font-size:24px;color:var(--text-muted)">&#127912;</span>';
        }
    },

    esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    },
};
