# Timebot: перенос с локального Mac на постоянный сервер

> Статус relay-части: Yandex Cloud deploy 27 июля 2026 года не прошёл production
> `getMe`, потому что функция также не достигает Telegram. Продолжение и
> актуальная архитектура описаны в
> [`2026-07-27-timebot-vercel-relay.md`](2026-07-27-timebot-vercel-relay.md).

## Контекст

Timebot для учёта часов сейчас запускается через `launchd` на рабочем Mac. Когда
компьютер выключен, перезагружается, спит или теряет сеть, Telegram long polling
останавливается. `launchd` перезапускает процесс после входа пользователя, но не
может обеспечить доступность во время простоя самого компьютера.

27 июля 2026 года это привело к повторному инциденту: Mac загрузился только в
09:57, а бот и напоминания до этого были недоступны. Незавершённый отчёт за
24 июля не дошёл до финального сохранения.

Ops VPS уже работает постоянно, но его прямые соединения к
`api.telegram.org:443` блокируются. В Yandex Cloud уже развёртываются функции и
API Gateway через GitHub Actions, поэтому Telegram-трафик можно безопасно
ретранслировать через отдельную функцию.

## Цели

1. Запускать `timebot.js` как отдельный Docker-сервис `ops-timebot` на Ops VPS.
2. Сохранить текущую рабочую Supabase-базу источником часов, чтобы записи сразу
   появлялись в `https://calc2.recycleobject.ru/#timetrack`.
3. Направить Telegram Bot API через отдельный Yandex Cloud relay, защищённый
   случайным секретом в URL.
4. Хранить `timebot.state.json`, `timebot.pending.json` и входящий журнал в
   постоянном Docker volume.
5. Автоматизировать деплой relay и серверного timebot через GitHub Actions.
6. После успешного cutover отключить локальный `launchd`-экземпляр, чтобы не
   возникал Telegram polling conflict 409.

## Не цели

- Не переносить данные `calc2` из Supabase в Ops Postgres.
- Не менять схему `employees` или `time_entries` в Supabase.
- Не объединять timebot и отдельный taskbot.
- Не менять UX страницы учёта времени.
- Не создавать новый платный VM: используются существующий Ops VPS и
  serverless-инфраструктура Yandex Cloud.

## Архитектура

```text
Telegram
   │
   ▼
Yandex API Gateway
   │  секретный path prefix
   ▼
Yandex Cloud Function: ro-telegram-relay
   │
   ▼
ops-timebot на Ops VPS
   │
   ├── Docker volume: state / pending / inbox
   │
   └── Supabase: employees / orders / time_entries / settings
                         │
                         ▼
              calc2.recycleobject.ru/#timetrack
```

`node-telegram-bot-api` поддерживает `baseApiUrl`. Timebot продолжает работать в
режиме long polling, но вместо прямого `https://api.telegram.org` использует URL
relay. Relay принимает только пути Telegram Bot API, не является универсальным
прокси и не выводит токены или секретный префикс в логи.

## Runtime и данные

- Новый compose service: `timebot`, profile `timebot`.
- Команда: `node timebot.js`.
- Переменные:
  - `TIMEBOT_TOKEN`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `TELEGRAM_BASE_API_URL`
  - `TELEGRAM_REQUEST_FAMILY`
  - `TELEGRAM_REQUEST_TIMEOUT_MS`
  - `TELEGRAM_POLL_TIMEOUT_SECONDS`
  - `TIMEBOT_STATE_DIR=/app/state`
- Volume: `timebot-state:/app/state`.
- `SUPABASE_SERVICE_KEY` уже используется серверным refresh-процессом и остаётся
  только в `/srv/ops/infra/.env`.
- `TIMEBOT_TOKEN` и `TELEGRAM_RELAY_SECRET` хранятся как GitHub Actions secrets.
- GitHub Actions доставляет на VPS отдельный `/srv/ops/infra/.env.timebot` с
  правами `0600`; файл не попадает в rsync и git.

## Надёжность

- Docker `restart: unless-stopped`.
- Состояние отчёта и резервная очередь переживают пересборку контейнера.
- Polling timeout уменьшается до значения, безопасного для API Gateway relay.
- Relay отвечает кодом upstream Telegram и сохраняет бинарные ответы.
- Деплой проверяет relay через `getMe`, затем запускает контейнер и проверяет,
  что он остаётся в состоянии `running`.
- Локальный bot отключается только во время финального cutover.

## Безопасность

- Relay принимает запросы только под `/<TELEGRAM_RELAY_SECRET>/bot...` и
  `/<TELEGRAM_RELAY_SECRET>/file/bot...`.
- Upstream фиксирован: только `https://api.telegram.org`.
- Не поддерживаются произвольные URL и CONNECT.
- Секреты не печатаются в workflow и не передаются в аргументах SSH-команды.
- В логах relay фиксируются только метод запроса, Telegram method и код ответа.

## Деплой и rollback

1. GitHub Actions создаёт/обновляет `ro-telegram-relay` и
   `ro-telegram-relay-gateway`.
2. Workflow проверяет `getMe` через relay.
3. Workflow копирует `.env.timebot` на Ops VPS.
4. Compose пересобирает и запускает только `timebot`.
5. Локальный LaunchAgent отключается после готовности server-side runtime.

Rollback:

- остановить `ops-timebot`;
- снова загрузить локальный LaunchAgent;
- при необходимости удалить публичный доступ к relay-функции;
- Supabase-данные и уже записанные часы не меняются.

## Приёмочные критерии

- Unit-тесты relay покрывают авторизацию пути, path allowlist, query/body/header
  forwarding и upstream errors.
- Bot runtime-тесты покрывают `TELEGRAM_BASE_API_URL`, polling timeout и state
  directory.
- `ops-timebot` работает на VPS после отключения локального LaunchAgent.
- `getMe` через Yandex relay возвращает `@Recycle_object_calc_bot`.
- В логах нет polling conflict 409 и повторяющихся transport timeout.
- `/status` отвечает существующему сотруднику.
- Тестовая запись через бот появляется в Supabase и на странице `#timetrack`.
- Напоминания продолжают использовать активные `employees.telegram_id`.
