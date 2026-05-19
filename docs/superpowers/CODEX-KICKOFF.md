# Codex Kickoff — старт автономной разработки миграции

> **Этот файл — твоя инструкция при первом старте.** Прочитай его целиком, потом следуй документам по ссылкам, потом приступай к работе.

---

## Кто ты и что делаешь

Ты — Codex, агент, который **автономно реализует миграцию проекта RO-calc** со старого стека (Supabase + Vercel + Yandex mirror) на новый стек (один Selectel VPS в Москве с Postgres + Node API + Caddy + Vue 3 SPA).

Этот клон строится **параллельно** с работающей production-системой. Пользователи продолжают работать в старой `calc.recycleobject.ru` без перебоев. Ты строишь новый сайт на `ops-staging.recycleobject.ru`. В какой-то день (после твоей готовности) — владелец проекта делает cutover: переключает DNS и Stage C.

Твоя цель — за серию рабочих сессий (несколько недель календарного времени) построить и протестировать всё в `ops-staging.recycleobject.ru` так, чтобы оно было готово к cutover.

## Профиль работы: «долго, дотошно, максимально без меня»

Владелец проекта (Полина) **сознательно выбрала медленную качественную работу вместо быстрой**. Это означает:

- 🎯 **Качество > скорость.** Лучше потратить день на правильный тест чем неделю на отладку без него.
- 🎯 **Автономия максимальная.** Не дёргай Полину на каждый шаг. Решай сам где можешь, делай ставки на безопасные варианты, документируй решения в STATUS.md.
- 🎯 **Дотошность.** Каждый блок выполнить полностью по плану. Никаких «потом допишу тесты». Никаких «временно skip эту инвариантную проверку». Никаких «упростим этот edge case».
- 🎯 **Self-merge OK при зелёных gates.** Если ВСЕ quality gates (см. ниже) зелёные — мержь сам в main. Не жди review. Документируй в STATUS.md что было сделано.
- 🎯 **Останавливайся только при реальных блокерах** — нужен секрет, не получается достучаться до VPS, нашёл расхождение в формулах которое не объясняется. НЕ останавливайся «спросить мнения по архитектуре» — она вся в документах.

---

## Рабочий каталог

```
/Users/krollipolli/Documents/Github/RO calculator
```

Это git-репозиторий. Все твои изменения — в нём.

## Текущее состояние (на момент написания этого документа)

- Branch: `block-1-infrastructure` (создана от main)
- Последние коммиты:
  - `4610c79` Extend stability program to all modules
  - `d754a5d` Add warehouse interaction map + bug inventory
  - `7d3bb3a` Add full migration playbook + plans for blocks 2-16
  - `a7a1ebe` Add ops/api skeleton with /api/health endpoint
  - `8e6fbb1` Add VPS provisioning script and ops gitignore rules
  - `0b6c15f` Block 1: start infrastructure work
  - `94fe518` Add Block 1 infrastructure implementation plan
- **Block 1 Tasks 1-3 готовы:** VPS поднят, домен `ops-staging.recycleobject.ru` работает, API скелет с `/api/health` тестируется
- **Block 1 Tasks 4-11 — твоё начало.** Дальше Block 2, 3, 4, ..., 16, потом Stage B/C/D.

VPS:
- IP: `176.114.65.153`
- Домен: `ops-staging.recycleobject.ru`
- SSH: `ssh -i ~/.ssh/id_ed25519 root@ops-staging.recycleobject.ru` (или `ops@...` для не-root)
- На сервере: Ubuntu 22.04, Docker, UFW, fail2ban, юзер `ops`. Контейнеры ещё не запущены (это часть Block 1 Task 5-7).

---

## Что прочитать СНАЧАЛА (обязательно)

Прежде чем писать **ОДНУ строку кода**, прочитай по порядку:

1. **`docs/superpowers/specs/2026-05-15-ops-redesign-design.md`** — общий дизайн системы: куда переезжаем, что выкидываем, архитектурное решение.

2. **`docs/superpowers/plans/2026-05-15-MIGRATION-PLAYBOOK.md`** — главное оглавление. Карта всех блоков, общие правила, FAQ. Здесь ссылки на все остальные документы.

3. **`docs/superpowers/plans/2026-05-15-STABILITY-PROGRAM.md`** — философия стабильности. 7 системных защит, обязательных для каждого блока. Метрики успеха.

4. **`docs/superpowers/plans/2026-05-15-BUG-INVENTORY.md`** — 25 классов известных багов с ссылками на старые commit-попытки чинить. Каждый блок устраняет определённые классы — это указано в плане блока.

5. **`docs/superpowers/plans/2026-05-15-WAREHOUSE-INTERACTION-MAP.md`** — детальная карта склада. Обязательно перед Block 3, 4, 5, 9.

Дальше — план конкретного блока, который ты сейчас выполняешь. Не читай все 19 планов разом — читай тот, который делаешь.

---

## Главные принципы (выучи)

### 1. Это не lift-and-shift, это редизайн

Для склада, бота, и архитектуры в целом — мы редизайним по списку из BUG-INVENTORY. **Не переноси баги.**

Для калькулятора (Block 7) и UI заказов (Block 9) — формулы 1:1, защищается golden-master. Архитектура — редизайн.

Конкретно для каждого блока — список багов, которые в нём чинятся, есть в его плане под секцией «Класс багов, которые фиксятся».

### 2. Self-merge при зелёных quality gates

- Каждый блок — отдельная ветка `block-N-<slug>` от main.
- В конце блока — открыть PR в main через `gh pr create`.
- **Если ВСЕ quality gates зелёные — мержь сам** через `gh pr merge --squash --delete-branch`.
- Если хоть один gate красный — фикси в той же ветке, не мержи. После фикса — gates снова, потом merge.
- Никогда не пушить прямо в main (только через PR, даже если сам мержишь сразу).

**Quality gates (ВСЕ должны быть зелёные перед merge):**

1. ✅ `cd ops/api && npm test` — unit + integration tests
2. ✅ `cd ops/web && npm run build` — Vue билдится без TypeScript errors
3. ✅ Если блок касается склада: `node ops/scripts/check-warehouse-invariants.mjs` на staging БД возвращает 0 violations по I1-I7
4. ✅ Если блок Block 7: все 20/20 golden-master fixtures проходят
5. ✅ Если блок Block 9: 20/20 full-order golden-master тестов
6. ✅ Playwright e2e тест блока проходит на staging
7. ✅ После деплоя на staging: `curl https://ops-staging.recycleobject.ru/api/health` возвращает `db.ok=true`
8. ✅ Smoke вручную из плана блока (например «принять приёмку, увидеть qty в warehouse») — выполнен и описан в STATUS.md
9. ✅ Compare-datasets script показывает что цифры из Supabase совпадают с Postgres для затронутых таблиц

Если **любой** gate не выполнен — НЕ мержь. Документируй причину в STATUS.md, фикси.

### 3. TDD везде где возможно

- Сначала тест → запускаешь → видишь fail с понятной причиной → реализуешь → видишь pass → commit.
- Если в плане сказано «TDD-цикл» — буквально пиши failing test первым.
- Никаких «потом тесты допишу» — это путь к багам.

### 4. Idempotency-Key на каждой мутации

- Без исключений. Каждый POST/PATCH/DELETE через middleware `withIdempotency()`.
- Это устраняет класс багов B (двойное списание) и L (calc draft duplicate saves) системно.

### 5. Транзакции + FOR UPDATE

- Любая операция, которая трогает несколько строк / несколько таблиц — внутри `withTransaction`.
- Lock через `SELECT id FROM ... WHERE id = ANY($1) ORDER BY id FOR UPDATE` (ORDER BY id чтобы избегать дедлоков).

### 6. Snapshot semantics для финансовых данных

- `orders.calculator_data` — snapshot на момент recalc, не live ссылки.
- `order_factuals.factual_data` — snapshot на момент закрытия.
- Цены — текущие в `warehouse_items.last_price`, но они НЕ текут автоматически в calculator_data. Только при явном `POST /orders/:id/recalc`.

### 7. State в БД, не в файлах

- Бот хранит state в `bot_conversation_state` (Postgres), не в `timebot.state.json`.
- API stateless — каждый запрос с auth cookie.
- Process restart не теряет данные.

---

## Рабочий цикл по блокам

```
┌─────────────────────────────────────────────────────────────┐
│ ДЛЯ КАЖДОГО БЛОКА (от 1 (продолжаем) до 16):                │
│                                                              │
│ 1. Прочитать план блока: docs/superpowers/plans/...         │
│ 2. Прочитать упомянутые в плане доки (warehouse map etc.)   │
│ 3. Создать ветку: git checkout main && git pull             │
│    && git checkout -b block-N-<slug>                        │
│ 4. Выполнить таски в порядке плана. После каждого:          │
│    - commit с понятным message                              │
│    - проверить что все предыдущие тесты ещё зелёные         │
│ 5. После всех тасков:                                       │
│    - npm test в ops/api/, ops/web/                          │
│    - Playwright e2e (если применимо)                         │
│    - Инварианты I1-I7 если касается склада                  │
│    - git push origin block-N-<slug>                         │
│    - gh pr create с описанием                               │
│ 6. ОСТАНОВИТЬСЯ. Написать в STATUS.md что готово,           │
│    ждать review от пользователя.                            │
│ 7. После merge в main: вернуться на main, pull, начать      │
│    следующий блок.                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Порядок блоков

Точный порядок — в [`2026-05-15-MIGRATION-PLAYBOOK.md`](plans/2026-05-15-MIGRATION-PLAYBOOK.md) раздел «Карта всех блоков». Кратко:

1. **Block 1 Tasks 4-11** (закончить инфраструктуру: Postgres, Vue SPA, Caddy, deploy, backup, restore drill, UptimeRobot, README)
2. **Block 2** (Auth + employees)
3. **Block 3** (⭐ Склад — главный редизайн, читай WAREHOUSE-INTERACTION-MAP)
4. **Block 4** (Приёмки + Китай)
5. **Block 5** (Молды + бланки + цвета + marketplaces)
6. **Block 6** (Bug reports + storage migration — может выполняться параллельно с Block 4-5)
7. **Block 7** (⭐⭐ Калькулятор — golden-master, самый ответственный блок)
8. **Block 8** (Production templates + calendar + indirect costs)
9. **Block 9** (⭐ Orders + factual — второй по ответственности)
10. **Block 10** (Storage migration `product-images`)
11. **Block 11** (Tasks + projects + gantt)
12. **Block 12** (Telegram bot redesign — state в БД)
13. **Block 13** (Storage migration `mold-photos`)
14. **Block 14** (Время + payroll)
15. **Block 15** (Analytics — переносим с известными багами)
16. **Block 16** (Remaining settings)

Потом:
- **Stage B** (тестирование перед cutover) — это сделаешь после Block 16, но cutover-день делает владелец.

---

## Регулярная перезаливка данных (refresh) — автоматизированно

**Важно:** старая `calc.recycleobject.ru` продолжает работать. Новые заказы, новые часы, новые приёмки — каждый день. Если ты скопировал данные неделю назад — они уже устарели.

### Manual run (когда руками)

```bash
SUPABASE_URL=https://jbpmorruwjrxcieqlbmd.supabase.co \
SUPABASE_SERVICE_KEY=<из env> \
DATABASE_URL=postgres://ops:<password>@ops-staging.recycleobject.ru:5432/ops \
  node ops/scripts/refresh-staging-snapshot.mjs
```

Этот скрипт дропает все таблицы кроме `auth_*` и `idempotency_keys`, накатывает миграции заново, копирует свежее из Supabase.

После него — `node ops/scripts/compare-datasets.mjs` чтобы убедиться что counts совпали.

**Скрипт расширяется по мере блоков.** В Block 3 он умеет копировать только warehouse + employees. После Block 4 — добавь Китай. После Block 5 — молды. И т.д. Каждый блок плана содержит инструкцию «добавь refresh-скрипт для этого блока».

### Авто-refresh через systemd timer (настраивается в Block 3)

Чтобы НЕ забывать делать refresh — настрой автоматический weekly refresh на VPS. Это часть Block 3 (после первого refresh-скрипта). Создай unit-файлы:

```ini
# ops/infra/systemd/ops-refresh-staging.service
[Unit]
Description=Refresh staging snapshot from Supabase
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
EnvironmentFile=/srv/ops/infra/.env
ExecStart=/usr/bin/bash -c 'cd /srv/ops && node scripts/refresh-staging-snapshot.mjs 2>&1 | tee /var/log/ops-refresh.log'
StandardOutput=journal
StandardError=journal
TimeoutStartSec=3600
```

```ini
# ops/infra/systemd/ops-refresh-staging.timer
[Unit]
Description=Weekly staging refresh — every Sunday at 04:00 MSK

[Timer]
OnCalendar=Sun *-*-* 04:00:00 Europe/Moscow
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
```

Установить на VPS:
```bash
ssh root@ops-staging.recycleobject.ru << 'REMOTE'
cp /srv/ops/infra/systemd/ops-refresh-staging.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ops-refresh-staging.timer
systemctl list-timers | grep refresh
REMOTE
```

После этого каждое воскресенье в 04:00 МСК staging автоматически обновляется свежими данными.

Дополнительно — настрой алёрт в Telegram если refresh упал:
```bash
# В ops/scripts/refresh-staging-snapshot.mjs в catch-блок добавь
# отправку в Telegram через bot-token (использовать тот же что для taskbot)
```

### Перед началом нового блока

Всегда проверяй когда был последний refresh:
```bash
ssh root@ops-staging.recycleobject.ru "stat -c '%y' /var/log/ops-refresh.log | head -1"
```

Если старше 7 дней — запусти руками перед началом блока.

---

## Когда останавливаться (НОВАЯ ВЕРСИЯ — меньше остановок)

Полина хочет максимум автономии. Останавливайся **ТОЛЬКО** в этих случаях:

### Останавливайся обязательно

1. **Нужен реальный секрет, которого нет в репо/окружении:**
   - `SUPABASE_SERVICE_KEY` (для refresh скриптов)
   - Selectel S3 access/secret key (для storage migration в Block 6, 10, 13)
   - Telegram bot token (Block 12)
   - UptimeRobot API key (Block 1 Task 11)
   - Postgres production password (на VPS лежит, локально не нужен)
   - Любые персональные пароли тестовых пользователей
   
   → Опиши в STATUS.md в секции "Blockers" что именно нужно и куда положить.

2. **Manual cloud-setup, который ты физически не можешь сделать:**
   - Создать bucket в Selectel Object Storage (можно через `s3cmd`/AWS-CLI если креды есть — попробуй)
   - Зарегистрировать UptimeRobot аккаунт
   - Изменить DNS A-запись (требует доступ к reg.ru)
   - Подтверждение billing в Selectel
   
   → В STATUS.md в "Manual steps required" — список шагов в стиле «зайди туда → сделай то → значение положи в env как X».

3. **CI красный 3 попытки подряд + не понимаешь причину:**
   - Описать симптом + что пробовал в STATUS.md → ждать.

4. **Расхождение golden-master, которое не воспроизводится:**
   - Если golden-master fixture показывает разные числа в разных запусках — это не баг твоего кода, это нестабильный test. Описать в STATUS.md.

5. **Возможная потеря данных:**
   - Если делаешь migration script и он МОЖЕТ испортить данные — стоп, опиши план в STATUS.md, жди подтверждение.

### НЕ останавливайся (раньше я сказал останавливаться — отменяется)

- ❌ После каждого блока — НЕ жди review. Мержь сам если gates зелёные. Двигайся к следующему блоку.
- ❌ После каждого таска — НЕ жди подтверждения. Делай следующий таск.
- ❌ "Сомневаюсь в архитектуре" — НЕ останавливайся. Перечитай BUG-INVENTORY, STABILITY-PROGRAM, WAREHOUSE-MAP — там есть ответы. Если действительно нет ответа — выбери самый консервативный вариант, документируй выбор в commit message + STATUS.md.
- ❌ "Стоит ли добавить эту фичу?" — нет. Делай ТОЛЬКО что в плане. Никаких улучшений.
- ❌ "Хотелось бы посоветоваться по naming" — нет. Используй имена из старого кода или из плана.

### STATUS.md (обновлять часто)

Создай и поддерживай `docs/superpowers/STATUS.md`. Обновляй **после каждого блока** (не реже) или **каждый день когда работаешь** (если блок длинный):

```markdown
# Migration status

Last update: <ISO datetime, например 2026-05-22T14:30:00Z>
Current block: <N> "<topic>"
Current task within block: <N>
Branch: <name>
Last commit: <SHA short>
Tests: <X/Y passing>

## What was done in last session
- [bullet list of concrete changes, with file paths if relevant]

## Next steps
- [ordered list of what comes next, with estimated time]

## Quality gates status (only when at end of block)
- [ ] npm test in ops/api
- [ ] npm run build in ops/web
- [ ] Warehouse invariants I1-I7 (if applicable)
- [ ] Golden-master 20/20 (Block 7+9 only)
- [ ] Playwright e2e
- [ ] /api/health green on staging
- [ ] Manual smoke from plan

## Blockers / questions (только если есть)
- ... (пусто если нет)
- Если есть — указывай ТОЧНО что нужно: имя env переменной, формат, куда положить

## Manual steps required by Polina (только если есть)
- ... (пусто если нет)
- Точная пошаговая инструкция

## Completed blocks summary
- ✅ Block 1: Infrastructure (PR #N, merged DATE)
- ✅ Block 2: Auth (PR #N, merged DATE)
- 🔄 Block 3: Warehouse (in progress, see Branch above)
- ⏳ Block 4-16: pending
```

Этот файл — главный способ для Полины узнать что происходит. Чем подробнее и регулярнее обновляешь — тем меньше она тебя теребит.

---

## Принципы дотошности (выбраны Полиной явно)

Полина сказала: «лучше долго, но дотошно». Это значит:

### Не пропускай шаги ради скорости

- **Каждый тест из плана — пишется.** Если в плане «≥12 тестов на warehouse API» — должно быть ≥12. Не 10, не 8.
- **Каждый инвариант из I1-I7 — проверяется.** В тестах + в финальном smoke на staging.
- **Каждый golden-master fixture — собирается.** Block 7 требует 20+ из них. 18 — недостаточно.
- **Каждый refresh — с compare.** После refresh-скрипта всегда `compare-datasets.mjs` для верификации.

### Не давай себе послаблений

Соблазны, которые могут возникнуть, и почему НЕ поддаваться:

| Соблазн | Почему НЕТ |
|---|---|
| «Этот тест странный, заскипую» | Багу хотим поймать, а не спрятать |
| «Edge case редкий, обработаю позже» | После Stage D — много «потом» накопится |
| «Skip Idempotency-Key для этого простого endpoint» | Простых endpoint'ов не бывает в проде |
| «withTransaction overhead, можно без него» | Race conditions появляются именно тогда |
| «Этот fixture сложно собрать, возьму попроще» | Сложные — самые важные |
| «Логи разрослись, заменю на console.error» | Структурированные логи понадобятся при cutover |
| «Vue компонент не идеален, потом отрефакторю» | «Потом» не наступит, лучше сделать сразу хорошо |

### При сомнениях — более защитный вариант

- Сомневаешься: писать ли валидацию входа? → **писать.**
- Сомневаешься: добавлять ли FK CASCADE? → **добавлять** (если у схемы это допустимо).
- Сомневаешься: ставить ли `FOR UPDATE`? → **ставить** (overhead минимальный).
- Сомневаешься: писать ли integration-тест в добавок к unit? → **писать** оба.
- Сомневаешься: нужен ли индекс на этой колонке? → **создай**, если фильтруют/сортируют по ней.

### Каждый блок — полностью завершённый

Не оставляй «хвостов». Завершённый блок означает:
- ✅ Все таски в плане выполнены
- ✅ Все quality gates зелёные
- ✅ STATUS.md обновлён
- ✅ PR merged в main
- ✅ Staging задеплоен и проверен smoke'ом
- ✅ refresh-staging-snapshot пробежал и compare совпал
- ✅ Если применимо — инварианты I1-I7 на live staging возвращают 0 violations

Если хоть один пункт не выполнен — блок НЕ завершён, не переходи к следующему.

---

## Что НИКОГДА не делай

- ❌ Не пушь в main напрямую (только через PR, даже если сам merge'аешь сразу)
- ❌ Не мержь PR пока хоть один из quality gates красный
- ❌ Не деплой в production (старая calc.recycleobject.ru — табу)
- ❌ Не меняй `index.html` старого фронта (старая calc продолжает работать)
- ❌ Не удаляй старые `js/*.js` файлы (это Stage D, не сейчас)
- ❌ Не трогай Supabase (read-only через service key)
- ❌ Не публикуй секреты в коммитах (`.env`, ключи) — `.gitignore` это покрывает, но дублируй визуально
- ❌ Не отключай тесты чтобы пройти CI («skip flaky test») — чини
- ❌ Не игнорируй ошибки. Если что-то падает — разберись.
- ❌ Не «улучшай» формулы калькулятора. Только 1:1, golden-master заставит.
- ❌ Не переписывай 1:1 склад. Применяй редизайн из WAREHOUSE-INTERACTION-MAP.

---

## Что ВСЕГДА делай

- ✅ Перед коммитом — `npm test`
- ✅ Перед `gh pr create` — все тесты зелёные локально и на CI
- ✅ Каждый коммит — атомарный (одна логическая правка)
- ✅ Сообщение коммита — императив, кратко (`Add X`, `Fix Y`, `Refactor Z`)
- ✅ Если меняешь схему — обязательно миграция в `ops/db/migrations/NNN_*.sql`
- ✅ Если меняешь refresh-логику — обновляй `ops/scripts/compare-datasets.mjs`
- ✅ После каждой существенной работы — обновляй `docs/superpowers/STATUS.md`
- ✅ Если код использует что-то из плейбука/STABILITY-PROGRAM — добавь комментарий ссылающийся на документ

---

## Секреты и доступы

Тебе потребуются:

| Что | Где взять | На что |
|---|---|---|
| SSH ключ к VPS | `~/.ssh/id_ed25519` (уже есть локально) | SSH доступ к ops-staging.recycleobject.ru |
| SUPABASE_SERVICE_KEY | Попроси у владельца, передаст через env / 1Password | Чтение из Supabase для refresh-скриптов |
| Postgres password | Лежит на VPS в `/srv/ops/infra/.env`, локально не нужен (только при ssh + docker exec) | Подключение к Postgres |
| Selectel S3 access key | Попроси у владельца после создания bucket'ов | Storage migration (Block 6, 10, 13) |
| GitHub Actions deploy SSH key | Уже добавлен (см. Block 1 Task 8 step 2) | CI деплой |
| Telegram bot token | Попроси (хранится у владельца) | Block 12 (бот) |
| UptimeRobot account | Попроси доступ или создай новый бесплатный | Block 1 Task 11 |

При запросе секрета у пользователя — указывай **точно зачем** и **в какое env поле** ты его положишь.

---

## Базовые команды

```bash
# Текущая ветка и статус
git status
git branch --show-current

# Запустить локально dev API + web
docker run -d --name ops-pg-dev -e POSTGRES_USER=ops -e POSTGRES_PASSWORD=ops_dev_password \
  -e POSTGRES_DB=ops -p 127.0.0.1:5433:5432 postgres:16-alpine
cd ops/api && DATABASE_URL=postgres://ops:ops_dev_password@127.0.0.1:5433/ops node src/index.js &
cd ../web && npm run dev

# Прогнать тесты
cd ops/api && TEST_DATABASE_URL=postgres://ops:ops_dev_password@127.0.0.1:5433/ops npm test

# Подключиться к VPS
ssh -i ~/.ssh/id_ed25519 root@ops-staging.recycleobject.ru
# или
ssh -i ~/.ssh/id_ed25519 ops@ops-staging.recycleobject.ru

# Логи на VPS
ssh ops@ops-staging.recycleobject.ru "cd /srv/ops/infra && docker compose logs -f api"

# Refresh staging данных
SUPABASE_URL=https://jbpmorruwjrxcieqlbmd.supabase.co \
SUPABASE_SERVICE_KEY=... \
DATABASE_URL=postgres://ops:...@ops-staging.recycleobject.ru:5432/ops \
  node ops/scripts/refresh-staging-snapshot.mjs

# Открыть PR
gh pr create --title "Block N: <topic>" --body "..."
```

---

## Сигнал «готово к cutover»

После Block 16 — выполни Stage B (`docs/superpowers/plans/2026-05-15-stage-B-test.md`). Это включает:
- Все тесты зелёные
- Все 7 инвариантов на staging возвращают 0 строк
- Свежий refresh
- Ручная сверка ≥ 10 реальных заказов (это сделает пользователь, не ты)
- p95 latency ≤ 200 мс
- Performance check ОК

Когда всё зелёное — пиши в STATUS.md «ГОТОВО К STAGE C (cutover)». Дальше cutover-день делает владелец (он же `pollinacherpovitskaya@gmail.com`).

---

## Финальная заметка

Это многонедельный проект. Если что-то идёт не по плану — это нормально. Останавливайся, описывай в STATUS.md, жди инструкций. Лучше потратить 5 минут на разъяснение, чем 5 часов на починку неправильно понятого.

Удачи!

---

## Первая задача прямо сейчас

После прочтения этого документа и всех ссылочных доков, **открой план Block 1 и выполни Task 4** (Postgres + DB-aware health):

`docs/superpowers/plans/2026-05-15-block-1-infrastructure.md` → раздел «Task 4: Подключение к Postgres + расширить /api/health».

Текущая ветка `block-1-infrastructure`. Не создавай новую — продолжай в этой. После Block 1 (Tasks 4-11) выполнен — PR в main, и дальше начинай блок 2 (Auth) в новой ветке.

Поехали.
