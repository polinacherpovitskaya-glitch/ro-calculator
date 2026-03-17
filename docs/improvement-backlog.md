# Improvement Backlog

## Source
- Сформирован по итогам сквозного аудита от 2026-03-16 для цепочки `calculator -> orders -> order-detail -> china -> warehouse -> ready goods`, а также отдельной воронки `corporate-gift/`.
- Связанные документы:
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/plans.md`
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/status.md`
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/test-plan.md`
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/auth-remediation-plan.md`
- Last updated: 2026-03-16

## Правила Приоритизации
- `P0`: release-hardening и containment, которые нужно брать раньше новой продуктовой работы.
- `P1`: улучшения следующей итерации, снижающие стоимость повторного аудита и локальных фиксов.
- `P2`: полезные product/UX улучшения, которые не должны размывать текущий stabilization scope.

## P0 - Брать Следующими
| ID | Область | Что показал аудит | Предлагаемое улучшение | Ожидаемый эффект | Валидация | Зависимости | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | Auth / data security | `auth_accounts_json` содержит логины сотрудников и `password_plain`, а auth sessions/activity живут в клиентски читаемом JSON-слое. Phase 0 containment углублен: новые plaintext writes сняты, UI больше не показывает пароль, cached-user fallback отключен, disabled restore закрыт, legacy login auto-upgrade в `v2` добавлен. | Дойти по пути из `docs/auth-remediation-plan.md` от частичного containment до forced reset/storage migration и server-verified auth path. | Снимает самый опасный риск во всем audited scope и убирает доверие к локальному auth state. | Чистый login/logout smoke, проверка чтения настроек, dry-run миграции, data scrub audit. | Нужен защищенный read/write path или временный forced-reset rollout. | in_progress |
| B2 | Colors persistence | Основные order flows уже стабильны, а color save/load/detail path теперь закрыт: `tests/order-flow-smoke.js` проверяет `colors[]`, `color_solution_attachment` и legacy `color_id/color_name` fallback, а `order-detail` показывает эти данные оператору. | Держать color path в regression perimeter и расширять только если появятся фото/UX-specific gaps. | Убирает последний release-readiness gap в основном order entry path. | `node tests/order-flow-smoke.js` + ручная визуальная проверка при следующих browser smoke. | `js/app.js`, `js/colors.js`, `js/order-detail.js`, `js/supabase.js`. | done |
| B3 | Warehouse / ready goods regression depth | Текущий smoke perimeter уже включает rollback sync, China receipt linkage, `sales/writeoff/manual add`, ручную корректировку склада и отдельный fallback smoke для `sales_records`. Не до конца подтверждены только live edge cases с нехваткой/partial reserve и реальными резервами. | Дожать live browser verification и при необходимости добавить еще один адресный smoke на shortage/partial reserve ветки. | Делает stock drift regressions воспроизводимыми, а live-прогон оставляет только действительно UI/data-bound gaps. | `node tests/order-flow-smoke.js` + `node tests/supabase-fallback-smoke.js` + headed browser smoke для shortage/partial reserve. | Нужны воспроизводимые live fixtures с нехваткой остатка. | in_progress |
| B4 | Live auth/browser verification | Browser-runtime clean-session sanity уже добавлен: legacy login upgrade, disabled restore и permissions fallback проверены локально без записи в live data. Полный clean login/logout path с реалистичными employee fixtures еще не подтвержден. | Добавить повторяемый clean-session smoke: login, restore, logout, disabled user, permission refresh. | Переводит near-live аудит в нормальный release gate. | Headed browser smoke на чистом storage + permission sanity checks. | Более безопасный auth fixture path после B1. | in_progress |
| B5 | `corporate-gift` observability | Форма локально стабильна, но `mode: 'no-cors'` скрывает endpoint-level success/failure. | Добавить mock/intercept mode или явный ACK contract, чтобы submit outcome был наблюдаемым. | Делает отдельную intake-воронку supportable и demoable. | Headed submit smoke с intercept/mock и видимым user feedback. | Может потребовать endpoint/config change вне этого repo. | open |

## P1 - Следующая Итерация
| ID | Область | Что показал аудит | Предлагаемое улучшение | Ожидаемый эффект | Валидация | Зависимости | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B6 | Regression automation | Новый `tests/order-flow-smoke.js` полезен, но его все еще легко забыть прогнать. | Свести syntax-check + smoke scripts в один документированный release command и, при необходимости, в CI job. | Снижает шанс протащить регрессию после локального hotfix. | Один командный прогон зеленый на чистом checkout. | Можно переиспользовать текущие smoke scripts без нового framework. | open |
| B7 | Dual-write drift detection | `Supabase + localStorage` fallback помог во время аудита, но может скрывать divergence до refresh или смены устройства. | Добавить явное divergence logging и небольшой repair/report helper для критичных order/settings сущностей. | Делает скрытые data mismatch видимыми раньше. | Manual offline/online switch smoke + проверка логов/console. | Затрагивает `js/supabase.js` и settings persistence. | open |
| B8 | Audit fixtures | Browser audit зависел от вручную собранных live-ish fixtures. | Описать маленький seed fixture pack для `product / warehouse hardware / warehouse packaging / pendant / China purchase / completed order`. | Ускоряет будущие аудиты и делает smoke expectations повторяемыми. | В свежем окружении можно пройти документированный smoke на этом наборе fixtures. | Можно начать с docs-first варианта без автоматизации. | open |
| B9 | Release hygiene | Несколько фиксов потребовали ручного cache-bust bump в `index.html`. | Нормализовать правила bump/check для asset versions перед релизом. | Снижает путаницу со stale assets во время hotfix-проходов. | Cache-bust checklist проходит вместе с локальным browser smoke. | Может быть docs-only или маленьким helper script. | open |

## P2 - Позже
| ID | Область | Что показал аудит | Предлагаемое улучшение | Ожидаемый эффект | Валидация | Зависимости | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B10 | Order operations UX | Операционный lifecycle стал стабильнее, но оператор все еще зависит от того, заметит ли он badge/tab и cross-link. | Добавить более явные breadcrumbs и summaries `order -> China -> warehouse` внутри `order-detail`. | Повышает доверие операторов и сокращает время на разбор движения заказа. | Ручной walkthrough по audit-order. | Лучше делать после B3, когда underlying events уже стабильны. | open |
| B11 | Auth admin UX после миграции | Текущий settings UI завязан на plaintext password handling. | Переделать вкладку управления логинами вокруг activation, reset, permission assignment и audit visibility, без показа живого пароля. | Сохраняет удобство админ-потока после снятия plaintext access. | Manual settings smoke после auth migration. | Идет после B1. | open |
| B12 | Unified inbound order intake | `corporate-gift/` остается отдельной intake-воронкой с другим backend contract. | Оценить запись `corporate-gift` submissions в тот же order lifecycle или в явную import queue. | Уменьшает split-brain в создании заказов и ручную дообработку. | Сквозной demo от gift constructor до order operations. | Зависит от endpoint и продуктового решения. | deferred |

## Recommended Execution Order
1. B1 auth containment и подготовка миграции.
2. B2 color persistence и attachment regression pass.
3. B3 warehouse-ready-goods deep regression coverage.
4. B4 clean live auth/browser verification.
5. B5 `corporate-gift` submit observability.

## Notes
- Этот backlog намеренно собран только из находок аудита, а не из общего product wishlist.
- B1 остается единственным явно high-severity риском, потому что затрагивает credential material и подрывает доверие ко всем остальным release gates.
