# Yandex AI runtime cutover for `recycleobject.ru`

## Context

После переноса database/Auth/Storage сайта Recycle Object в Yandex последней
обнаруженной production-зависимостью от Google оставался административный
генератор описаний товаров. Он отправлял в Gemini название, категорию и полное
изображение товара. Браузер каждого посетителя также загружал Montserrat и
Alfa Slab One с Google Fonts.

Целевой постоянный perimeter уже согласован владельцем: Yandex Cloud, Vercel и
Telegram. Vercel остаётся разрешённым frontend/runtime, но AI и customer data
не должны требовать Google Cloud или доступа к Google endpoints из России.

## Decision

- Генерация описаний выполняется через YandexGPT 5 Lite в том же российском
  Yandex folder, что и остальная инфраструктура.
- Отдельный service account получает только роль `ai.languageModels.user`, а
  API key ограничен scope `yc.ai.languageModels.execute` и сроком действия.
- В AI отправляются только нормализованные название и категория товара. Фото,
  Storage URL и binary data не передаются.
- Для запроса явно задан `x-data-logging-enabled: false`.
- Montserrat и Alfa Slab One поставляются внутри Vercel build через Fontsource;
  browser runtime больше не обращается к Google Fonts.
- `GEMINI_API_KEY` удаляется из Vercel только после успешного production deploy
  и контрольной генерации через YandexGPT.

## Scope boundaries

- База данных, Auth, Storage, платежи и webhook state не изменяются.
- Managed Supabase, Google/Firebase и другие rollback sources этим изменением
  физически не удаляются.
- Одноразовые локальные image-generation scripts не являются production
  runtime и не входят в этот cutover; они не получают Vercel credentials.
- Реальный платёж, отправка Telegram/email и создание заказа в smoke не
  выполняются.

## Security and rollback

- Значение Yandex API key не попадает в Git, логи, manifests или smoke output.
- Ошибки route логируют только HTTP status, request id или класс исключения,
  но не response body и не credentials.
- До контрольной production-генерации старый Gemini env сохраняется как быстрый
  rollback. После проверки он удаляется из Development, Preview и Production.
- Кодовый rollback — `git revert` merge commit сайта и повторный deploy. Если
  понадобится временно вернуть Gemini, credential должен быть добавлен заново
  отдельным одобренным действием.

## Acceptance criteria

- Vercel preview и production deploy имеют статус Ready.
- `recycleobject.ru` проходит полный public live audit.
- Административный route возвращает непустое русское описание через YandexGPT.
- В браузере production отсутствуют `fonts.googleapis.com` и
  `fonts.gstatic.com`, а оба шрифта успешно загружены локально.
- Runtime route не содержит Gemini URL, `GEMINI_API_KEY`, image fetch или
  base64 encoding.
- `GEMINI_API_KEY` отсутствует во всех Vercel environments после smoke.
- Никакие database/Storage rows или objects не меняются этим cutover.
