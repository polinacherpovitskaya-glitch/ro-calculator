# Deployment домена калькулятора

Единственный рабочий адрес приложения:

```text
https://calc.recycleobject.ru/
```

`https://calc2.recycleobject.ru/` больше не является зеркалом приложения. Он
получает только лёгкую redirect-страницу и нужен для совместимости со старыми
закладками. Публичная витрина цеха теперь открывается по адресу:

```text
https://calc.recycleobject.ru/floor/
```

## Release flow

1. Push или merge в `main` запускает `Deploy GitHub Pages`.
2. Verify job выполняет repo-local smoke tests. Vercel job отдельно публикует
   только защищённый Telegram relay; он не хостит приложение.
3. После успешного release gate workflow `Calculator static deploy` один раз
   собирает snapshot данных и статический bundle.
4. Bundle загружается только в Object Storage bucket `calc.recycleobject.ru`:
   ассеты параллельно, затем HTML, затем `js/version.json` как финальный маркер.
5. В `calc2.recycleobject.ru` публикуются только redirect entry points
   (`index.html`, `404.html`, `floor/index.html`). Старые объекты не удаляются.
6. После публикации запускаются `Live site smoke`, `Calculator platform smoke`
   и `Calculator write-back smoke`.

У статического deploy приложения нет cron. Он запускается на релиз или вручную,
поэтому неизменившийся код больше не публикуется повторно каждые 30 минут.
Отдельный `Calculator data refresh` обновляет только `data/` и `floor/`, чтобы
резервный snapshot и производственный календарь не устаревали между релизами.
Периодические live/write-back smokes остаются мониторингом доступности и
сохранения данных; они ничего не деплоят.

## Required GitHub secrets

Полная публикация приложения требует:

```text
OPS_BOT_TOKEN
YC_OAUTH_TOKEN
```

Relay-only Vercel job использует:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
TELEGRAM_RELAY_SECRET
```

## Ручной запуск и проверка

Повторно опубликовать текущий `main`:

```sh
gh workflow run "Calculator static deploy"
```

Проверить приложение вручную:

```sh
gh workflow run "Live site smoke" -f live_url=https://calc.recycleobject.ru/
gh workflow run "Calculator platform smoke" -f live_url=https://calc.recycleobject.ru/
gh workflow run "Calculator write-back smoke"
```

Проверка версии и редиректа без браузера:

```sh
curl -fsSL 'https://calc.recycleobject.ru/js/version.json?cb=manual'
curl -fsSL 'https://calc2.recycleobject.ru/?cb=manual'
```

## Cache и порядок публикации

HTML, bootstrap/floor JSON и `js/version.json` всегда получают
`no-cache, no-store, must-revalidate`. Версионированные JS/CSS и изображения
можно кэшировать как immutable. `js/version.json` отправляется последним, поэтому
появление новой версии означает, что её HTML и ассеты уже находятся в бакете.

Начавшийся deploy не отменяется новым запуском: следующий релиз ждёт своей
очереди, чтобы Object Storage не оставался в частично обновлённом состоянии.
