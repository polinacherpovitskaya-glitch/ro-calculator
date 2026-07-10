# Витрина: загрузка месяца по фин-модели

**Дата:** 2026-07-09
**Статус:** утверждён Полиной (дизайн)
**Область:** публичная витрина цеха `calc2.recycleobject.ru/floor/`

## Задача

Цех должен видеть, **как идёт месяц по загрузке относительно фин-модели**: сколько часов надо закрыть за месяц (расчётная загрузка), сколько уже закрыто и сколько осталось — с индикатором **превышаем / в графике / не добираем** по темпу на сегодня. Чтобы ребята понимали, успевают или отстают.

## Данные (проверено на живой базе 2026-07-09)

Все формулы — те же, что в модуле «Факт» (`js/factual.js`), чтобы цифры совпадали с руководством. Витрина уже читает settings и time_entries (anon).

- **Расчётная загрузка / мес** = `workers_count × hours_per_worker × work_load_ratio` (из `getProductionParams`, `js/calculator.js:26–30`). Живой пример: `3.5 × 168 × 0.71 ≈ 417 ч`.
- **Закрыто часов за месяц** = сумма `time_entries.hours` за текущий месяц по производственным записям (`_getFactLoadHoursForPeriod` + `_isProductionLoadEntry` + `_stageKey` + `_isLegacyImportedEntry`, `js/factual.js:1192–1212`). Живой пример июля: ≈ 138 ч (28 записей). NB: у `time_entries` нет поля stage — записи без стадии считаются производственными (legacy), поэтому фактически суммируются все часы месяца.
- **Рабочие дни** — у публикатора уже есть `parseHolidaySet` + `isNonWorking` (выходные + `production_holidays`).

Приватность: только часы. Ни ставок, ни денег.

## Дизайн

### Блок «Загрузка месяца» на доске
Широкая панель вверху доски, между KPI-карточками и календарём. Крупный шрифт (цеховой экран).

- Заголовок: **«Загрузка месяца · <Месяц>»**
- Крупно: **«<closed> из <target> ч»** + прогресс-бар (`closed/target`).
- **Темп:** `closed − expected_by_today`:
  - `> +tolerance` → зелёное «✅ Опережаем на N ч»
  - `< −tolerance` → красное «⚠️ Не добираем N ч»
  - иначе → «В графике»
  - `tolerance = 5% от expected_by_today` (мин. 1 ч).
- **«Осталось до плана: <remaining> ч»** (`max(0, target − closed)`).
- Мелкий хинт: «расчёт по фин-модели · табель за месяц».

### Темп (pace)
- `workingDaysInMonth` = рабочие дни текущего календарного месяца.
- `workingDaysElapsed` = рабочие дни с 1-го числа по сегодня включительно.
- `expected_by_today = target × workingDaysElapsed / workingDaysInMonth`.
- `pace_delta = closed − expected_by_today`.

## Контракт данных (publisher → `plan.json`)

Новое поле `month_load`:
```
month_load: {
  month_label: 'Июль',
  target: 417,              // workLoadHours за месяц
  closed: 138,              // factLoadHours за текущий месяц
  remaining: 279,           // max(0, target - closed)
  pct: 33,                  // round(closed/target*100)
  expected_by_today: 121,   // target * рабочих_дней_прошло / рабочих_дней_в_месяце
  pace_delta: 17,           // closed - expected_by_today (+ опережаем / - отстаём)
  status: 'ahead' | 'on_track' | 'behind'
}
```
Если `target ≤ 0` (нет настроек) — `month_load: null`, блок не показываем.

## Модули (границы)

- **Publisher** (`scripts/production-floor-publish.mjs`): новая чистая функция `buildMonthLoad(settings, timeEntries, today, holidaySet)` → объект выше. Порт `factLoadHours`-логики (стадия/legacy) как локальный helper. Ничего денежного не публикуется.
- **Фронт** (`production-floor/app.js` + `style.css`): рендер панели `month_load` в `renderBoard`.

## Тестирование

- Юнит (в `production-floor-publish-smoke`): фикстура с `settings` (workers/hours/ratio) + `time_entries` за текущий месяц → assert `target/closed/remaining/pct/status`. Проверить границу `target=0 → null`.
- Регрессия: leak-аудит (нет денег/ставок), существующие floor-smoke зелёные.
- Живой прогон публикатора: `month_load` совпадает с ручным расчётом (417 / ~138 / ~279).

## Вне области (YAGNI)

- Разбивка закрытых часов по сотрудникам (можно добавить позже отдельным блоком).
- История по прошлым месяцам / графики трендов.
- Прогноз «успеем ли к концу месяца».
