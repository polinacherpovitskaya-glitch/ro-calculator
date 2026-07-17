# Runbook: preflight и репетиция миграции Supabase → Yandex

Этот документ — **не команда на переключение**. Он определяет, что должно быть выполнено и записано до объявления 30-минутного фриза.

## Роли и границы

- Оператор migration запускает команды только на staging, пока владелец не дал отдельное «поехали» для production.
- Владелец утверждает окно фриза только после заполнения всех go/no-go пунктов ниже.
- Старый Supabase не выключается и не удаляется минимум две недели после успешного cutover.
- Ключи, DB URL и OAuth tokens не попадают в Git, логи, Figma или чат.

## A. До репетиции — обязательные факты

- [ ] Создан новый self-hosted Supabase на Yandex VM и `db.recycleobject.ru` отвечает по HTTPS.
- [ ] Сгенерированы новые `JWT_SECRET`, anon/service keys; они сохранены только в approved secret storage.
- [ ] Ночной `pg_dump` в приватный Yandex bucket и health alert проверены на новом стенде.
- [ ] Получен свежий полный backup старого Supabase; его summary и checksum доступны оператору.
- [ ] Storage inventory содержит число объектов, размер и checksum/path manifest для всех buckets, включая `mold-photos`, `product-images`, `bug-attachments`, `site-content`, `molds-3d`, `templates`, `mold-thumbnails`.
- [ ] Есть staging URL, который не использует production `calc`/`calc2` и не принимает рабочие записи сотрудников.

## B. Read-only preflight текущих данных

Выполнить из checkout конкретного commit, который будет использован для rehearsal:

```sh
node scripts/audit-order-item-data-jsonb.mjs \
  --out output/order-item-data-preflight.json
```

Ожидаемый результат: `safe: true`, `unsafeRows: 0`. Отчёт хранит только ID проблемных строк, не содержимое заказов.

**Стоп:** любой `doubleEncodedObject`, `invalid`, `arrayOrScalar` или `missing` — не запускать `ALTER`. Сначала создать отдельный normalisation-пакет, выполнить его на staging и повторить аудит.

## C. Репетиция `TEXT -> JSONB` на staging

1. Восстановить свежий backup в пустую staging БД.
2. Сохранить до-migration counts и отчёт аудита.
3. Выполнить SQL:

```sh
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/migrations/2026-07-17-order-items-item-data-jsonb.sql
```

4. Проверить результат:

```sh
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  SELECT data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'item_data';"

psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  SELECT jsonb_typeof(item_data) AS kind, count(*)
  FROM order_items
  GROUP BY 1
  ORDER BY 1;"
```

Ожидание: тип `jsonb`, единственная группа `object`, количество строк равно до-migration count. Backup-таблица `order_items_item_data_pre_jsonb_20260717` существует и содержит столько же строк.

5. Обязательно репетировать rollback на отдельной восстановленной копии:

```sh
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/migrations/2026-07-17-order-items-item-data-jsonb-rollback.sql
```

Ожидание: тип снова `text`; значение каждой строки равно backup. Не удалять backup-таблицу во время rehearsal.

## D. Функциональная репетиция после JSONB

- [ ] Открыть cold browser session на staging и сверить список, доску и карточку fixture-заказов: скидка, два цвета, `setup_hours_override`, legacy-печать, фурнитура, упаковка, подвес.
- [ ] Создать тестовый заказ через `calc`-копию: сохранить, reload, открыть в списке и карточке, удалить тестовую запись.
- [ ] Повторить сохранение/reload через `calc2`-копию и убедиться, что запись появляется в том же источнике данных.
- [ ] Прикрепить новое фото к NFC-квадрату: дождаться upload, сохранить карточку, reload в чистой вкладке и открыть итоговый URL напрямую.
- [ ] Проверить отключённые бланки: они не входят в Figma-каталог, но сохраняются внизу списка калькулятора.
- [ ] Подменить URL в копии Figma-плагина новыми staging credentials, импортировать пакет в тестовый Figma-файл и нажать «Обновить каталог».

**Стоп:** любое несоответствие расчёта, потеря сохранённой записи, старое фото после reload или отсутствие объекта Storage — no-go.

## E. Storage и URL rewrite dry-run

- [ ] Скопировать Storage теми же key paths; до переключения не менять публичный домен в данных.
- [ ] Сформировать dry-run report: старый host, новый host, таблица/JSON path, количество замен, пропуски.
- [ ] Проверить минимум по одному `photo_url`, `glb_url`, `template_url`, `grey_thumb_url` и по URL в settings blobs.
- [ ] Сделать DB backup непосредственно перед применением URL rewrite.
- [ ] Применять replacement только транзакционным/идемпотентным скриптом, который сначала сохраняет отчёт изменений.

## F. Go / no-go перед production фризом

Все пункты должны быть `да`:

1. Read-only audit без unsafe строк.
2. Restore + JSONB migration + rollback успешно отрепетированы и измерены.
3. Storage inventory и пробные URL открываются с нового домена.
4. calc, calc2 и Figma staging-flow сохраняют и читают одни и те же данные.
5. CI на release commit зелёный: deploy, live smoke, Yandex static sync, Yandex mirror smoke, Yandex write-back smoke.
6. Есть назначенный оператор, канал связи с сотрудниками и подтверждённое окно.
7. Старый Supabase остаётся доступным read-only две недели; способ возврата URL+key проверен на staging.

Если хотя бы один пункт «нет», фриз не объявляется.

## G. Production cutover — только после отдельного подтверждения

Тогда и только тогда: объявить фриз, снять финальный backup, повторить audit, применить SQL и URL replacement, переключить конфиги потребителей, выполнить smoke, а затем открыть доступ. Порядок и реальные команды должны быть дополнены после того, как будут известны VM, домен, secret storage и staging rehearsal; придумывать эти значения заранее запрещено.

## H. Emergency rollback

1. Не маскировать проблему новым cache/локальным fallback.
2. Вернуть приложения и proxy на прежний `SUPABASE_URL` + anon key из проверенного secret store.
3. Если JSONB migration стала причиной, выполнить rollback SQL **на новом стеке**, используя backup-таблицу.
4. Сообщить сотрудникам о возврате на старый источник, сохранить логи и не повторять cutover без новой rehearsal.

Rollback не требует удаления нового Storage или нового Postgres; они сохраняются для расследования.
