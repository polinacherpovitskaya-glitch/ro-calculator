# Stage D — Safety Net + Decommission

> **REQUIRED:** Stage C завершён без блокеров, прошло минимум 7 дней спокойной работы.

**Goal:** Окончательно отключить Supabase и Vercel. Подчистить репо от старого кода. После этого Stage происходит **только если** за неделю после cutover'а не было критических проблем.

---

## Task 1: Safety net — наблюдение в течение недели

- [ ] **Не отключать Supabase + Vercel минимум 7 дней после cutover.**
- [ ] Каждый день проверять:
  - /api/health отвечает (UptimeRobot не алёртит)
  - Логи API без error-уровня записей за последние 24 часа
  - Сотрудники не жалуются на «висит» / «не сохраняется»
  - Бэкапы pg_dump делаются ежедневно успешно
- [ ] Если **критическая проблема** — есть возможность откатить:
  - Поменять DNS обратно
  - Включить заново пользователей в Supabase

Если 7 дней спокойно — переходим к Task 2.

---

## Task 2: Финальный snapshot Supabase для архива

Прежде чем отключать Supabase, **сделать финальный полный экспорт всех данных** на случай если когда-то понадобится:

- [ ] В Supabase Studio: SQL Editor → `SELECT * FROM <table>` для каждой таблицы → Export CSV. Или через CLI `pg_dump` если есть доступ к connection string.
- [ ] Сохранить дамп в Selectel Object Storage: bucket `ro-ops-archives/supabase-final-<date>.tar.gz` (или несколько файлов).
- [ ] Записать в README: где лежит, как восстановить если что.

---

## Task 3: Отключить Supabase Pro

- [ ] В Supabase Dashboard → Settings → Billing → Cancel subscription / Pause project
- [ ] Проверить email подтверждения
- [ ] Через 24 часа: убедиться что подписка снята (нет нового списания).

**Альтернатива:** оставить free-tier проект на пару месяцев как архив (доступен только на чтение). После 90 дней Supabase free-tier проектов суспендится — это нормально.

---

## Task 4: Отключить Vercel

- [ ] В Vercel Dashboard → Project Settings → Delete (или пауза, если есть).
- [ ] Удалить интеграции (GitHub deploys, env vars).
- [ ] Если есть платная подписка ($20 Team) — отписаться.

---

## Task 5: Cleanup репо

Создать ветку `stage-D-cleanup` от main.

### Удалить:
- [ ] `js/supabase.js` — основной клиент Supabase
- [ ] `js/finance.js`, `js/fintablo.js`, `js/import.js` (в части finance) — финансовый UI, который мы выкинули
- [ ] `js/wiki.js` — wiki
- [ ] `js/monitoring.js` — monitoring
- [ ] Большую часть `js/tpa.js` (оставить только калькулятор-логику, если она ещё не перенесена в `ops/api/src/calc/tpa.ts`)
- [ ] `api/` (Vercel serverless functions, `bootstrap.js`)
- [ ] `yandex/supabase-proxy/` — старый прокси
- [ ] Все fallback'и в коде:
  - `_fetchJsonWithTimeout`
  - `_loadSameOriginBootstrap`
  - `_isLocalDatasetDirty`
  - `WAREHOUSE_ITEMS_SETTINGS_KEY`
  - `_clearLocalDatasetDirty`
  - и т.п. (см. спеку, секция "Что выкидываем по ходу")
- [ ] `nixpacks.toml` (был для Vercel build)
- [ ] `.vercel/` config

### Очистить в `index.html`:
- [ ] Все скрипты, которые удалены
- [ ] Все tabs для удалённых модулей (`wiki`, `monitoring`, `tpa-кроме-calc`, `finance-*`)

### Оставить (важное!):
- [ ] `ops/` целиком — это наш новый код
- [ ] `docs/` — документация, спеки, планы
- [ ] `tests/playwright/` — e2e
- [ ] `corporate-gift/` — отдельный B2B инструмент, не связан с миграцией
- [ ] `assets/`, `img/`, `vendor/` если используются в ops/web

- [ ] Прогнать `npm test`, `npm run build`, Playwright — всё должно остаться зелёным.

- [ ] Commit: `Remove Supabase/Vercel legacy code after successful migration`
- [ ] PR в main, merge.

---

## Task 6: Финальная очистка от Yandex-mirror

Если `calc2.recycleobject.ru` (Yandex mirror) ещё активен:
- [ ] В Yandex Cloud: остановить Object Storage bucket `calc2.recycleobject.ru`, удалить API Gateway, Cloud Function.
- [ ] Удалить DNS CNAME `calc2 → ...website.yandexcloud.net` (остался от mirror'а).
- [ ] Удалить ACME challenge CNAME `_acme-challenge.calc2`.

---

## Task 7: Обновить документацию

- [ ] `ops/README.md` — финальное состояние: «Production runs on Selectel VPS, Postgres, Caddy. Stage A/B/C/D complete.»
- [ ] `docs/architecture.md` — актуальная диаграмма системы (только Selectel, никаких Supabase/Vercel)
- [ ] Удалить из docs/ устаревшие документы: `yandex-migration-plan.md`, `yandex-migration-readiness.md`, и т.п.

- [ ] Commit: `Update docs for post-migration state`

---

## Task 8: Финальный отчёт

Создать `docs/migration-final-report.md`:

```markdown
# Migration final report

## Timeline
- Start: <date>
- Cutover: <date>
- Decommission: <date>
- Total duration: <X> weeks

## Cost savings
- Before: Supabase Pro $25 + Vercel $X = $Y/month
- After: Selectel VPS + Object Storage = $Z/month
- Savings: $(Y-Z)/month = $((Y-Z)*12)/year

## What we moved
- 16 blocks, ~N tables, ~M storage buckets
- 20+ golden master tests, all green
- 0 data loss incidents

## What we dropped
- Wiki (moved to Notion)
- ТПА (except calc)
- Monitoring (internal dashboard, replaced by UptimeRobot)
- Finance UI (using FinTablo directly)

## Lessons learned
- ...
```

---

## Acceptance Criteria

- [ ] Supabase Pro подписка отключена / на free
- [ ] Vercel deployment удалён или отключён
- [ ] Старый код удалён из репо, тесты остались зелёные
- [ ] Месячная стоимость инфраструктуры ≤ $15
- [ ] Финальный отчёт написан
- [ ] **МИГРАЦИЯ ЗАВЕРШЕНА.** 🎉
