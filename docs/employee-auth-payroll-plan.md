# Employee Auth Payroll Plan

## Source
- Task: пересобрать логику `сотрудники + логины + часы + зарплата`, потому что сейчас employee records и auth records расходятся, статус активности сотрудников неочевиден, а payroll-правила не покрывают реальные кейсы Таи и Лёши.
- Canonical input: пользовательский запрос в чате от 2026-03-17 про путаницу между `Женя Г` в сотрудниках и `Женя` в логинах, требование не потерять уже сданные часы и уточнение payroll-правил:
  - Женя: почасовая оплата;
  - Тая: оклад покрывает `120 часов/месяц`, но выплата считается по половинам месяца как `60 + 60`, затем сверхурочные `500 ₽/час`, выходные/праздники `750 ₽/час`;
  - Лёша: если не работает в производстве, вся стоимость `180 000 ₽` остается в косвенных расходах; если работает в производстве, стоимость его часов должна вытаскиваться из косвенных и распределяться на заказы или хозработы.
- Repo context:
  - employee data и payroll-настройки живут в `js/supabase.js` и `js/settings.js`;
  - auth accounts живут отдельно в `auth_accounts_json` и UI `Доступы в систему`;
  - time tracking и payroll logic живут в `js/timetrack.js`;
  - косвенные расходы и production share overrides живут в `js/indirect_costs.js` и `localStorage`.
- Last updated: 2026-03-17

## Execution Analysis
- Сейчас сломана не одна кнопка, а сама модель: `employee` и `login` существуют как две параллельные сущности, хотя оператор ожидает видеть одного человека с понятным статусом, доступом и зарплатной схемой.
- Самый жесткий guardrail: нельзя терять уже сданные часы. Значит, канонической сущностью при миграции должен остаться `employee.id`, а старые `time entries` нельзя переписывать разрушительно.
- Порядок работ должен идти от identity и data migration к UI и только потом к payroll-движку. Если сначала чинить интерфейс, а потом менять ключи и статусы, легко потерять связку `employee <-> login <-> time entries`.
- Для payroll сейчас не хватает не косметики, а нового типа правил: месячный порог уже реализован, но semimonth payroll threshold `60 + 60` и dynamic indirect-to-production allocation для Лёши отсутствуют совсем.

## Product Intent
- Сделать сотрудника канонической сущностью: один человек, одна карточка, в которой видны:
  - статус работы;
  - логин и доступы;
  - зарплатная схема;
  - история часов и payroll-сводка.
- Убрать ощущение, что `логины` живут своей жизнью отдельно от `сотрудников`.
- Явно объяснить операторам разницу между `активен`, `неактивен` и `уволен`.
- Поддержать три разные схемы оплаты без ручных обходных путей:
  - чисто почасовая;
  - оклад с порогом по половинам месяца;
  - управленческий оклад с частичным переносом в производственные затраты по фактическим часам.

## Scope Boundary
- In scope:
  - каноническая модель `employee -> auth -> payroll`;
  - безопасная миграция существующих логинов к employee-centric UI;
  - явный статус сотрудника и понятное редактирование активности;
  - сохранение и перенос уже сданных часов;
  - payroll-правила для Жени, Таи и Лёши;
  - замена магического `production_shares` на объяснимую модель.
- Out of scope for first wave:
  - backend/SSO redesign beyond current auth hardening track;
  - полноценный HRM или кадровые документы;
  - массовая правка исторических смен без явной причины;
  - бухгалтерский расчет налогов за пределами тех полей, которые уже используются в продукте.

## Current State Findings
- `settings.js` уже вычисляет `is_active` через `fired_date`, но UI не объясняет это как источник истины, поэтому "почему сотрудник неактивен" выглядит случайным.
- В `supabase.js` есть seed-level `FIRED_DATES`, из-за чего некоторые люди вроде `Женя Г` приходят как уволенные/неактивные еще до ручной правки.
- Auth accounts живут отдельно от employees и лишь ссылаются на `employee_id`, поэтому operator видит два списка, которые легко расходятся по именам и статусам.
- Current payroll engine в `timetrack.js` умеет только месячный порог `baseHours` и не умеет считать две независимые половины месяца.
- `Лёша` сейчас частично моделируется через `ro_production_shares = 50`, что не соответствует реальному правилу "забираем из косвенных только фактически отработанные производственные часы".

## Non-Negotiables
- Не удалять и не перетирать исторические `time entries`.
- Сохранить `employee.id` как канонический identity key для миграции.
- Любая привязка логина к сотруднику должна быть 1:1 или явно disabled; orphan logins без понятного employee owner должны быть временно помечены, а не молча теряться.
- Исторические часы у уволенных/неактивных сотрудников должны оставаться видимыми в отчетах и payroll.
- Если в пользовательском описании есть конфликт `120` против случайно упомянутых `160 часов`, каноном считать `120 часов/месяц = 60 + 60`.

## Proposed Canonical Model

### 1. Employee as source of truth
- Каноническая сущность: `employee`.
- Обязательные домены в карточке сотрудника:
  - identity: `id`, `name`, `role`;
  - employment status;
  - auth access;
  - payroll profile;
  - hours/time summary.
- В UI раздел `Доступы в систему` должен стать либо встроенным блоком карточки сотрудника, либо derived-таблицей поверх employee data, а не отдельным параллельным справочником.

### 2. Explicit employee status
- Предлагаемые состояния:
  - `active`: работает сейчас, доступен в селекторах и может иметь логин;
  - `paused`: временно не работает, новый time entry по умолчанию не предлагается, логин может быть выключен;
  - `fired`: есть дата увольнения, нельзя логиниться и нельзя назначать новые часы, но история полностью сохраняется.
- Если продуктово не нужен отдельный `paused`, его можно свернуть в `inactive`, но это должно быть явное решение, а не побочный эффект `fired_date`.

### 3. Auth as employee child record
- Один login record прикрепляется к одному `employee_id`.
- В карточке сотрудника оператор видит:
  - `доступ в систему: включен / выключен`;
  - username;
  - reset password;
  - доступные страницы;
  - last login;
  - auth status synced with employee status.
- При увольнении/деактивации сотрудника auth доступ должен выключаться из той же карточки и объясняться тем же статусом.

### 4. Payroll profiles
- `hourly`:
  - для Жени и подобных;
  - вся оплата идет по часовым ставкам/типам дня.
- `salary_semimonth_threshold`:
  - для Таи;
  - оклад задается как месячная стоимость и/или employer cost;
  - включенные часы считаются по периодам `1-15` и `16-end`;
  - у каждого периода свой base bucket `60 часов`;
  - после превышения применяются `500 ₽/час`, на выходные/праздники `750 ₽/час`.
- `management_salary_with_production_allocation`:
  - для Лёши;
  - базово весь monthly employer cost сидит в косвенных расходах;
  - только фактические производственные часы переносят часть стоимости в production cost;
  - перенос должен идти либо в конкретные order-linked часы, либо в отдельную категорию `хозработы / внутреннее производство`.

### 5. Historical hours safety model
- `time entry` должен сохранять:
  - `employee_id` как primary link;
  - `worker_name_snapshot` для читаемого исторического отображения;
  - тип работы/контекст;
  - статус дня (`regular`, `weekend`, `holiday`).
- Для legacy entries без `employee_id` нужна отдельная backfill/match phase, но без silent rewrite.

## Milestone Order
| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| P1 | Зафиксировать каноническую identity-модель и migration map | - | [~] |
| P2 | Объединить employee и auth UX в одну понятную карточку сотрудника | P1 | [~] |
| P3 | Безопасно мигрировать статусы и логины без потери часов | P1, P2 | [ ] |
| P4 | Добавить payroll engine для semimonth base-hours rule | P1 | [~] |
| P5 | Заменить магический production share Лёши на hour-based allocation | P1, P4 | [~] |
| P6 | Прогнать регрессию, rollout и operator-facing cleanup | P2, P3, P4, P5 | [ ] |

## P1. Зафиксировать каноническую identity-модель и migration map `[ ]`
### Goal
- Понять, кто у нас один и тот же человек в `employees`, `auth accounts` и `time entries`, и выбрать employee-centric source of truth до любой UI-переделки.

### Tasks
- [x] Снять inventory `employees`, `auth_accounts_json`, time entries и payroll-конфигов.
- [ ] Построить mapping:
  - exact `employee_id`;
  - затем нормализованное имя;
  - затем manual exceptions list.
- [x] Отдельно выделить конфликты вроде `Женя Г` vs `Женя`.
- [x] Зафиксировать, какие статусы seeded/hardcoded и как они должны мигрировать в новый employee status.
- [ ] Определить минимальный migration artifact для rollback и восстановления.

### Definition of Done
- Для каждого активного логина и сотрудника понятен canonical owner.
- Есть список конфликтов, которые нельзя сливать автоматически.
- Есть явное правило, как сохранить historical time entries без потери identity.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
rg -n "FIRED_DATES|auth_accounts_json|employee_id|worker_name" js/*.js
```

### Known Risks
- Имена сотрудников могут совпадать или отличаться сокращениями.
- Старые time entries могут быть сохранены только по имени.

### Stop-and-Fix Rule
- Не переходить к UI/migration, пока не будет понятен mapping для каждого конфликта identity.

## P2. Объединить employee и auth UX в одну понятную карточку сотрудника `[ ]`
### Goal
- У оператора должен быть один экран сотрудника, где понятно, работает человек или нет, есть ли у него доступ и как его изменить.

### Tasks
- [x] Пересобрать список сотрудников так, чтобы статус и доступ были видны в одном месте.
- [x] Сделать явные поля `статус`, `дата увольнения`, `доступ в систему`, `последний вход`, `доступные страницы`.
- [x] Убрать UX, где login-management выглядит отдельным справочником без привязки к employee card.
- [ ] Сделать понятное действие `восстановить сотрудника / снова активировать`, если это разрешено продуктово.
- [ ] Оставить derived grid `Логины` только как служебный срез, если он вообще нужен после объединения.

### Definition of Done
- Оператор может понять судьбу сотрудника с одного экрана без переходов между `Сотрудники` и `Доступы`.
- Статус `неактивен/уволен` объяснен явно, а не через скрытую логику `fired_date`.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/auth-hardening-smoke.js
```

### Known Risks
- UI change без migration map из P1 легко создаст ложное ощущение "данные исчезли".

### Stop-and-Fix Rule
- Если новый UI скрывает существующий login или делает непонятным historical state, остановиться и исправить before continue.

## P3. Безопасно мигрировать статусы и логины без потери часов `[ ]`
### Goal
- Перевести auth linkage и employee statuses на новую модель, не потеряв доступы и уже сданные часы.

### Tasks
- [ ] Мигрировать login records к strict 1:1 привязке по `employee_id`.
- [ ] Отключить или пометить orphan logins, которые нельзя уверенно связать.
- [ ] Сохранить/выгрузить backup mapping до destructive step.
- [ ] Backfill-нуть missing `employee_id` в historical hours только там, где match однозначный.
- [ ] Прописать fallback rules для inactive/fired employees в time reports и payroll views.

### Definition of Done
- Ни один существующий time entry не потерян.
- Логины после миграции не висят отдельно от сотрудника.
- Уволенные/неактивные сотрудники остаются в отчетах, но не ломают current operators UX.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/auth-hardening-smoke.js
node tests/employee-auth-payroll-smoke.js
```

### Known Risks
- Ошибочная автосвязка может приклеить login к не тому сотруднику.
- Silent rewrite historical hours хуже, чем временный unresolved badge.

### Stop-and-Fix Rule
- Любое сомнение в merge конкретного человека переводить в explicit manual exception, а не в автофиксацию.

## P4. Добавить payroll engine для semimonth base-hours rule `[ ]`
### Goal
- Payroll для Таи и аналогичных сотрудников должен считаться не по месячному порогу, а по двум независимым половинам месяца.

### Tasks
- [x] Расширить payroll profile типом `salary_semimonth_threshold`.
- [ ] Хранить отдельно:
  - monthly salary / monthly employer cost;
  - included hours per month;
  - included hours per half-month;
  - overtime regular/weekend/holiday rates.
- [x] Пересчитать payroll aggregation по двум окнам:
  - `1-15`;
  - `16-end`.
- [x] В payroll UI показывать:
  - сколько часов закрыто окладом в текущую половину месяца;
  - сколько часов уже вышло в доплату;
  - стоимость первой и второй выплаты.
- [x] Убедиться, что hourly employees продолжают считаться как раньше.

### Definition of Done
- Для Таи порог считается как `60 + 60`, а не общий месячный bucket.
- Первая зарплатная выплата может быть рассчитана независимо от второй.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/payroll-half-month-smoke.js
```

### Known Risks
- Нужна четкая граница, как считать выходные/праздники внутри полумесяца.
- Может понадобиться отдельный reporting UX для "текущая половина месяца".

### Stop-and-Fix Rule
- Если после изменения ломается текущая hourly схема, сначала восстановить parity для hourly employees и только потом продолжать payroll rollout.

## P5. Заменить магический production share Лёши на hour-based allocation `[ ]`
### Goal
- Убрать static override `50%`, чтобы косвенные расходы уменьшались только на фактические производственные часы Лёши.

### Tasks
- [x] Ввести payroll profile `management_salary_with_production_allocation`.
- [x] Хранить monthly employer cost как базовую indirect cost.
- [x] Считать фактическую production hour cost по recorded hours.
- [ ] Распределять эту стоимость:
  - на заказ, если час привязан к order context;
  - в `хозработы / внутреннее производство`, если контекст незаказный.
- [x] Пересмотреть `indirect_costs.js` так, чтобы share override не был source of truth.

### Definition of Done
- При отсутствии производственных часов вся стоимость Лёши остается в косвенных.
- При наличии производственных часов перенос происходит по факту, а не по статическому коэффициенту.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/payroll-half-month-smoke.js
node tests/employee-auth-payroll-smoke.js
```

### Known Risks
- Нужно определить, какой rate брать для переноса: пропорциональный employer cost/hour или отдельную ставку.
- Изменение может затронуть `План-факт` и косвенные расходы.

### Stop-and-Fix Rule
- Если allocation ломает indirect totals или order economics, остановиться и добавить isolated regression before continue.

## P6. Прогнать регрессию, rollout и operator-facing cleanup `[ ]`
### Goal
- Довести redesign до рабочего и объяснимого состояния для операторов.

### Tasks
- [ ] Добавить целевые smoke tests для employee/auth/payroll rules.
- [ ] Пройти ручной smoke `settings -> employees -> login -> timetrack -> payroll`.
- [ ] Обновить тексты UI, чтобы оператор понимал:
  - что значит статус сотрудника;
  - где выдать доступ;
  - как считается зарплата.
- [ ] Подготовить короткий operator handoff.

### Definition of Done
- Новый путь `сотрудник -> доступ -> часы -> зарплата` demoable end to end.
- Операторы больше не путаются, где искать сотрудника и почему у него такой статус.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/auth-hardening-smoke.js
node tests/employee-auth-payroll-smoke.js
node tests/payroll-half-month-smoke.js
python3 -m http.server 4173
```

### Known Risks
- Миграция затронет и settings, и auth, и timetrack, и косвенные расходы; без smoke harness легко уронить соседние экраны.

### Stop-and-Fix Rule
- Если после rollout хотя бы один существующий сотрудник теряет видимость часов или доступов, вернуться к migration safety, а не накапливать новые UX-фиксы поверх сломанной базы.
