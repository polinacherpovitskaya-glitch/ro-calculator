# Employee Auth Payroll Status

## Snapshot
- Current phase: P1/P2/P4/P5 partial implementation landed, identity audit panel added, migration map still open
- Plan file: `/private/tmp/ro-codex-push-sync.U4fKIO/docs/employee-auth-payroll-plan.md`
- Status: yellow
- Last updated: 2026-03-17

## Goal
- Собрать в одну понятную систему `сотрудник -> доступ в систему -> часы -> зарплата`, не потеряв исторические часы и не сломав текущие логины.

## Confirmed Findings
- Employee activity сейчас вычисляется через `fired_date`, но UI не объясняет это как источник истины; поэтому пользователю непонятно, почему `Женя Г` неактивна.
- В `supabase.js` есть seeded `FIRED_DATES`, включая `Женя Г`, поэтому часть "неактивности" приходит из кода, а не из явного действия оператора.
- Auth accounts живут отдельно от employees и совпадают с ними только по ссылке `employee_id`, поэтому возможно расхождение имен и статусов между двумя списками.
- Current payroll engine умеет только месячный порог включенных часов; правила `60 часов в первую половину + 60 часов во вторую` сейчас отсутствуют.
- `Лёша` моделируется через статический `ro_production_shares = 50`, хотя пользователь описал hour-based reallocation из косвенных расходов.

## Non-Negotiables
- Сохранить `employee.id` как canonical identity.
- Не терять и не разрушать уже сданные `time entries`.
- Любой merge employee/auth делать с backup и explicit exception list.
- Payroll-правила внедрять без поломки hourly flow для уже работающих сотрудников.

## Decisions
- Канонической сущностью становится `employee`, а login превращается в дочерний блок сотрудника.
- Исторические часы сохраняются через `employee_id` и readable name snapshot; уволенные/неактивные люди не исчезают из истории.
- Для Таи каноном считаем `120 часов/месяц`, split по полумесяцам `60 + 60`; случайное упоминание `160 часов` трактуем как оговорку.
- Для Лёши целевая модель: весь monthly employer cost сидит в косвенных, пока production hours не подтверждены time tracking'ом.

## Assumptions
- В первой волне можно оставить auth storage физически отдельно, если UI и ownership already unified around employee card.
- Статусы `paused/inactive` и `fired` можно развести, если это снимает текущую операторскую путаницу.
- Для semimonth payroll достаточно деления на периоды `1-15` и `16-end`, если не появится отдельное бухгалтерское требование.

## Done
- Подтверждено, что employee/auth/payroll mismatch не косметический, а структурный.
- Подтверждено, что сохранность часов можно обеспечить, если не менять canonical `employee.id`.
- Подготовлен отдельный execution track и test perimeter под redesign.
- В `Сотрудниках` появился employee-centric слой: видны связанный логин, payroll profile и явный статус сотрудника.
- В карточке сотрудника теперь есть явный выбор `Работает сейчас / Пауза / Уволен`, понятная подсказка по статусу и прямые действия `Открыть логин / Создать логин`.
- Сохранение сотрудника теперь синхронизирует связанные auth-данные по `employee_id` и автоматически выключает логин, если сотрудник больше не активен.
- В модель сотрудника добавлены payroll profiles `hourly`, `salary_monthly`, `salary_semimonth_threshold`, `management_salary_with_production_allocation`.
- Для `Тая` зафиксированы defaults `120 часов/месяц` и `60 часов/полумесяц`, а `TimeTrack` теперь считает payroll по схеме `60 + 60` с breakdown `1-15` и `16-конец`.
- Для `Лёша` и аналогичных профилей `IndirectCosts` теперь считает `% производство` по фактически записанным часам месяца, а не по статическому `50%`.
- Добавлены regression smokes:
  - `node tests/employee-auth-payroll-smoke.js`
  - `node tests/payroll-half-month-smoke.js`
- Новый smoke включен в GitHub Pages verify job.
- Во вкладке `Логины` появился audit-блок по связке `сотрудник ↔ логин ↔ часы` с безопасной диагностикой конфликтов.
- Для точных совпадений добавлена safe relink кнопка, которая аккуратно привязывает orphan login к каноническому `employee_id`, не склеивая спорные случаи автоматически.
- Добавлен export `employee-auth-audit` JSON для ручной exception map и cleanup без потери historical hours.

## In Progress
- P1: manual exception list и canonical merge map для конфликтных людей еще не собраны, но audit/export слой уже дает список проблем и safe relink для точных кейсов.
- P3: физическая миграция auth ownership и cleanup orphan logins еще впереди.
- P5: order-level allocation часов Лёши в конкретные заказы/хозработы еще не завершен; пока закрыт только month-level indirect share.

## Next
- P1/P3: собрать explicit migration map по конфликтам `employee <-> login <-> historical time entries`, начиная с кейсов `Женя Г` / `Женя`, и затем пройти ручную cleanup-очередь из audit export.

## Risks
- Автоматический merge по имени может ошибочно склеить разных людей.
- UI-переделка без предварительного identity audit создаст новые расхождения, а не уберет старые.
- Payroll redesign может задеть `План-факт` и косвенные расходы, если не заложить regression harness заранее.

## Blockers
- External blockers сейчас не подтверждены.
- Внутренний blocker на старт реализации один: нельзя идти в migration/UI до фиксации canonical mapping для конфликтных людей.

## Command Baseline
```sh
for f in js/*.js; do node --check "$f"; done
rg -n "FIRED_DATES|auth_accounts_json|employee_id|worker_name|pay_base_hours_month|ro_production_shares" js/*.js
node tests/auth-hardening-smoke.js
python3 -m http.server 4173
```

## Planned Validation Adds
- `node tests/employee-auth-payroll-smoke.js`
- `node tests/payroll-half-month-smoke.js`
- ручной smoke: `settings -> employee card -> access issue/reset -> timetrack -> payroll`

## Audit Log
| Date | Area | Evidence | Outcome | Next |
| --- | --- | --- | --- | --- |
| 2026-03-17 | Employee status | `js/settings.js` uses `fired_date -> is_active` and list badge derives from `fired_date` | confirmed confusing status source | fold status explanation into employee card |
| 2026-03-17 | Seeded inactivity | `js/supabase.js` has hardcoded `FIRED_DATES`, including `Женя Г` | confirmed hidden state source | inventory seeded vs user-edited statuses in P1 |
| 2026-03-17 | Auth split | `auth_accounts_json` remains separate from employees and only references `employee_id` | confirmed dual source of truth | migrate to employee-centric UI/ownership |
| 2026-03-17 | Payroll threshold | `js/timetrack.js` uses one monthly `baseHours` bucket | confirmed mismatch with `60 + 60` rule | add semimonth payroll engine in P4 |
| 2026-03-17 | Lyosha allocation | `ro_production_shares` seeds `50%` override | confirmed mismatch with hour-based allocation | replace static share with actual hours in P5 |
| 2026-03-17 | Employee card UX | `js/settings.js`, `index.html` | fixed | status/login/payroll profile now visible in one employee card |
| 2026-03-17 | Semimonth payroll | `js/timetrack.js`, `tests/payroll-half-month-smoke.js` | fixed | keep extending payout UX and negative cases |
| 2026-03-17 | Dynamic indirect share | `js/indirect_costs.js`, `tests/employee-auth-payroll-smoke.js` | fixed | move from month-level share to order-level allocation later |
| 2026-03-17 | Identity audit | `js/settings.js`, `tests/employee-auth-payroll-smoke.js` | fixed | login tab now surfaces employee/login/time mismatches and offers safe relink only for exact matches |

## Smoke / Demo Checklist
- [x] Один экран сотрудника показывает статус, доступ и payroll profile без перехода между двумя отдельными справочниками.
- [ ] Неактивный/уволенный сотрудник остается видимым в истории часов.
- [x] В `Логинах` видно, где связь `employee ↔ auth ↔ hours` сломана, без silent auto-merge.
- [ ] Новый сотрудник получает логин и пароль из карточки сотрудника без ручного конструирования.
- [x] Тая считается по `60 + 60`, а не по общему месячному bucket.
- [x] Лёша переносит стоимость в производство только по реальным часам на month-level share.
