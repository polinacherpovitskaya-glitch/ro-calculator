# Консолидация инфраструктуры RO и RePanel в России

## Контекст

Четыре рабочих продукта распределены между пятью инфраструктурными
провайдерами:

- `calc.recycleobject.ru` уже работает из Yandex Object Storage и использует
  собственные API/PostgreSQL на Yandex VM;
- калькулятор RePanel работает в Railway, хранит рабочие данные в
  Firestore/Firebase Storage и использует Railway Volume;
- `re-panel.ru` работает в Vercel, часть персональных данных уже перенесена в
  YDB, но каталог и файлы остаются в Supabase;
- `recycleobject.ru` работает в Vercel и продолжает использовать Supabase для
  магазина, авторизации, файлов и серверных операций;
- Vercel также предоставляет рабочий relay к Telegram Bot API, потому что
  прямой доступ к `api.telegram.org` из текущего Yandex-контура не работает.

Основные сотрудники и аудитория находятся в России. Системы не должны требовать
VPN для обычной работы. Персональные данные сотрудников и клиентов должны
собираться, обрабатываться и храниться в российском контуре.

## Решение

Целевая инфраструктура состоит из двух платформ:

1. **Yandex Cloud, регион Россия** — production-приложения, базы данных, API,
   авторизация, файлы, фоновые задания, логи, мониторинг и резервные копии.
2. **Vercel** — публичные web-frontends, Telegram relay и preview-сборки без
   собственной production-базы и файлового хранилища.

Telegram остаётся внешней бизнес-интеграцией. Supabase, Railway и
Google Cloud/Firebase отключаются только после миграции, окна наблюдения и
проверенного восстановления.

Уточнение владельца от 2026-08-05: допустимый постоянный perimeter — Yandex
Cloud, Vercel и Telegram. Поэтому `recycleobject.ru` может оставаться на
Vercel, если база, Auth и Storage находятся в российском Yandex-контуре и
Vercel не становится отдельным источником customer data.

## Главный инвариант сохранности

Ни один источник данных, volume, bucket, проект или credential не удаляется и
не отключается, пока одновременно не выполнены все условия:

1. создан свежий полный export;
2. export имеет manifest, размер и SHA-256;
3. копия загружена в приватный versioned bucket Yandex Object Storage;
4. существует отдельная зашифрованная офлайн-копия;
5. проведён restore drill в изолированную среду;
6. counts, ключевые идентификаторы и контрольные payload совпадают;
7. новый production прошёл smoke-тесты и окно наблюдения;
8. destructive действие отдельно подтверждено владельцем.

Статус каждого условия фиксируется в машинно-проверяемом preservation
manifest. Decommission guard обязан закрываться с ошибкой, если хотя бы один
обязательный backup не имеет статуса `verified`.

## Целевая архитектура

```text
Пользователи в России
        │
        ├── calc.recycleobject.ru ─────── Yandex Object Storage
        ├── recycleobject.ru ──────────── Vercel frontend ─┐
        ├── re-panel.ru ───────────────── Yandex runtime
        └── calc.re-panel.ru ──────────── Yandex runtime
                                             │             │
                                             ├── PostgreSQL
                                             ├── Object Storage
                                             ├── API / auth / jobs
                                             └── logs / backups ◄────────┘

Telegram Bot API ◄──── Vercel relay ◄──── Yandex applications
```

В рамках одного PostgreSQL-кластера продукты используют отдельные базы или
схемы, отдельных пользователей и минимальные права. Файлы разделены по
приватным buckets. Один продукт не получает универсальный ключ к данным другого.

## Источники, которые необходимо сохранить

### Recycle Object calculator

- текущий production PostgreSQL на Yandex;
- legacy self-hosted Supabase PostgreSQL и Storage до завершения его M8;
- Yandex Object Storage media и backup buckets;
- timebot state/pending/inbox volumes;
- configuration inventory без значений секретов;
- Git repository bundle и release SHA.

### RePanel calculator

- все Firestore collections, включая CRM, заказы, склад, производство,
  финансы, часы и сообщения;
- Firebase Storage;
- Railway Volume;
- локальные JSON/SQLite snapshots, фотографии и вложения;
- production environment key inventory без значений;
- Git repository bundle и release SHA.

### RePanel site

- все таблицы Supabase и Storage bucket `product-images`;
- данные YDB, уже принимающие персональные записи;
- каталог, промокоды, заказы, timeline, возвраты и сертификаты;
- configuration inventory без значений секретов;
- Git repository bundle и deployment SHA.

### Recycle Object site

- все таблицы Supabase, включая auth/admin и магазин;
- все Storage buckets и абсолютные ссылки на объекты;
- заказы, timeline, возвраты, сертификаты, промокоды и webhook state;
- configuration inventory без значений секретов;
- Git repository bundle и deployment SHA.

## Миграционная стратегия

### 1. Preservation first

Сначала создаётся единый реестр источников и backup-артефактов. Существующие
backup workflows не считаются достаточными для всей программы: текущий Yandex
workflow покрывает калькулятор RO, но не гарантирует свежие exports обоих
managed Supabase-проектов, Firestore/Firebase Storage и Railway Volume.

### 2. Shadow before cutover

Каждая система сначала запускается на временном Yandex hostname. Production
writes продолжают идти в старый источник до финального окна. Миграции
повторяемы, а parity запускается после каждого refresh.

### 3. One writer at cutover

Финальное переключение выполняется с коротким write freeze. После последней
дельты новый контур становится единственным writer. Старый контур остаётся
доступным только для rollback и проверки отсутствия трафика.

### 4. Observe before removal

Минимальное окно наблюдения — 14 календарных дней для магазинов и калькулятора
RePanel. Для legacy Supabase калькулятора RO сохраняются более строгие условия
существующего retirement-плана.

## Порядок продуктовых переездов

1. Preservation baseline всех источников.
2. Калькулятор RePanel: Railway + Firebase → Yandex.
3. Сайт RePanel: Supabase/YDB split → Yandex PostgreSQL/Object Storage.
4. Сайт Recycle Object: Supabase → Yandex PostgreSQL/Object Storage.
5. Наблюдение, выключение writes и только затем decommission.

Калькулятор RePanel идёт первым после backup baseline, потому что один его
переезд одновременно убирает Railway и Google Cloud, а сайт RePanel уже зависит
от его публичных API.

## Безопасность и персональные данные

- Production данные размещаются только в регионе Россия.
- Vercel relay не хранит payloads и не логирует Telegram token/secret path.
- Vercel storefront не имеет собственной БД или Storage: server/browser data
  requests идут в `db.recycleobject.ru`, а production secrets остаются в
  защищённых environment variables.
- Secrets находятся в Yandex Lockbox/закрытых env и GitHub Secrets; значения не
  попадают в manifests, логи, artifacts или Git.
- Доступ сотрудников не требует VPN, но защищён TLS, ролями, 2FA, rate limits и
  audit log.
- Foreign integrations получают только минимально необходимый payload; список
  трансграничных передач ведётся отдельно.
- Дампы с персональными данными всегда шифруются до офлайн-копирования.

## Scope boundaries

### Входит в программу

- backup/restore и parity для всех четырёх систем;
- перенос runtime, DB, Storage, auth и jobs в Yandex;
- переключение production domains;
- удаление Supabase/Railway/Firebase runtime-зависимостей;
- документация восстановления и decommission guard.

### Не входит в один общий PR

- переписывание UX или бизнес-логики;
- объединение баз RO и RePanel в одну схему с общими правами;
- отключение Telegram или Vercel relay;
- необратимое удаление старых источников вместе с migration PR;
- одновременное переключение нескольких production-продуктов.

Каждый продуктовый переезд остаётся отдельным sub-project, branch и PR.

## Приёмочные критерии программы

- Все обязательные preservation entries имеют статус `verified` и подтверждены
  restore drill.
- Все четыре production URL доступны из России без VPN.
- Персональные данные и файлы записываются в Yandex Cloud, регион Россия.
- Supabase, Railway и Firebase не получают новых production writes.
- Vercel обслуживает только разрешённые frontends/relay и не является
  authoritative data store.
- По окончании окна наблюдения старые сервисы сначала переводятся в read-only/
  paused, а физическое удаление выполняется отдельно.
- Для каждого продукта есть рабочий rollback runbook и проверенный backup.

## Cutover `recycleobject.ru` — 2026-08-05

- Vercel frontend переключён с managed Supabase на
  `https://db.recycleobject.ru`.
- В Yandex объединены source-only и target-only данные без truncate: добавлено
  146 отсутствовавших строк, обновлено 5 более свежих строк сайта, сохранены
  новые записи калькулятора.
- Перенесены 1 Auth user и 1 identity с исходным password hash; orphan checks
  равны нулю.
- Все 420 Storage objects / 410 254 132 bytes прошли SHA-256 parity; после
  cutover source delta не содержит новых таблиц или файлов.
- Managed Supabase сохранён как rollback source; physical delete не выполнен.
