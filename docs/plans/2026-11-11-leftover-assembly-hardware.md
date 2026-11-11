# План: фурнитура со склада в «Сборке из остатков»

Спек: [docs/specs/2026-11-11-leftover-assembly-hardware.md](../specs/2026-11-11-leftover-assembly-hardware.md)

- [x] Движок (`js/calculator.js`): нормализатор строк материалов (живые `qty/price/delivery_price/result` и сохранённые `quantity/*_price_per_unit/*_delivery_per_unit/hours_*`); материалы и часы норм в load / summary / fin director; снапшот берёт строки из `order_items`.
- [x] Тест `tests/leftover-assembly-smoke.js`: без фурнитуры — прежние цифры; с фурнитурой — часы, косвенные, материалы, маржа; снапшот из сохранённых строк.
- [x] Калькулятор (`js/app.js`): раздел фурнитуры виден в режиме остатков; сохранение отдаёт фурнитуру/упаковку без родителя; summary/load/fin director получают строки; карточка цены и итог показывают материалы.
- [x] Список заказов (`js/orders.js`) передаёт позиции в снапшот.
- [x] `index.html`: тексты панели, cache-bust, версия ×4.
- [x] Прогнать смоки: leftover-assembly, version, order-flow, order-card, marketing-purpose.
