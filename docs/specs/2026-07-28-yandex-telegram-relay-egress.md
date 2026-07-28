# Yandex Telegram relay: рабочий egress без Vercel

## Контекст

Timebot и база данных уже работают в Yandex Cloud, но Telegram Bot API временно
доступен через минимальный Vercel relay. Предыдущая версия
`ro-telegram-relay` в Yandex Cloud Function доходила до production-вызова, но
`getMe` завершался `fetch failed` и HTTP 502.

Функция и API Gateway по-прежнему существуют, но не используются timebot. Это
позволяет безопасно проверять новый сетевой путь без влияния на рабочий бот.

Аудит биллинга 28 июля 2026 года показал:

- потребление за последние 30 дней — 1 314,56 ₽;
- потребление в текущем месяце — 1 311,56 ₽;
- баланс — 3 301,15 ₽.

## Цели

1. Проверить Telegram Bot API из существующей Yandex Cloud Function через
   системный HTTPS-клиент Node.js с явным IPv4.
2. Если стандартный serverless egress не работает, проверить ту же функцию в
   пользовательской сети `default`, не переключая production timebot.
3. Автоматизировать canary-деплой и реальный `getMe` через существующий
   `ro-telegram-relay-gateway`.
4. Переключить timebot с Vercel на Yandex только после успешного `getMe`.
5. Сохранить рабочий Vercel relay как rollback до подтверждённой стабильности
   Yandex-пути.
6. После стабильного cutover удалить Vercel relay и его runtime secret.

## Не цели

- Не менять UX timebot или страницы учёта времени.
- Не менять таблицы `employees` и `time_entries`.
- Не останавливать работающий timebot во время canary-тестов.
- Не создавать вторую постоянную VM без отдельного решения.
- Не удалять Vercel-функцию до успешной production-проверки Yandex relay.

## Архитектура canary

```text
GitHub Actions
      │ deploy unused latest version
      ▼
Yandex API Gateway: ro-telegram-relay-gateway
      │ secret path prefix
      ▼
Yandex Cloud Function: ro-telegram-relay
      │ HTTPS, IPv4 only
      ▼
Telegram Bot API: getMe
```

Рабочий `ro-timebot` во время canary продолжает использовать Vercel. Только
после зелёного `getMe` workflow записывает Yandex Gateway URL в runtime env
timebot и перезапускает контейнер.

## Сетевой клиент

Relay использует `node:https` вместо глобального `fetch`:

- `family: 4` фиксирует поддерживаемый Cloud Functions IPv4 egress;
- timeout уничтожает сокет и не оставляет зависшие long-poll запросы;
- в логи попадают только безопасные поля `operation`, `status`, `errorCode` и
  `addressFamily`;
- bot token, relay secret и полный URL не логируются;
- request/response headers остаются ограничены существующим allowlist;
- upstream остаётся фиксированным `https://api.telegram.org`.

## Canary-деплой

Отдельный workflow:

1. запускает unit и smoke tests;
2. создаёт новую версию существующей функции;
3. сохраняет текущий secret prefix из GitHub Secrets;
4. выполняет `getMe` через существующий API Gateway;
5. при ошибке стандартного egress создаёт canary-версию с
   `--network-name default` и повторяет `getMe`;
6. публикует диагностический artifact без секретов.

Canary workflow не изменяет env работающего timebot и не перезапускает его.

## Cutover и rollback

После успешного canary:

1. `yandex-timebot-deploy.yml` получает Yandex Gateway base URL.
2. Workflow проверяет `getMe` до перезапуска контейнера.
3. Timebot перезапускается с прежним persistent volume.
4. Health monitor подтверждает свежий heartbeat, Telegram и Yandex DB.
5. Vercel relay остаётся доступным на период наблюдения.

Rollback выполняется заменой одного `TELEGRAM_BASE_API_URL` обратно на Vercel и
повторным деплоем timebot. Данные и состояние отчётов остаются в Yandex.

## Приёмочные критерии

- Relay unit tests покрывают IPv4 HTTPS-клиент, body/query/header forwarding,
  timeout и безопасную диагностику.
- Canary `getMe` возвращает `@Recycle_object_calc_bot`.
- Canary не перезапускает и не меняет production timebot.
- После cutover health workflow подтверждает `polling`, `telegram_ok` и
  `database_ok`.
- Не возникает polling conflict 409.
- Контрольная запись часов проходит через бота и появляется в Yandex DB.
- За период наблюдения нет повторяющихся relay timeout.
- Vercel relay удаляется только после выполнения всех предыдущих критериев.

