# План: удалить неиспользуемый AI runtime сайта Recycle Object

## Source

- Spec:
  [`docs/specs/2026-08-05-yandex-ai-runtime-cutover.md`](../specs/2026-08-05-yandex-ai-runtime-cutover.md)
- Parent plan:
  [`docs/plans/2026-08-04-russia-cloud-consolidation.md`](2026-08-04-russia-cloud-consolidation.md)
- External repo: `polinacherpovitskaya-glitch/recycle-object-site`.

## Tasks

- [x] Зафиксировать production source сайта в Git и проверить clean build.
- [x] Удалить Google Fonts runtime и self-host Montserrat/Alfa Slab One.
- [x] Подтвердить с владельцем, что AI-генератор описаний не используется.
- [x] Удалить AI-кнопку, client handler и server route; ручное поле сохранить.
- [x] Обновить cloud-provider smoke на fail-closed проверку отсутствия AI.
- [x] Пройти lint, Next production build и Vercel preview.
- [x] Merge site PR `#7` и дождаться Vercel production Ready.
- [x] Проверить production admin editor без сохранения карточки товара.
- [x] Удалить `GEMINI_API_KEY`, `YANDEX_AI_API_KEY` и
  `YANDEX_AI_FOLDER_ID` из Vercel.
- [x] Удалить неиспользованный scoped Yandex API key.
- [x] Повторно проверить env inventory без вывода значений secrets.
- [x] Пройти полный public live audit: 122 URL / 41 mold, 0 ошибок.
- [x] Зафиксировать evidence в parent plan/status и поднять версию калькулятора.

## Validation

```sh
npm run test:cloud-providers
npm run lint -- 'app/admin/products/[id]/edit/page.tsx' \
  scripts/cloud-provider-smoke.mjs
npm run build
node scripts/audit-live-site.mjs
node tests/version-smoke.js
```

## Stop-and-fix rules

- Не изменять существующие product descriptions при удалении UI/runtime.
- Не удалять database, Storage или rollback providers в этом изменении.
- Не печатать и не сохранять в артефакт значения credentials.
- При публичной регрессии откатить только site merge; data plane не трогать.
