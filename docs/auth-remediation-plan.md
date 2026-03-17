# Auth Remediation Plan

## Source
- Триггер: аудит от 2026-03-16 подтвердил, что текущий employee-auth path является high-severity data-security риском.
- Связанный код:
  - `/Users/krollipolli/Documents/Github/RO calculator/js/app.js`
  - `/Users/krollipolli/Documents/Github/RO calculator/js/settings.js`
  - `/Users/krollipolli/Documents/Github/RO calculator/js/supabase.js`
- Связанные execution docs:
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/plans.md`
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/status.md`
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/test-plan.md`
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/improvement-backlog.md`
- Severity: high
- Last updated: 2026-03-16

## Current State
- Employee accounts грузятся из settings key `auth_accounts_json`.
- Account records сейчас содержат `username`, `password_hash`, `password_plain`, employee metadata и page permissions.
- Login flow сравнивает client-side hash, после чего начинает доверять `localStorage` ключам вроде `ro_calc_auth_user_id` и `ro_calc_auth_ts`.
- `restoreAuthenticatedUser()` может сохранить cached user активным, даже если auth accounts не загрузились, что размывает границу между "пользователь подтвержден" и "auth source недоступен".
- Auth activity и session tracking тоже хранятся в client-managed JSON settings (`auth_activity_json`, `auth_sessions_json`).
- Текущий password hash - это легковесный deterministic client-side hash, который не подходит как финальная security-модель даже без plaintext storage.

## Почему Это High Severity
| Риск | Текущее поведение | Последствие |
| --- | --- | --- |
| Credential exposure | `password_plain` хранится и показывается в login-management UI. | Любой слишком широкий доступ к settings path раскрывает живые пароли сотрудников. |
| Weak verifier model | Проверка пароля целиком происходит в клиенте через слабый deterministic hash. | Реалистичны offline guessing и прямой client tampering. |
| Trust in local state | Session identity и page permissions синхронизируются через `localStorage`. | Сломанное или подмененное клиентское состояние может обойти intended permission boundaries. |
| Weak degraded mode | Cached user restore оставляет приложение рабочим, даже если auth accounts не загрузились. | Availability failure может незаметно превратиться в authorization failure. |
| Mutable audit trail | Auth activity и session logs пишутся через тот же client-managed data path. | Audit data становится неполным, переписываемым и слабо пригодным для инцидентов. |

## Goals
- Перестать хранить и показывать plaintext passwords.
- Перевести authentication и session validation на server-verified path.
- Сделать page permissions авторитетными вне browser-writable local state.
- Сохранить текущий employee-based login UX достаточно близким, чтобы не устроить операционный downtime.
- Сделать migration steps audit-friendly и обратимыми до подтверждения нового path.

## Non-Goals
- Полный SSO, MFA или organization-wide identity redesign в первой волне remediation.
- Переписывание SPA или смена routing/framework choices.
- Смешивание auth remediation с несвязанной order-flow feature work.

## Phase 0 - Immediate Containment
### Goal
- Быстро убрать самое опасное поведение, не дожидаясь полной auth redesign.

### Current Progress
- Новые plaintext writes в auth account save/reset path уже сняты.
- Settings UI больше не показывает сохраненный пароль и переводит reset в one-time disclosure flow.
- Cached-user restore при недоступном auth source отключен: без подтвержденного account session не восстанавливается.
- Автосоздание логинов временно отключено как осознанный security tradeoff, пока не появится безопасный onboarding/reset path.

### Tasks
- Перестать писать `password_plain` при создании, редактировании и reset логинов.
- Удалить поведение "показать plaintext password" из settings; заменить его на reset-only flow.
- Отключить fallback, который держит cached user живым при провале загрузки auth accounts; вместо этого требовать явную re-auth или безопасный locked state.
- Снять export/backup текущих auth-related settings перед первым destructive migration step.
- Зафиксировать short-term recovery path для существующих пользователей: предпочтительный вариант - forced password reset, а не дальнейшее сохранение текущей plaintext-схемы.

### Definition of Done
- Ни одна новая запись аккаунта не содержит `password_plain`.
- Settings UI больше не раскрывает живой пароль.
- Потеря auth data больше не восстанавливает прошлого пользователя из cache сама по себе.

### Validation
```sh
rg -n "password_plain" js/app.js js/settings.js js/supabase.js
```
- Manual smoke: create account, edit account, reset password, clean login, refresh, logout, disabled-account login, missing-auth-data behavior.

### Risks
- Forced reset rollout добавит краткосрочное трение для операторов, но сохранение plaintext дольше - больший риск.
- Если underlying data path по-прежнему широко читается, phase 0 только снижает severity, но не завершает remediation.

## Phase 1 - Account Storage Migration
### Goal
- Увести account records из общего settings blob и зафиксировать более безопасную схему credentials и permissions.

### Tasks
- Создать выделенную auth data model отдельно от generic `settings.key = auth_accounts_json`.
- Заменить текущий verifier format на versioned password schema с более сильным KDF и явной metadata по password rotation.
- Хранить permissions/allowed pages отдельно от transient client cache, с понятным authoritative source.
- Выбрать один migration path:
  - preferred: forced reset для всех активных аккаунтов во время cutover;
  - fallback: one-time protected server-side transform, только если forced reset операционно невозможен.
- Оставить старый payload читаемым только на время migration window, затем scrub его.

### Definition of Done
- Credentials больше не хранятся в generic settings JSON path.
- В account records нет plaintext password field.
- Источник permissions явный и не зависит от stale browser state.

### Validation
- Data audit подтверждает, что старый credential payload в `auth_accounts_json` удален или зачищен.
- Manual smoke подтверждает create/edit/disable/login flows на новом storage path.

### Risks
- Перенос схемы без понятного rollback artifact может заблокировать сотрудников.
- Простого re-hash слабых client-side значений недостаточно, если клиент все еще может читать verifier set.

## Phase 2 - Server-Verified Login and Session Model
### Goal
- Забрать у клиента право решать, валиден ли пароль и сессия.

### Tasks
- Добавить protected login endpoint или provider-backed auth path, который проверяет credentials вне браузера.
- Выдавать server-verified session token или другой trusted session artifact.
- Загружать app из verified session state, а не из writable `localStorage` identity alone.
- Явно ужесточить session expiry/refresh behavior вместо продления длинного client-side timestamp.
- Сделать logout и session invalidation явными и наблюдаемыми.

### Definition of Done
- Browser code больше не определяет валидность пароля через сравнение локально вычисленного hash с локально загруженным verifier set.
- Session restore зависит от trusted session source.

### Validation
- Manual smoke: clean login, reload, multi-tab restore, logout, expired session, disabled account, permission refresh.
- Negative smoke: tampered `localStorage` user/session values не дают доступ.

### Risks
- Эта фаза может потребовать backend work вне текущего repo.
- Частичный rollout легко создаст split auth model, если старый client-side path оставить включенным слишком долго.

## Phase 3 - Permissions and Audit Hardening
### Goal
- Сделать page access и auth audit data достаточно надежными для операционной работы и разбора инцидентов.

### Tasks
- Резолвить page permissions из authoritative auth/profile source при login и refresh.
- Уменьшить или убрать local writable permission mirrors, оставив их только как неавторитетный UI cache.
- Перенести auth activity/session writes за trusted endpoint или protected storage path.
- Оставить в settings UI только user status, permission assignment и audit visibility, без credential reveal.

### Definition of Done
- Permission checks не зависят от stale writable browser state.
- Auth activity/session records пригодны для операционного review.

### Validation
- Manual smoke: permission changes вступают в силу на следующем refresh/login, отключенные страницы скрываются корректно, audit/session entries продолжают писаться.

## Suggested Rollout Order
1. Phase 0 containment.
2. Backup + migration rehearsal на non-production dataset.
3. Phase 1 storage move.
4. Phase 2 trusted login/session cutover.
5. Phase 3 permissions/audit cleanup.

## Rollback / Safety Notes
- Снять export текущих auth-related records до первого migration step.
- До cutover employee logins держать документированный temporary operator recovery path.
- Не делать необратимый scrub legacy auth data, пока новый login path не пройдет manual smoke.
- Любая необходимость читать или восстанавливать plaintext passwords должна считаться incident-only exception, а не нормальной admin-функцией.

## Immediate Recommendation
- Следующий execution loop должен стартовать с Phase 0.
- Даже если protected backend path еще не готов, самый безопасный краткосрочный шаг все равно один: перестать писать plaintext, убрать его показ в UI и перейти к forced reset на первом совместимом migration step.
