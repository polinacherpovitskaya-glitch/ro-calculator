# Перенос taskbot с локального Mac в Yandex Cloud

## Контекст

После основного cutover калькулятора на Yandex в managed Supabase сохранился
регулярный read traffic к `task_notification_events`. Источником оказался
старый LaunchAgent `com.recycleobject.taskbot.v2` на рабочем Mac: он запускает
legacy `bot/taskbot.js`, использует Supabase SDK и опрашивает очередь каждые
15 секунд.

Текущий `ops/bot/taskbot.js` уже работает через собственный Ops API и не
требует Supabase. На Yandex VM развёрнут `ro-timebot`, но отдельный taskbot
уведомлений там пока отсутствует. Простая остановка LaunchAgent нарушит
Telegram-уведомления, поэтому нужен отдельный безопасный cutover.

## Цель

Запустить единственный production taskbot на Yandex VM, перевести его на
Yandex PostgreSQL через приватный Ops API и прекратить регулярные обращения
legacy poller к managed Supabase без удаления исходных данных или rollback
конфигурации.

## Решение

1. Существующий workflow `Yandex timebot deploy` разворачивает два независимых
   контейнера из одного проверенного runtime image:
   - `ro-timebot` — учёт времени;
   - `ro-taskbot` — уведомления по задачам.
2. `ro-taskbot` получает только:
   - `TASK_BOT_TOKEN` из GitHub Secret как `TG_BOT_TOKEN`;
   - URL защищённого Vercel Telegram relay;
   - приватный `OPS_API_URL` и `OPS_BOT_TOKEN`.
3. В контейнер не передаются `SUPABASE_*` или `DATABASE_URL`.
4. Перед запуском Yandex poller локальный LaunchAgent выгружается через
   `launchctl bootout`, но plist, `.env` и исходники остаются на месте как
   немедленный rollback.
5. После запуска workflow проверяет container status, отсутствие restart,
   startup logs, API connectivity и отсутствие legacy credentials.
6. Пятиминутный health workflow контролирует оба контейнера, Telegram relay,
   Yandex API и PostgreSQL.

## Сохранность и единственный poller

- `task_notification_events` хранится в Yandex PostgreSQL; taskbot не имеет
  локального mutable state.
- Старый Supabase, локальный plist и локальный `.env` не удаляются.
- Одновременно нельзя держать два процесса с одним Telegram token: Telegram
  вернёт conflict 409. Поэтому cutover выполняется как короткое окно между
  `bootout` локального poller и успешным стартом `ro-taskbot`.
- Если Yandex deploy или проверка не проходят, `ro-taskbot` останавливается, а
  локальный LaunchAgent возвращается командой `launchctl bootstrap`.
- Никакое событие не удаляется до успешной отправки: worker помечает событие
  обработанным только после прохода delivery loop.

## Границы scope

Входит:

- production deployment `ro-taskbot` на существующую Yandex VM;
- перенос Telegram polling и task event reads на Yandex;
- CI/health checks и rollback runbook;
- фиксация результата в программе cloud consolidation.

Не входит:

- изменение текстов или бизнес-логики уведомлений;
- объединение timebot и taskbot в один Telegram token;
- удаление managed Supabase или локальных rollback-файлов;
- изменение схемы `task_notification_events`.

## Приёмочные критерии

- `ro-timebot` и `ro-taskbot` имеют status `running` и restart count `0` после
  cutover.
- В логах taskbot есть успешный startup и нет conflict 409 / missing env.
- `ro-taskbot` читает очередь через `ro-platform-shadow-api:3000`.
- В taskbot container отсутствуют `SUPABASE_*` и `DATABASE_URL`.
- Локальный `com.recycleobject.taskbot.v2` не загружен, но его plist и env
  сохранены.
- Managed Supabase logs перестают получать 15-секундный запрос
  `task_notification_events ... processed_at=is.null` от Node.
- Основные live/site/mirror smokes остаются зелёными.

## Rollback

1. Остановить `ro-taskbot` на Yandex VM.
2. Вернуть локальный LaunchAgent через `launchctl bootstrap`.
3. Убедиться, что единственный poller запущен без 409.
4. Managed Supabase и сохранённые credentials остаются доступными только для
   этого аварийного rollback до окончания окна наблюдения.
