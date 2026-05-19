#!/usr/bin/env bash
# Один скрипт «что сейчас с миграцией». Запуск:
#
#   ./check-progress.sh
#
# Что показывает:
#  - Текущий статус (STATUS.md)
#  - Последние коммиты
#  - Открытые / последние PR на GitHub
#  - Жив ли staging-сервер
#  - Когда был последний refresh staging-данных

set +e
cd "$(dirname "$0")"

# Цвета для читаемости
B="\033[1m"
G="\033[32m"
Y="\033[33m"
R="\033[31m"
N="\033[0m"

echo -e "${B}=== Обновляю репо ===${N}"
git fetch --quiet origin 2>/dev/null
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_MAIN=$(git rev-parse origin/main 2>/dev/null || echo "?")
if [[ "$LOCAL_HEAD" != "$REMOTE_MAIN" ]]; then
  git pull --quiet 2>/dev/null
  echo -e "${G}Подтянул свежие коммиты из origin${N}"
fi
echo ""

echo -e "${B}=== STATUS.md ===${N}"
if [[ -f docs/superpowers/STATUS.md ]]; then
  cat docs/superpowers/STATUS.md
else
  echo -e "${Y}STATUS.md ещё не создан — Codex его сделает после первого таска${N}"
fi
echo ""

echo -e "${B}=== Последние 15 коммитов ===${N}"
git log --oneline -15 --format="%C(yellow)%h%C(reset) %C(green)%cr%C(reset) %s"
echo ""

echo -e "${B}=== Открытые pull requests ===${N}"
gh pr list 2>/dev/null || echo -e "${Y}gh CLI не установлен или не залогинен${N}"
echo ""

echo -e "${B}=== Последние смерженные PR ===${N}"
gh pr list --state merged --limit 5 2>/dev/null || true
echo ""

echo -e "${B}=== Staging сервер (ops-staging.recycleobject.ru) ===${N}"
HEALTH=$(curl -sS --max-time 5 https://ops-staging.recycleobject.ru/api/health 2>/dev/null)
if [[ -n "$HEALTH" ]]; then
  echo -e "${G}✓ Жив${N}"
  echo "$HEALTH" | head -1
else
  echo -e "${R}✗ Не отвечает (либо ещё не задеплоен, либо что-то сломалось)${N}"
fi
echo ""

echo -e "${B}=== Последний refresh staging-данных ===${N}"
LAST_REFRESH=$(ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=5 -o BatchMode=yes \
  ops@ops-staging.recycleobject.ru "stat -c '%y' /var/log/ops-refresh.log 2>/dev/null | head -1" 2>/dev/null)
if [[ -n "$LAST_REFRESH" ]]; then
  echo "$LAST_REFRESH"
else
  echo -e "${Y}Auto-refresh ещё не настроен (это часть Block 3)${N}"
fi
echo ""

echo -e "${B}=== Что делать дальше ===${N}"
if [[ -f docs/superpowers/STATUS.md ]] && grep -q "^## Blockers / questions" docs/superpowers/STATUS.md; then
  BLOCKERS=$(awk '/^## Blockers \/ questions/,/^## /' docs/superpowers/STATUS.md | head -20 | tail -19)
  if [[ -n "$BLOCKERS" ]] && [[ "$BLOCKERS" != *"(пусто если нет)"* ]] && [[ "$BLOCKERS" != *"empty"* ]]; then
    echo -e "${R}⚠️  Codex ждёт от тебя:${N}"
    echo "$BLOCKERS"
  else
    echo -e "${G}✓ Codex работает, твоего вмешательства не требует${N}"
  fi
fi
echo ""

echo -e "${B}Готово.${N} Полная инструкция — в docs/superpowers/CODEX-KICKOFF.md"
