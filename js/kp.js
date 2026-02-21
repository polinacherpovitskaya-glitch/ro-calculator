// =============================================
// Recycle Object — КП (Commercial Proposal) PDF Generator
// RePanel-style minimalist design, adapted for RO
// Uses jsPDF with Roboto font for Cyrillic support
// =============================================

const KPGenerator = {

    // Font cache
    _fontLoaded: false,
    _fontData: null,
    _fontBoldData: null,

    /**
     * Load Roboto TTF from CDN (cached in localStorage)
     */
    async loadFont() {
        if (this._fontLoaded) return;

        const CACHE_KEY_REG = 'ro_font_roboto_reg';
        const CACHE_KEY_BOLD = 'ro_font_roboto_bold';

        // Try localStorage cache first
        let regData = null;
        let boldData = null;
        try {
            regData = localStorage.getItem(CACHE_KEY_REG);
            boldData = localStorage.getItem(CACHE_KEY_BOLD);
        } catch (e) { /* quota exceeded or disabled */ }

        if (!regData || !boldData) {
            // Fetch full Roboto TTF with Cyrillic + Latin support
            // Primary: GitHub googlefonts/roboto-2 (official, full Unicode)
            const urls = {
                reg: 'https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted/Roboto-Regular.ttf',
                bold: 'https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted/Roboto-Bold.ttf',
            };

            // Fallback: openmaptiles mirror
            const fallbackUrls = {
                reg: 'https://raw.githubusercontent.com/openmaptiles/fonts/master/roboto/Roboto-Regular.ttf',
                bold: 'https://raw.githubusercontent.com/openmaptiles/fonts/master/roboto/Roboto-Bold.ttf',
            };

            try {
                const fetchWithTimeout = (url, ms = 10000) => {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), ms);
                    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
                };
                const [regResp, boldResp] = await Promise.all([
                    fetchWithTimeout(urls.reg).catch(() => fetchWithTimeout(fallbackUrls.reg)),
                    fetchWithTimeout(urls.bold).catch(() => fetchWithTimeout(fallbackUrls.bold)),
                ]);

                const regBuf = await regResp.arrayBuffer();
                const boldBuf = await boldResp.arrayBuffer();

                regData = this._arrayBufferToBase64(regBuf);
                boldData = this._arrayBufferToBase64(boldBuf);

                // Cache
                try {
                    localStorage.setItem(CACHE_KEY_REG, regData);
                    localStorage.setItem(CACHE_KEY_BOLD, boldData);
                } catch (e) { /* quota */ }
            } catch (err) {
                console.warn('Failed to load Roboto font, falling back to helvetica:', err);
                this._fontLoaded = true;
                return;
            }
        }

        this._fontData = regData;
        this._fontBoldData = boldData;
        this._fontLoaded = true;
    },

    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    _registerFonts(doc) {
        try {
            if (this._fontData) {
                doc.addFileToVFS('Roboto-Regular.ttf', this._fontData);
                doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
            }
            if (this._fontBoldData) {
                doc.addFileToVFS('Roboto-Bold.ttf', this._fontBoldData);
                doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
            }
        } catch (err) {
            console.warn('Font registration failed, using fallback:', err);
            // Clear broken cache
            try {
                localStorage.removeItem('ro_font_roboto_reg');
                localStorage.removeItem('ro_font_roboto_bold');
            } catch (e) {}
            this._fontData = null;
            this._fontBoldData = null;
            this._fontLoaded = false;
        }
    },

    _font() {
        return this._fontData ? 'Roboto' : 'helvetica';
    },

    /**
     * Generate a branded commercial proposal PDF
     * @param {string} orderName - Order name
     * @param {string} clientName - Client company name
     * @param {Array} items - Array of {type, name, qty, price}
     */
    async generate(orderName, clientName, items) {
        // Load font first
        await this.loadFont();

        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF не загружен. Проверьте интернет-соединение и перезагрузите страницу.');
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        this._registerFonts(doc);

        const fn = this._font();
        const pageW = 210;
        const pageH = 297;
        const marginL = 25;
        const marginR = 25;
        const contentW = pageW - marginL - marginR;

        // ── Brand palette ──
        const BLACK = [26, 26, 26];
        const DARK = [51, 51, 51];
        const MID = [102, 102, 102];
        const LIGHT = [153, 153, 153];
        const BORDER = [224, 224, 224];
        const BG = [247, 247, 247];
        const WHITE = [255, 255, 255];

        const today = new Date();
        const dateStr = today.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const kpNumber = 'KP-' + today.getFullYear() +
            String(today.getMonth() + 1).padStart(2, '0') +
            String(today.getDate()).padStart(2, '0') + '-' +
            String(today.getHours()).padStart(2, '0') +
            String(today.getMinutes()).padStart(2, '0');

        let y = 20;

        // ════════════════════════════════
        // HEADER — Logo left, KP title right
        // ════════════════════════════════
        doc.setFont(fn, 'bold');
        doc.setFontSize(18);
        doc.setTextColor(...BLACK);
        doc.text('RECYCLE OBJECT', marginL, y);

        // Right side: KP title + number
        doc.setFont(fn, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...BLACK);
        doc.text('KOММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', pageW - marginR, y - 3, { align: 'right' });

        doc.setFont(fn, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...LIGHT);
        doc.text(kpNumber + '  |  ' + dateStr, pageW - marginR, y + 2, { align: 'right' });

        y += 7;

        // Separator line
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.5);
        doc.line(marginL, y, pageW - marginR, y);
        y += 8;

        // ════════════════════════════════
        // CLIENT & PROJECT — two columns
        // ════════════════════════════════
        const colW = contentW * 0.48;

        // Left column — Client
        if (clientName) {
            doc.setFont(fn, 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...LIGHT);
            doc.text('Заказчик', marginL, y);
            y += 5;

            doc.setFont(fn, 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(...BLACK);
            doc.text(clientName, marginL, y);
        }

        // Right column — Product info
        const rightX = marginL + contentW * 0.52;
        let ry = y - 5;

        doc.setFont(fn, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...LIGHT);
        doc.text('Проект', rightX, ry);
        ry += 5;

        doc.setFont(fn, 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...BLACK);
        doc.text(orderName, rightX, ry);

        // Get main item info for subtitle
        const mainItem = items.find(it => it.type === 'product');
        if (mainItem) {
            ry += 5;
            doc.setFont(fn, 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...DARK);
            doc.text('Тираж: ' + this.fmtNum(mainItem.qty) + ' шт', rightX, ry);
        }

        y += 8;

        // Separator
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.5);
        doc.line(marginL, y, pageW - marginR, y);
        y += 8;

        // ════════════════════════════════
        // PRICE TABLE — name | per unit | per order
        // ════════════════════════════════
        doc.setFont(fn, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...BLACK);
        doc.text('Стоимость', marginL, y);
        y += 8;

        // Column positions
        const col1X = marginL; // Name
        const col1W = contentW * 0.42;
        const col2X = marginL + contentW * 0.71; // Per unit (right-aligned)
        const col3X = pageW - marginR; // Per order (right-aligned)

        // Get the main qty for display
        const mainQty = mainItem ? mainItem.qty : (items[0] ? items[0].qty : 1);
        // Check if all items have same qty
        const allSameQty = items.every(it => it.qty === mainQty);

        // Table header
        doc.setFont(fn, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...LIGHT);
        doc.text('за 1 шт', col2X, y, { align: 'right' });
        doc.text(allSameQty ? 'за ' + this.fmtNum(mainQty) + ' шт' : 'Сумма', col3X, y, { align: 'right' });

        y += 2;
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.5);
        doc.line(marginL, y, pageW - marginR, y);
        y += 1;

        // Table rows
        let grandTotal = 0;
        const rowH = 8;

        items.forEach((item, i) => {
            const rowTotal = item.qty * item.price;
            grandTotal += rowTotal;

            y += rowH;

            // Name (+ qty if different quantities)
            doc.setFont(fn, 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(...DARK);
            const displayName = allSameQty ? item.name : item.name + '  (' + this.fmtNum(item.qty) + ' шт)';
            doc.text(displayName, col1X, y);

            // Per unit price
            doc.setFont(fn, 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(...DARK);
            doc.text(this.fmtRub(item.price), col2X, y, { align: 'right' });

            // Per order price
            doc.text(this.fmtRub(rowTotal), col3X, y, { align: 'right' });

            // Separator between rows
            y += 3;
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.25);
            doc.line(marginL, y, pageW - marginR, y);

            // Page overflow check
            if (y > pageH - 80) {
                doc.addPage();
                y = 20;
            }
        });

        // ── Subtotal ──
        y += 2;
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(1);
        doc.line(marginL, y, pageW - marginR, y);
        y += rowH;

        doc.setFont(fn, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BLACK);
        doc.text('Итого без НДС', col1X, y);

        // Per unit subtotal (only meaningful if all items have same qty)
        const perUnitSubtotal = allSameQty ? items.reduce((sum, it) => sum + it.price, 0) : 0;
        if (allSameQty) {
            doc.text(this.fmtRub(perUnitSubtotal), col2X, y, { align: 'right' });
        }
        doc.text(this.fmtRub(grandTotal), col3X, y, { align: 'right' });

        y += 3;
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.25);
        doc.line(marginL, y, pageW - marginR, y);

        // ── VAT 5% ──
        const vatAmount = Math.ceil(grandTotal * 0.05);
        const vatPerUnit = allSameQty ? Math.ceil(perUnitSubtotal * 0.05) : 0;
        y += rowH;

        doc.setFont(fn, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...DARK);
        doc.text('НДС 5%', col1X, y);
        if (allSameQty) {
            doc.text(this.fmtRub(vatPerUnit), col2X, y, { align: 'right' });
        }
        doc.text(this.fmtRub(vatAmount), col3X, y, { align: 'right' });

        // ── Total with VAT ──
        const totalWithVat = grandTotal + vatAmount;
        const totalPerUnitWithVat = perUnitSubtotal + vatPerUnit;

        y += 2;
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(1);
        doc.line(marginL, y, pageW - marginR, y);
        y += rowH;

        // Highlight row background
        doc.setFillColor(...BG);
        doc.rect(marginL - 2, y - 5, contentW + 4, 10, 'F');

        doc.setFont(fn, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BLACK);
        doc.text('Итого с НДС', col1X, y);
        if (allSameQty) {
            doc.text(this.fmtRub(totalPerUnitWithVat), col2X, y, { align: 'right' });
        }
        doc.text(this.fmtRub(totalWithVat), col3X, y, { align: 'right' });

        y += 12;

        // ════════════════════════════════
        // BIG TOTAL BLOCK
        // ════════════════════════════════
        const bigBlockH = 24;
        doc.setFillColor(...BG);
        doc.roundedRect(marginL, y, contentW, bigBlockH, 2, 2, 'F');

        // Big price
        doc.setFont(fn, 'bold');
        doc.setFontSize(28);
        doc.setTextColor(...BLACK);
        doc.text(this.fmtRub(totalWithVat), marginL + 12, y + 16);

        // Subtitle under big price
        doc.setFont(fn, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...MID);
        let bigSubtitle;
        if (allSameQty) {
            bigSubtitle = this.fmtNum(mainQty) + ' шт \u00D7 ' +
                this.fmtRub(totalPerUnitWithVat) + '/шт (вкл. НДС 5%)';
        } else {
            bigSubtitle = items.length + ' позиций, вкл. НДС 5%';
        }
        doc.text(bigSubtitle, marginL + 12, y + 22);

        y += bigBlockH + 10;

        // ════════════════════════════════
        // NOTES
        // ════════════════════════════════
        doc.setFont(fn, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...LIGHT);
        doc.text('Предложение действительно 14 дней', marginL, y);
        y += 4;
        doc.text('Сроки изготовления обсуждаются индивидуально', marginL, y);

        // ════════════════════════════════
        // WHY RECYCLE OBJECT — compact block
        // ════════════════════════════════
        y += 10;
        if (y < pageH - 60) {
            doc.setFillColor(...BG);
            doc.roundedRect(marginL, y, contentW, 36, 2, 2, 'F');

            doc.setFont(fn, 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...BLACK);
            doc.text('Почему Recycle Object?', marginL + 8, y + 9);

            doc.setFont(fn, 'normal');
            doc.setFontSize(8.5);

            const bullets = [
                '100% переработанный пластик — экологичный мерч',
                'Собственное производство в Москве',
                'Индивидуальный дизайн и брендирование',
                'Опыт работы с крупными компаниями',
            ];

            let bY = y + 16;
            bullets.forEach(b => {
                doc.setTextColor(22, 163, 74); // green
                doc.text('\u2713', marginL + 8, bY);
                doc.setTextColor(...MID);
                doc.text(b, marginL + 14, bY);
                bY += 5;
            });
        }

        // ════════════════════════════════
        // FOOTER
        // ════════════════════════════════
        const footerY = pageH - 16;
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.5);
        doc.line(marginL, footerY - 6, pageW - marginR, footerY - 6);

        doc.setFont(fn, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...LIGHT);

        doc.text('recycleobject.ru', marginL, footerY - 1);

        doc.setFont(fn, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...LIGHT);
        doc.text('Recycle Object  |  Москва, Россия', pageW - marginR, footerY - 1, { align: 'right' });

        // ════════════════════════════════
        // DOWNLOAD
        // ════════════════════════════════
        const safeName = (clientName || orderName).replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g, '').replace(/\s+/g, '_');
        const fileName = 'KP_' + safeName + '_' + dateStr.replace(/\./g, '') + '.pdf';
        doc.save(fileName);

        App.toast('КП скачано: ' + fileName);
    },

    fmtNum(n) {
        return new Intl.NumberFormat('ru-RU').format(n);
    },

    fmtRub(n) {
        if (!n && n !== 0) return '— \u20BD';
        // Round up to nearest 10 for clean display
        const rounded = Math.ceil(n / 10) * 10;
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(rounded) + ' \u20BD';
    },

    fmtMoney(n) {
        if (!n) return '0 \u20BD';
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' \u20BD';
    },
};
