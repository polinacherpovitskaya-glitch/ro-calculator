# План: Yandex AI runtime cutover сайта Recycle Object

## Source

- Spec:
  [`docs/specs/2026-08-05-yandex-ai-runtime-cutover.md`](../specs/2026-08-05-yandex-ai-runtime-cutover.md)
- Parent plan:
  [`docs/plans/2026-08-04-russia-cloud-consolidation.md`](2026-08-04-russia-cloud-consolidation.md)
- External repo: `polinacherpovitskaya-glitch/recycle-object-site`.

## Tasks

- [x] Зафиксировать production source сайта в Git и проверить clean build.
- [x] Создать отдельный Yandex service account с минимальной AI-ролью.
- [x] Создать scoped API key с finite expiry и сохранить его только в Vercel.
- [x] Отозвать два промежуточных ключа, которые не используются production.
- [x] Заменить Gemini route на text-only YandexGPT 5 Lite.
- [x] Отключить provider-side data logging для каждого AI request.
- [x] Убрать передачу фото/Storage URL из admin editor.
- [x] Перевести Google Fonts на self-hosted Fontsource assets.
- [x] Добавить статический cloud-provider smoke и пройти Next production build.
- [x] Проверить Vercel preview и локальные шрифты в реальном Chrome.
- [x] Merge PR сайта и дождаться production Ready.
- [x] Пройти полный public live audit после production deploy.
- [ ] Выполнить одну контрольную генерацию из авторизованной admin session.
- [ ] Удалить `GEMINI_API_KEY` из Development, Preview и Production Vercel.
- [ ] Повторно проверить env inventory без вывода значений secrets.
- [ ] Зафиксировать evidence в parent plan/status и поднять версию калькулятора.

## Validation

```sh
npm run test:cloud-providers
npx eslint app/api/admin/generate-description/route.ts \
  'app/admin/products/[id]/edit/page.tsx' app/layout.tsx lib/supabase.ts \
  scripts/cloud-provider-smoke.mjs
npm run build
node scripts/audit-live-site.mjs
node tests/version-smoke.js
```

## Stop-and-fix rules

- Не удалять Gemini env до непустого YandexGPT production response.
- При 401/403 Yandex AI проверить service account role, key scope и folder id;
  не расширять роль до editor/admin.
- При публичной регрессии немедленно откатить merge сайта; data plane не
  переключать и backup sources не трогать.
- Не печатать, не сохранять в артефакт и не коммитить API key.
