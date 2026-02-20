// =============================================
// Recycle Object — КП (Commercial Proposal) PDF Generator
// Minimalist branded template using jsPDF
// =============================================

const KPGenerator = {

    /**
     * Generate a branded commercial proposal PDF
     * @param {string} orderName - Order name
     * @param {string} clientName - Client company name
     * @param {Array} items - Array of {type, name, qty, price}
     */
    generate(orderName, clientName, items) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const pageW = 210;
        const pageH = 297;
        const margin = 20;
        const contentW = pageW - margin * 2;

        // Colors
        const black = [26, 26, 26];
        const gray = [102, 102, 102];
        const lightGray = [224, 224, 224];
        const accent = [37, 99, 235];
        const green = [22, 163, 74];
        const bg = [245, 245, 245];

        let y = 0;

        // ==========================================
        // HEADER — dark bar with brand
        // ==========================================
        doc.setFillColor(...black);
        doc.rect(0, 0, pageW, 36, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('RECYCLE OBJECT', margin, 16);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Корпоративный мерч из переработанного пластика', margin, 24);

        // Date on right
        const today = new Date();
        const dateStr = today.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        doc.setFontSize(9);
        doc.text(dateStr, pageW - margin, 16, { align: 'right' });

        // Accent line
        doc.setFillColor(...accent);
        doc.rect(0, 36, pageW, 1.5, 'F');

        y = 50;

        // ==========================================
        // TITLE
        // ==========================================
        doc.setTextColor(...black);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('Коммерческое предложение', margin, y);
        y += 12;

        // Client & order info
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...gray);

        if (clientName) {
            doc.text('Клиент:', margin, y);
            doc.setTextColor(...black);
            doc.setFont('helvetica', 'bold');
            doc.text(clientName, margin + 22, y);
            y += 7;
        }

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...gray);
        doc.text('Проект:', margin, y);
        doc.setTextColor(...black);
        doc.setFont('helvetica', 'bold');
        doc.text(orderName, margin + 22, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...gray);
        doc.text('Дата:', margin, y);
        doc.setTextColor(...black);
        doc.text(dateStr, margin + 22, y);
        y += 14;

        // ==========================================
        // TABLE
        // ==========================================

        // Table header
        const colX = {
            num: margin,
            name: margin + 10,
            qty: margin + contentW - 70,
            price: margin + contentW - 40,
            total: margin + contentW - 5,
        };

        // Header background
        doc.setFillColor(...black);
        doc.rect(margin, y, contentW, 9, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('#', colX.num + 2, y + 6);
        doc.text('Наименование', colX.name + 2, y + 6);
        doc.text('Кол-во', colX.qty, y + 6, { align: 'right' });
        doc.text('Цена', colX.price + 5, y + 6, { align: 'right' });
        doc.text('Сумма', colX.total, y + 6, { align: 'right' });

        y += 9;

        // Table rows
        let grandTotal = 0;
        doc.setFontSize(10);

        items.forEach((item, i) => {
            const rowH = 8;
            const rowY = y;
            const rowTotal = item.qty * item.price;
            grandTotal += rowTotal;

            // Zebra stripe
            if (i % 2 === 0) {
                doc.setFillColor(...bg);
                doc.rect(margin, rowY, contentW, rowH, 'F');
            }

            doc.setTextColor(...black);
            doc.setFont('helvetica', 'normal');

            // Number
            doc.setTextColor(...gray);
            doc.text((i + 1).toString(), colX.num + 2, rowY + 5.5);

            // Name — with type icon
            doc.setTextColor(...black);
            let displayName = item.name;
            if (item.type === 'printing') {
                doc.setTextColor(100, 100, 100);
                displayName = '  ' + displayName;
            }
            doc.text(displayName, colX.name + 2, rowY + 5.5);

            // Qty
            doc.setTextColor(...black);
            doc.text(this.fmtNum(item.qty) + ' шт', colX.qty, rowY + 5.5, { align: 'right' });

            // Price per unit
            doc.text(this.fmtMoney(item.price), colX.price + 5, rowY + 5.5, { align: 'right' });

            // Total
            doc.setFont('helvetica', 'bold');
            doc.text(this.fmtMoney(rowTotal), colX.total, rowY + 5.5, { align: 'right' });

            y += rowH;

            // Check page overflow
            if (y > pageH - 60) {
                doc.addPage();
                y = margin;
            }
        });

        // Bottom line
        doc.setDrawColor(...lightGray);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + contentW, y);
        y += 4;

        // Grand total
        doc.setFillColor(...bg);
        doc.rect(margin, y, contentW, 12, 'F');

        doc.setTextColor(...black);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('ИТОГО:', margin + 4, y + 8);
        doc.setTextColor(...accent);
        doc.text(this.fmtMoney(grandTotal), colX.total, y + 8, { align: 'right' });

        y += 18;

        // VAT note
        doc.setFontSize(9);
        doc.setTextColor(...gray);
        doc.setFont('helvetica', 'normal');
        doc.text('Цены указаны с учетом НДС 5%. Предложение действительно 14 дней.', margin, y);
        y += 6;
        doc.text('Сроки изготовления обсуждаются индивидуально.', margin, y);

        y += 14;

        // ==========================================
        // WHY RECYCLE OBJECT
        // ==========================================
        if (y < pageH - 70) {
            doc.setFillColor(...bg);
            doc.roundedRect(margin, y, contentW, 40, 3, 3, 'F');

            doc.setTextColor(...black);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Почему Recycle Object?', margin + 8, y + 10);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...gray);

            const bullets = [
                '100% переработанный пластик — экологичный мерч',
                'Собственное производство в Москве',
                'Индивидуальный дизайн и брендирование',
                'Опыт работы с крупными компаниями',
            ];

            let bY = y + 18;
            bullets.forEach(b => {
                doc.setTextColor(...green);
                doc.text('\u2713', margin + 8, bY);
                doc.setTextColor(...gray);
                doc.text(b, margin + 14, bY);
                bY += 5.5;
            });

            y += 46;
        }

        // ==========================================
        // FOOTER
        // ==========================================
        const footerY = pageH - 16;
        doc.setDrawColor(...lightGray);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY - 4, margin + contentW, footerY - 4);

        doc.setFontSize(8);
        doc.setTextColor(...gray);
        doc.setFont('helvetica', 'normal');
        doc.text('Recycle Object  |  recycleobject.com  |  info@recycleobject.com', margin, footerY);
        doc.text('Москва, Россия', pageW - margin, footerY, { align: 'right' });

        // ==========================================
        // DOWNLOAD
        // ==========================================
        const fileName = 'KP_' + (clientName || orderName).replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '_' + dateStr.replace(/\./g, '') + '.pdf';
        doc.save(fileName);

        App.toast('КП скачано: ' + fileName);
    },

    fmtNum(n) {
        return new Intl.NumberFormat('ru-RU').format(n);
    },

    fmtMoney(n) {
        if (!n) return '0 \u20BD';
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' \u20BD';
    },
};
