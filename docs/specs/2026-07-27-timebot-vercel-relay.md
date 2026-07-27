# Timebot: Vercel relay после отказа Yandex Cloud

## Контекст

Перенос timebot на Ops VPS из
[`2026-07-27-timebot-server-migration.md`](2026-07-27-timebot-server-migration.md)
дошёл до production cutover, но проверка `getMe` через Yandex Cloud завершилась
HTTP 502. Gateway и функция отвечают на невалидные пути собственным JSON, однако
валидный запрос зависает до upstream timeout. Это подтверждает, что среда Yandex
Cloud, как и Ops VPS, не может установить соединение с Telegram.

Локальный LaunchAgent после неудачной попытки снова включён, поэтому бот остаётся
доступен до следующего cutover.

## Цели

1. Разместить защищённый Telegram relay в существующем Vercel-проекте
   `calc.recycleobject.ru`.
2. Сохранить текущую модель безопасности: случайный path prefix, фиксированный
   upstream `https://api.telegram.org` и строгий allowlist Telegram Bot API путей.
3. Передавать `TELEGRAM_RELAY_SECRET` в Vercel Function только как runtime secret.
4. Переключить Ops deploy на Vercel relay и ждать его production-готовности перед
   запуском `ops-timebot`.
5. Не отключать локальный бот, пока новый relay не прошёл реальный `getMe`.

## Не цели

- Не менять UX бота или страницы `#timetrack`.
- Не менять Supabase-схему и существующие записи часов.
- Не переносить taskbot.
- Не использовать Yandex Cloud relay как fallback: он доказанно не достигает
  Telegram из production.
- Не удалять уже созданные Yandex Function и API Gateway в этом изменении.

## Архитектура

```text
Telegram Bot API
       ▲
       │ HTTPS
Vercel Function: /api/telegram-relay
       ▲
       │ /api/telegram-relay/<secret>/bot<TOKEN>/<method>
ops-timebot на Ops VPS
       │
       └── Supabase → calc2.recycleobject.ru/#timetrack
```

`vercel.json` переписывает wildcard-путь relay на единственную Node.js Function.
Функция преобразует Vercel request в существующий проверенный relay handler.
Приложение не является универсальным proxy: upstream и допустимая форма пути
остаются зафиксированными в коде.

## Runtime и deploy

- Function: `api/telegram-relay.js`.
- Rewrite:
  `/api/telegram-relay/:relay_path*` →
  `/api/telegram-relay?relay_path=:relay_path*`.
- Function max duration: 45 секунд.
- Telegram upstream timeout: 38 секунд.
- Bot polling timeout: 20 секунд.
- `Deploy GitHub Pages` передаёт `TELEGRAM_RELAY_SECRET` через `vercel deploy
  --env`; значение не коммитится.
- `Deploy ops stack` ждёт успешный `getMe` на production domain с повторами,
  после чего записывает Vercel base URL в серверный `.env.timebot`.

## Body и ответы

Timebot использует `node-telegram-bot-api`, который отправляет обычные методы
через `application/x-www-form-urlencoded`. Vercel adapter восстанавливает такую
форму из `request.body`, сохраняет query-параметры и передаёт бинарный ответ
Telegram без изменения. Multipart upload не нужен текущему timebot и остаётся
вне scope этого cutover.

## Безопасность

- Relay secret сверяется timing-safe сравнением в общем handler.
- Bot token допускается только внутри валидного Telegram API path.
- Произвольный origin, protocol или URL нельзя передать параметром.
- В upstream уходят только `accept`, `content-type` и `user-agent`.
- Логи содержат Telegram method и HTTP status, но не token и не secret.
- Workflow маскирует relay base URL и использует GitHub secrets для token/secret.

## Rollback

Если production `getMe` или server health check не проходят:

1. не выключать либо снова включить локальный
   `com.recycleobject.timebot.v2`;
2. остановить `ops-timebot`;
3. оставить Supabase и сохранённые часы без изменений;
4. исправить relay forward-only новым release.

## Приёмочные критерии

- Unit-тесты покрывают Vercel adapter, URL-encoded body, query и бинарный ответ.
- Smoke test проверяет wildcard rewrite, max duration и отсутствие Yandex deploy
  в Ops workflow.
- Production `getMe` через `calc.recycleobject.ru` возвращает
  `@Recycle_object_calc_bot`.
- `ops-timebot` работает после отключения локального LaunchAgent.
- В логах нет polling conflict 409 и повторяющихся transport timeout.
- `/status` отвечает, а новая тестовая запись появляется в Supabase и
  `calc2/#timetrack`.
