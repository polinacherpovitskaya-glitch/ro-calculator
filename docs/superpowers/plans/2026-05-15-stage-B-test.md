# Stage B — Финальная сверка перед Cutover

> **REQUIRED:** мастер-плейбук + все Block 1-16 завершены и смержены в `main`.

**Goal:** За 1-2 недели до планируемого cutover убедиться, что:
- Все блоки работают на staging
- Цифры совпадают с production (Supabase)
- Performance приемлемый
- Все пользователи знают как залогиниться в новую систему (могут это сделать prototype'но)

**Цель этого Stage — найти ВСЕ оставшиеся проблемы ДО переключения DNS.**

**Длительность:** 1-2 недели интенсивного тестирования.

**Branch:** `stage-B-test` (для багфиксов которые выявятся)

---

## Pre-flight checklist

Перед стартом Stage B убедиться:
- [ ] Все 16 блоков смержены в `main`
- [ ] Последний CI на `main` зелёный
- [ ] `https://ops-staging.recycleobject.ru/api/health` отвечает 200, db.ok=true
- [ ] Все 20 golden masters Block 7 проходят
- [ ] Все 20 full-order golden masters Block 9 проходят
- [ ] `ops/README.md` обновлён до текущего состояния

---

## Task 1: Свежая переливка staging

- [ ] Запустить `node ops/scripts/refresh-staging-snapshot.mjs`
- [ ] Дождаться завершения (может занять час+ при большом количестве данных)
- [ ] Запустить `node ops/scripts/compare-datasets.mjs` — все таблицы должны совпасть по count.
- [ ] Если есть расхождения — разбираться. Чаще всего: новые записи в Supabase появились во время копирования. Повторить refresh.

---

## Task 2: Автоматизированные тесты

Прогнать всё:

```bash
# API unit + integration
cd ops/api && npm test

# Web build
cd ops/web && npm run build

# Calculator golden masters (включены в npm test, но прогнать отдельно для отчёта)
cd ops/api && node --test test/calc/

# Playwright e2e против staging
cd tests/playwright && npx playwright test
```

- [ ] **Все тесты зелёные.** Если что-то падает — это блокер.
- [ ] Зафиксировать в отчёте (например `docs/stage-B-test-results.md`) сколько тестов прошло.

---

## Task 3: Ручная сверка цифр на 10+ реальных заказах

**Самое важное.** Пользователь явно сказал «копейка в копейку».

- [ ] Выбрать 10 реальных заказов разных типов:
  - 3 свежих заказа (status='draft' / 'quoted')
  - 3 в работе (status='in_production')
  - 4 закрытых (status='closed' с фактическими данными)
- [ ] Для каждого:
  - Открыть в production calc.recycleobject.ru — записать `total_revenue, total_cost, total_margin, margin_percent`
  - Открыть тот же заказ на ops-staging.recycleobject.ru — сравнить
  - **Расхождение > 0.5 коп = блокер**
- [ ] Зафиксировать в отчёте.

---

## Task 4: Полный обход экранов

Пройтись по всем экранам и убедиться что они работают и выглядят корректно:

- [ ] /login + /change-password
- [ ] /warehouse (list + item card + history + inventory audit)
- [ ] /shipments (list + form + receive)
- [ ] /china (purchases + catalog)
- [ ] /molds (list + card + use)
- [ ] /blanks (hw + pkg)
- [ ] /colors
- [ ] /marketplaces
- [ ] /bugs (list + create + attachment)
- [ ] /templates
- [ ] /production/calendar
- [ ] /production/plan
- [ ] /indirect-costs
- [ ] /orders (list + editor — все табы)
- [ ] /factual (если отдельная страница)
- [ ] /tasks (list + card)
- [ ] /projects + /areas
- [ ] /gantt
- [ ] /time-tracking
- [ ] /vacations
- [ ] /payroll
- [ ] /analytics (все отчёты)
- [ ] /settings

Для каждого: открыть, поработать в нём (создать-обновить-удалить), убедиться что ничего не падает.

Зафиксировать баги в bug reporter (на staging) — фиксить в Stage B branch.

---

## Task 5: Performance check

На staging запустить:

```bash
# Замер времени ответа на типовые эндпойнты (на VPS):
for endpoint in /api/warehouse/items /api/orders /api/tasks /api/health; do
  echo $endpoint
  for i in 1 2 3 4 5; do
    curl -o /dev/null -s -w "%{time_total}s\n" -b /tmp/cookie.txt https://ops-staging.recycleobject.ru$endpoint
  done
done
```

- [ ] Все p95 ≤ 200 мс. Если медленно — профилировать (Postgres `EXPLAIN ANALYZE` на медленные запросы, добавить индексы).
- [ ] Размер БД, размер S3 — нормальные.

---

## Task 6: Двойной smoke — параллельная работа

В течение **последней недели Stage B** выбрать 1-2 сотрудников (включая ту, что в России со складом), попросить их:
- Залогиниться в ops-staging.recycleobject.ru
- Поработать там 30 мин — посмотреть склад, открыть пару заказов, попробовать что-то.
- Записать все странности.

Это «доработка финальной шероховатости перед cutover».

- [ ] Зафиксировать обратную связь, исправить блокирующие косяки. Стилистика/wording — оставить на потом.

---

## Task 7: Подготовка к cutover

- [ ] Запланировать день cutover'а: вечер пятницы или субботы.
- [ ] Объявить сотрудникам за неделю.
- [ ] Подготовить **репетицию cutover'а** на staging накануне (см. Stage C).
- [ ] Создать чек-лист на cutover-день (см. Stage C plan).
- [ ] Подтвердить что Supabase Pro и Vercel подписки можно остановить — но **не отключать сейчас**.

---

## Acceptance Criteria

- [ ] Все автотесты зелёные (≥ 200 тестов суммарно)
- [ ] 20/20 golden masters
- [ ] 10/10 ручная сверка реальных заказов копейка в копейку
- [ ] Все 20+ экранов обойдены, критических багов нет
- [ ] p95 latency ≤ 200 мс
- [ ] Свежий refresh staging проведён в последние 48 часов
- [ ] План на cutover-день готов и утверждён
- [ ] Сотрудники проинформированы о дате
