# Final disposition of the unused AI description runtime

## Context

После переноса database/Auth/Storage сайта Recycle Object в Yandex аудит
обнаружил административный генератор описаний товаров на Google Gemini. В
рамках удаления Google runtime его сначала подготовили к text-only YandexGPT,
а Google Fonts заменили на локальные Fontsource assets.

Владелец подтвердил, что команда генератором описаний не пользуется. Поэтому
финальное решение — не поддерживать второй AI runtime, а полностью удалить
неиспользуемую функцию и оба набора credentials.

## Decision

- Описания товаров остаются обычным ручным полем в админке.
- Кнопка AI, client handler и route `/api/admin/generate-description` удалены.
- `GEMINI_API_KEY`, `YANDEX_AI_API_KEY` и `YANDEX_AI_FOLDER_ID` отсутствуют во
  всех Vercel environments.
- Неиспользованный scoped Yandex API key удалён; service account оставлен без
  ключей и не участвует в runtime.
- Montserrat и Alfa Slab One поставляются внутри Vercel build через Fontsource;
  browser runtime не обращается к Google Fonts.

## Scope boundaries

- Существующие названия и описания товаров не переписываются.
- База данных, Auth, Storage, платежи, cron и webhook state не изменяются.
- Managed Supabase, Railway, Google/Firebase и другие rollback sources этим
  изменением физически не удаляются.
- Одноразовые локальные image-generation scripts не являются production
  runtime и не получают Vercel credentials.

## Security and rollback

- Значения credentials не попадают в Git, логи, manifests или smoke output.
- Удаление AI route закрывает server-side credential path вместо поддержки
  неиспользуемой интеграции.
- Кодовый rollback возможен через `git revert`, но возврат AI потребует нового
  отдельного решения и нового credential; старые ключи не восстанавливаются.

## Acceptance criteria

- Site PR с удалением AI merged, Vercel production имеет статус Ready.
- В production admin editor есть ручное поле описания и нет AI-кнопки.
- Route `/api/admin/generate-description` отсутствует в production build.
- В Vercel нет Gemini и Yandex AI environment variables.
- У Yandex service account нет API keys.
- `recycleobject.ru` проходит полный public live audit.
- В браузере отсутствуют Google Fonts runtime requests.
- Никакие database/Storage rows или objects не меняются этим cutover.
