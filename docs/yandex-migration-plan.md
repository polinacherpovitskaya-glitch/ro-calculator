# Yandex Migration Plan

Цель: постепенно перенести рабочие данные Recycle Object ближе к российским сотрудникам, не ломая основной сайт и не теряя записи.

## Текущая схема

- `calc.recycleobject.ru` открывает тот же фронтенд и пока работает напрямую с Supabase.
- `calc2.recycleobject.ru` открывает Yandex Object Storage mirror и ходит к Supabase через Yandex API Gateway + Cloud Function proxy.
- Оба сайта сейчас пишут в одну общую Supabase-базу, поэтому данные должны быть общими.
- `Yandex write-back smoke` уже проверяет, что запись через `calc2`/Yandex proxy появляется в общей Supabase-базе.

## Принцип миграции

1. Сначала считаем и экспортируем данные, не меняя прод.
2. Потом поднимаем российское хранилище и импортируем туда копию.
3. Потом включаем dual-read/dual-write для одного модуля.
4. Потом переключаем модуль на Яндекс как источник истины.
5. Только после нескольких зеленых smoke и ручной проверки двигаемся к следующему модулю.

## Приоритеты модулей

1. Склад, Китай, приемки, списания, фурнитура для проектов.
2. Заказы, бланки, молды, производственный календарь.
3. Часы, сотрудники, задачи, проекты.
4. Финансы, импорты, исторические данные.
5. Файлы и вложения: фото заказов, молдов, багов.

## Таблицы-кандидаты

Критические рабочие таблицы:

- `settings`
- `employees`
- `orders`
- `order_items`
- `order_factuals`
- `product_templates`
- `time_entries`
- `warehouse_items`
- `warehouse_reservations`
- `warehouse_history`
- `shipments`
- `china_purchases`
- `china_orders`
- `app_vacations`
- `molds`
- `app_colors`
- `hw_blanks`
- `pkg_blanks`
- `marketplace_sets`

Рабочий модуль задач и багов:

- `areas`
- `projects`
- `tasks`
- `task_comments`
- `work_assets`
- `task_checklist_items`
- `task_watchers`
- `work_activity`
- `work_templates`
- `task_notification_events`
- `bug_reports`

Финансы:

- `finance_sources`
- `finance_accounts`
- `finance_categories`
- `finance_directions`
- `finance_counterparties`
- `finance_transactions`
- `finance_transaction_links`
- `finance_rules`
- `finance_manual_decisions`
- `bank_sync_runs`
- `bank_accounts`
- `bank_transactions`
- `legacy_finance_import_runs`
- `legacy_finance_transactions`
- `fintablo_imports`

Исторические/резервные таблицы:

- `app_tasks`
- `ready_goods`
- `ready_goods_history`
- `sales_records`
- `app_config`

Storage buckets отдельно:

- `product-images`
- `mold-photos`
- `bug-attachments`

## Уже сделано

- `calc2.recycleobject.ru` живет в Yandex Object Storage.
- Для `calc2` включен Yandex proxy к Supabase.
- Есть `Yandex mirror smoke` на загрузку.
- Есть `Yandex write-back smoke` на сохранение через Yandex proxy.
- Write-back smoke покрывает служебную запись, склад, приемку, Китай и молды.
- Есть `Yandex migration snapshot`: inventory/full снимок Supabase перед переносом.
- Есть приватная Yandex backup-цель для migration snapshot: следующий шаг перед импортом в Yandex PostgreSQL.
- Полные Yandex backup snapshot ограничены retention: храним последние 7 файлов, чтобы storage не рос бесконечно.

## Следующие шаги

1. Запускать snapshot/inventory перед каждым шагом миграции.
2. Складывать полный sanitized snapshot в приватный Yandex bucket, не в публичный `calc2.recycleobject.ru`.
3. Добавить Yandex PostgreSQL или другой российский backend как новую базу-кандидат.
4. Импортировать туда snapshot и сверить row counts.
5. Добавить smoke `Supabase -> Yandex parity`: количество строк и контрольные записи совпадают.
6. Включить dual-write для склада: Supabase остается источником истины, Яндекс получает копию.
7. После нескольких дней зеленого мониторинга переключить `calc2` на чтение склада из Яндекса.
8. Повторить по модулям.

## Что нельзя делать резко

- Нельзя одним коммитом заменить Supabase на Яндекс для всех модулей.
- Нельзя переносить только UI без проверки write-back.
- Нельзя забывать storage-файлы: фото и вложения не всегда лежат в SQL-таблицах.
- Нельзя выкладывать полный snapshot с чувствительными настройками в публичные артефакты.
- Нельзя хранить полный snapshot в GitHub artifacts: он должен уходить только в приватный Yandex bucket, а в GitHub можно оставлять только summary.
