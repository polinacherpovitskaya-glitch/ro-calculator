# Block 1 — Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять на Selectel VPS пустой работающий стек (Postgres + Node API + Caddy + Vue 3 SPA) с автоматическим деплоем из GitHub, TLS-сертификатом, ежесуточным бэкапом и health-эндпойнтом, отвечающим 200. После этого Блока 1 у нас есть фундамент, на котором будут строиться все последующие модули (auth, склад, заказы и т.д.).

**Architecture:** Один Selectel Cloud Server в Москве, на нём в Docker compose крутятся три контейнера: PostgreSQL 16, Node 20 + Express API, Caddy 2 (TLS, reverse proxy, статика SPA). Деплой — push в `main` → GitHub Actions → SSH rsync + `docker compose up -d`. Бэкап — systemd timer на VPS → `pg_dump` → Selectel Object Storage (S3-compatible) с retention 30 дней.

**Tech Stack:** Node.js 20, Express 4, `pg`, PostgreSQL 16, Caddy 2, Vue 3, Vite 5, TypeScript 5, Pinia, Vue Router, Docker, docker-compose, Ubuntu 22.04, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-05-15-ops-redesign-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.github/workflows/ops-deploy.yml` | **Create** | CI: lint+test+build, deploy to VPS на push в `main` с изменениями в `ops/**` |
| `ops/README.md` | **Create** | Главный playbook: как развернуть, как задеплоить, как восстановить из бэкапа |
| `ops/.gitignore` | **Create** | Игнорирует `node_modules/`, `dist/`, `.env`, `*.log` |
| `ops/infra/docker-compose.yml` | **Create** | Описание трёх сервисов: postgres, api, caddy + named volumes + сеть |
| `ops/infra/Caddyfile` | **Create** | TLS via Let's Encrypt; `/api/*` → API; всё остальное → статика из `/srv/web` |
| `ops/infra/.env.example` | **Create** | Шаблон переменных: `POSTGRES_PASSWORD`, `S3_*`, `DOMAIN` |
| `ops/infra/scripts/provision-vps.sh` | **Create** | Идемпотентный скрипт первичной настройки VPS (SSH-ключи, UFW, Docker, юзер) |
| `ops/infra/scripts/backup.sh` | **Create** | `pg_dump` → `s3cmd put` → ротация локально |
| `ops/infra/scripts/restore.sh` | **Create** | Скачать последний бэкап, развернуть в БД |
| `ops/infra/systemd/ops-backup.service` | **Create** | Юнит для одноразового запуска `backup.sh` |
| `ops/infra/systemd/ops-backup.timer` | **Create** | Таймер: каждые сутки в 03:00 МСК |
| `ops/api/package.json` | **Create** | `express`, `pg`, dev: native test runner |
| `ops/api/src/server.js` | **Create** | `createServer()` экспортирует Express app |
| `ops/api/src/index.js` | **Create** | Entry point, поднимает HTTP на `process.env.PORT` |
| `ops/api/src/db.js` | **Create** | Постгрес pool из `DATABASE_URL` |
| `ops/api/src/routes/health.js` | **Create** | `GET /api/health` — проверяет БД, возвращает статус |
| `ops/api/test/health.test.js` | **Create** | Native test runner: hits `/api/health` |
| `ops/api/Dockerfile` | **Create** | Multi-stage: deps → run |
| `ops/db/migrations/001_init.sql` | **Create** | Создаёт `app_meta(version TEXT, applied_at TIMESTAMPTZ)` + одна строка |
| `ops/db/migrate.sh` | **Create** | Применяет миграции из `db/migrations/` к БД |
| `ops/web/package.json` | **Create** | Vue 3 + Vite + TS + Pinia + vue-router |
| `ops/web/index.html` | **Create** | Vite entry HTML |
| `ops/web/vite.config.ts` | **Create** | Конфиг Vite |
| `ops/web/tsconfig.json` | **Create** | TypeScript конфиг |
| `ops/web/src/main.ts` | **Create** | Bootstrap Vue приложения |
| `ops/web/src/App.vue` | **Create** | Root компонент с `<router-view>` |
| `ops/web/src/router.ts` | **Create** | Один маршрут `/` → PlaceholderView |
| `ops/web/src/views/PlaceholderView.vue` | **Create** | Простая страница "Ops staging — ready" |
| `.gitignore` | **Modify** | Добавить `ops/api/node_modules/`, `ops/web/node_modules/`, `ops/web/dist/`, `ops/infra/.env` |

**Не входит в Блок 1** (откладывается на последующие блоки): авторизация, любые таблицы кроме `app_meta`, любые API кроме `/api/health`, любые экраны кроме placeholder, мониторинг через UptimeRobot (после деплоя на VPS).

---

## Chunk 1: Provisioning (MANUAL + scripts)

### Task 1: Подготовить Selectel и DNS

**Files:**
- None (полностью ручные шаги, документируем результаты в `ops/README.md` в Task 11)

- [ ] **Step 1: Создать Selectel аккаунт**

**Manual step.** Зайди на https://selectel.ru. Зарегистрируйся (если ещё не зарегистрирован). Подтверди email. Привяжи карту для оплаты.

- [ ] **Step 2: Создать Cloud Server**

**Manual step.** В панели Selectel → "Облачная платформа" → "Серверы" → "Создать сервер".

Параметры:
- **Регион:** ru-7 (Москва) или ru-9 (Москва)
- **Образ:** Ubuntu 22.04 LTS
- **Конфигурация:** 2 vCPU, 2 GB RAM, 30 GB NVMe SSD (плоский тариф ≈ 500 ₽/мес)
- **Сеть:** публичный IPv4 (понадобится)
- **SSH-ключ:** добавь свой публичный ключ. Если не знаешь — выполни `ssh-keygen -t ed25519 -C "ops-vps"` локально и добавь содержимое `~/.ssh/id_ed25519.pub`.
- **Имя сервера:** `ops-prod-1`

Запиши: **публичный IPv4**, **root-пароль** (если установился), **имя сервера**.

- [ ] **Step 3: Получить SSH-доступ**

**Manual step.** Локально:

```bash
ssh root@<IPV4>
```

Должно подключиться без пароля (по SSH-ключу). Если просит пароль — значит ключ не привязался; добавь его через панель Selectel или `ssh-copy-id`.

После входа выполни (просто чтобы убедиться):

```bash
cat /etc/os-release | grep PRETTY
uname -a
```

Expected: видишь `Ubuntu 22.04.x LTS`.

Выйди: `exit`.

- [ ] **Step 4: Создать DNS A-запись для `ops-staging.recycleobject.ru`**

**Manual step.** Открой панель управления DNS того же провайдера, где живёт `recycleobject.ru` (вероятно reg.ru или похожий). Добавь:

- **Тип:** A
- **Имя:** `ops-staging`
- **Значение:** публичный IPv4 VPS из Step 2
- **TTL:** 300 (короткий, чтобы быстро менять)

Проверь:

```bash
dig +short ops-staging.recycleobject.ru
```

Expected: возвращает IPv4 VPS (может занять 1-15 минут).

- [ ] **Step 5: Создать feature branch для всей работы Блока 1**

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator"
git checkout -b block-1-infrastructure
```

- [ ] **Step 6: Commit (пустой trail-marker)**

Чтобы зафиксировать старт Блока 1 в истории:

```bash
git commit --allow-empty -m "Block 1: start infrastructure work"
```

---

### Task 2: Hardening VPS + Docker через provision-скрипт

**Files:**
- Create: `ops/infra/scripts/provision-vps.sh`
- Modify: `.gitignore` (добавить пару строк)

- [ ] **Step 1: Создать каталог `ops/infra/scripts/`**

```bash
mkdir -p "ops/infra/scripts"
```

- [ ] **Step 2: Создать `ops/infra/scripts/provision-vps.sh`**

Содержимое:

```bash
#!/usr/bin/env bash
# Provision a fresh Ubuntu 22.04 VPS for ops stack.
# Idempotent: re-running is safe.
#
# Usage (run AS ROOT on the VPS):
#   bash provision-vps.sh
#
# Or remotely from your laptop:
#   scp ops/infra/scripts/provision-vps.sh root@<IP>:/tmp/
#   ssh root@<IP> "bash /tmp/provision-vps.sh"

set -euo pipefail

DEPLOY_USER="ops"
DEPLOY_HOME="/home/${DEPLOY_USER}"
APP_DIR="/srv/ops"

echo "==> Update apt and install base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release ufw fail2ban rsync s3cmd \
  postgresql-client-common postgresql-client htop

echo "==> Install Docker (official repo)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Create deploy user ${DEPLOY_USER}"
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"

echo "==> Copy root's SSH keys to ${DEPLOY_USER}"
mkdir -p "${DEPLOY_HOME}/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
  cp /root/.ssh/authorized_keys "${DEPLOY_HOME}/.ssh/authorized_keys"
fi
chmod 700 "${DEPLOY_HOME}/.ssh"
chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys" || true
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh"

echo "==> Create app directory ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

echo "==> Configure UFW firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Harden SSH (disable root login, password auth)"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh

echo "==> Enable fail2ban"
systemctl enable --now fail2ban

echo "==> Verify"
docker --version
docker compose version
sudo -u "${DEPLOY_USER}" docker ps >/dev/null

echo
echo "Provisioning complete."
echo "Next: log in as ${DEPLOY_USER}@<IP> (NOT root) and continue."
```

Set executable bit:

```bash
chmod +x ops/infra/scripts/provision-vps.sh
```

- [ ] **Step 3: Скопировать и запустить provision-скрипт на VPS**

Manual step:

```bash
scp ops/infra/scripts/provision-vps.sh root@<IPV4>:/tmp/
ssh root@<IPV4> "bash /tmp/provision-vps.sh"
```

Expected output (последняя строка): `Provisioning complete.`

Дальше проверь, что можешь зайти как `ops`:

```bash
ssh ops@<IPV4> "whoami && docker ps"
```

Expected: `ops` и пустой список контейнеров (HEADER только).

Проверь, что root через SSH больше не пускает по паролю (по ключу всё ещё пускает — это нормально):

```bash
ssh root@<IPV4> "whoami"
```

Expected: `root` (по ключу всё ещё работает).

- [ ] **Step 4: Modify `.gitignore`**

Открой `.gitignore` в корне репо. Перед строкой `.vercel` добавь блок:

```
ops/api/node_modules/
ops/web/node_modules/
ops/web/dist/
ops/infra/.env
*.log
```

- [ ] **Step 5: Commit**

```bash
git add ops/infra/scripts/provision-vps.sh .gitignore
git commit -m "Add VPS provisioning script and ops gitignore rules"
```

---

## Chunk 2: API skeleton with /api/health (TDD)

### Task 3: Создать Node API скелет + health endpoint

**Files:**
- Create: `ops/api/package.json`
- Create: `ops/api/src/server.js`
- Create: `ops/api/src/index.js`
- Create: `ops/api/src/routes/health.js`
- Create: `ops/api/test/health.test.js`

- [ ] **Step 1: Создать каталог и `package.json`**

```bash
mkdir -p ops/api/src/routes ops/api/test
cd ops/api
```

Создай `ops/api/package.json`:

```json
{
  "name": "ops-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.11.5"
  }
}
```

- [ ] **Step 2: Установить зависимости**

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator/ops/api"
npm install
```

Expected: появляются `node_modules/` и `package-lock.json`, никаких ошибок.

- [ ] **Step 3: Написать failing test для `/api/health`**

Создай `ops/api/test/health.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('GET /api/health returns 200 with status "ok"', async (t) => {
  const app = createServer();
  const server = app.listen(0); // 0 = random free port
  t.after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /api/health includes a version field', async (t) => {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await res.json();

  assert.ok(typeof body.version === 'string');
  assert.ok(body.version.length > 0);
});
```

- [ ] **Step 4: Запустить тесты — должны упасть**

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator/ops/api"
npm test
```

Expected: FAIL с сообщением вроде `Cannot find module '../src/server.js'`. Это правильно — мы ещё не написали сервер.

- [ ] **Step 5: Реализовать минимальный сервер**

Создай `ops/api/src/server.js`:

```js
import express from 'express';
import healthRoute from './routes/health.js';

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api', healthRoute);
  return app;
}
```

Создай `ops/api/src/routes/health.js`:

```js
import { Router } from 'express';

const router = Router();
const VERSION = process.env.APP_VERSION || 'dev';

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    uptime_seconds: Math.round(process.uptime()),
  });
});

export default router;
```

Создай `ops/api/src/index.js`:

```js
import { createServer } from './server.js';

const PORT = Number(process.env.PORT || 3000);
const app = createServer();
app.listen(PORT, () => {
  console.log(`[ops-api] listening on ${PORT} (version=${process.env.APP_VERSION || 'dev'})`);
});
```

- [ ] **Step 6: Запустить тесты — должны пройти**

```bash
npm test
```

Expected: `pass 2` (или аналогичное), exit 0.

- [ ] **Step 7: Запустить сервер вручную, проверить curl'ом**

В одном терминале:

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator/ops/api"
node src/index.js
```

Expected: `[ops-api] listening on 3000 (version=dev)`.

В другом терминале:

```bash
curl -sS http://127.0.0.1:3000/api/health | head -1
```

Expected:

```json
{"status":"ok","version":"dev","uptime_seconds":<число>}
```

Останови сервер: `Ctrl-C`.

- [ ] **Step 8: Commit**

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator"
git add ops/api/
git commit -m "Add ops/api skeleton with /api/health endpoint"
```

---

## Chunk 3: Postgres + db.js + DB-aware health

### Task 4: Подключение к Postgres + расширить /api/health

**Files:**
- Create: `ops/api/src/db.js`
- Create: `ops/db/migrations/001_init.sql`
- Create: `ops/db/migrate.sh`
- Modify: `ops/api/src/routes/health.js`
- Modify: `ops/api/test/health.test.js`

- [ ] **Step 1: Создать `ops/db/migrations/001_init.sql`**

```bash
mkdir -p ops/db/migrations
```

Содержимое файла `ops/db/migrations/001_init.sql`:

```sql
-- 001_init.sql
-- Smallest possible schema: a single metadata row so we can prove the
-- connection works and migrations are tracked. Real tables come in later blocks.

CREATE TABLE IF NOT EXISTS app_meta (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    version     TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT app_meta_single_row CHECK (id = 1)
);

INSERT INTO app_meta (id, version) VALUES (1, '001-init')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] **Step 2: Создать `ops/db/migrate.sh`**

```bash
#!/usr/bin/env bash
# Apply all SQL files in ops/db/migrations/ to the database
# defined in DATABASE_URL or in arguments.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./migrate.sh
#   ./migrate.sh postgres://user:pass@host:5432/db

set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "Usage: $0 <database_url>"
  echo "Or set DATABASE_URL environment variable."
  exit 1
fi

MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

echo "==> Applying migrations from ${MIGRATIONS_DIR}"
for f in "${MIGRATIONS_DIR}"/*.sql; do
  echo "    Running $(basename "$f")"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "$f"
done

echo "==> Migrations complete."
```

```bash
chmod +x ops/db/migrate.sh
```

- [ ] **Step 3: Запустить локальный Postgres (Docker) для разработки**

```bash
docker run -d --name ops-pg-dev \
  -e POSTGRES_USER=ops \
  -e POSTGRES_PASSWORD=ops_dev_password \
  -e POSTGRES_DB=ops \
  -p 127.0.0.1:5433:5432 \
  postgres:16-alpine
```

Подожди 5-10 секунд (контейнер стартует).

Проверь:

```bash
docker exec ops-pg-dev pg_isready -U ops
```

Expected: `/var/run/postgresql:5432 - accepting connections`.

- [ ] **Step 4: Применить миграцию**

```bash
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" \
  ops/db/migrate.sh
```

Expected: видишь `Running 001_init.sql` и `Migrations complete.`

Проверь, что таблица создалась:

```bash
docker exec ops-pg-dev psql -U ops -d ops -c "SELECT * FROM app_meta;"
```

Expected:

```
 id | version | applied_at
----+---------+------------
  1 | 001-init | ...
```

- [ ] **Step 5: Создать `ops/api/src/db.js`**

```js
import pg from 'pg';

const { Pool } = pg;

let _pool = null;

export function getPool() {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    _pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
  }
  return _pool;
}

export async function pingDatabase() {
  const pool = getPool();
  const start = Date.now();
  const result = await pool.query("SELECT 'pong' AS pong");
  const latencyMs = Date.now() - start;
  return {
    ok: result.rows[0]?.pong === 'pong',
    latency_ms: latencyMs,
  };
}
```

- [ ] **Step 6: Расширить тест `health.test.js` с проверкой БД**

Перепиши `ops/api/test/health.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';

async function startServer(envOverrides = {}) {
  const oldEnv = { ...process.env };
  Object.assign(process.env, envOverrides);
  const app = createServer();
  const server = app.listen(0);
  return {
    port: server.address().port,
    close: () => { server.close(); Object.assign(process.env, oldEnv); },
  };
}

test('GET /api/health returns 200 with status "ok"', async (t) => {
  const s = await startServer({ DATABASE_URL: DB_URL });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /api/health includes version', async (t) => {
  const s = await startServer({ DATABASE_URL: DB_URL });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);
  const body = await res.json();
  assert.ok(typeof body.version === 'string');
  assert.ok(body.version.length > 0);
});

test('GET /api/health reports database ok=true when DB is reachable', async (t) => {
  const s = await startServer({ DATABASE_URL: DB_URL });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);
  const body = await res.json();
  assert.equal(body.db.ok, true);
  assert.ok(typeof body.db.latency_ms === 'number');
});

test('GET /api/health reports database ok=false when DB is unreachable', async (t) => {
  const s = await startServer({ DATABASE_URL: 'postgres://ops:wrong@127.0.0.1:5433/ops' });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);
  const body = await res.json();
  assert.equal(body.db.ok, false);
  assert.ok(typeof body.db.error === 'string');
});
```

- [ ] **Step 7: Запустить тесты — должны упасть**

```bash
cd ops/api && npm test
```

Expected: новые тесты падают (`db` поля нет в ответе health). Старые 2 проходят.

- [ ] **Step 8: Расширить `ops/api/src/routes/health.js`**

```js
import { Router } from 'express';
import { pingDatabase } from '../db.js';

const router = Router();
const VERSION = process.env.APP_VERSION || 'dev';

router.get('/health', async (req, res) => {
  let db;
  try {
    db = await pingDatabase();
  } catch (error) {
    db = { ok: false, error: String(error?.message || error) };
  }
  res.json({
    status: db.ok ? 'ok' : 'degraded',
    version: VERSION,
    uptime_seconds: Math.round(process.uptime()),
    db,
  });
});

export default router;
```

- [ ] **Step 9: Запустить тесты — должны пройти**

```bash
npm test
```

Expected: все 4 теста pass.

Если ОДИН тест "ok=false when DB is unreachable" висит долго: значит pg-pool ретраит. Это OK на этой итерации; если совсем долго (>5 сек) — мы потом добавим явный connection timeout. Пока двигаемся.

- [ ] **Step 10: Curl-проверка**

В одном терминале:

```bash
cd ops/api
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node src/index.js
```

В другом:

```bash
curl -sS http://127.0.0.1:3000/api/health
```

Expected:

```json
{"status":"ok","version":"dev","uptime_seconds":N,"db":{"ok":true,"latency_ms":N}}
```

- [ ] **Step 11: Commit**

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator"
git add ops/api/src/db.js ops/api/src/routes/health.js ops/api/test/health.test.js ops/db/
git commit -m "Add Postgres connection and DB-aware /api/health"
```

---

## Chunk 4: Vue 3 SPA skeleton

### Task 5: Создать пустой Vue 3 SPA с роутером

**Files:**
- Create: `ops/web/package.json`
- Create: `ops/web/vite.config.ts`
- Create: `ops/web/tsconfig.json`
- Create: `ops/web/index.html`
- Create: `ops/web/src/main.ts`
- Create: `ops/web/src/App.vue`
- Create: `ops/web/src/router.ts`
- Create: `ops/web/src/views/PlaceholderView.vue`

- [ ] **Step 1: Создать структуру**

```bash
mkdir -p ops/web/src/views ops/web/public
cd ops/web
```

- [ ] **Step 2: Создать `ops/web/package.json`**

```json
{
  "name": "ops-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.27",
    "vue-router": "^4.3.2",
    "pinia": "^2.1.7"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.4",
    "typescript": "^5.4.5",
    "vue-tsc": "^2.0.16",
    "vite": "^5.2.10"
  }
}
```

- [ ] **Step 3: Установить зависимости**

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator/ops/web"
npm install
```

Expected: появляются `node_modules/`, `package-lock.json`. Без ошибок.

- [ ] **Step 4: Создать `ops/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 5: Создать `ops/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "useDefineForClassFields": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

- [ ] **Step 6: Создать `ops/web/index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RO Ops</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Создать `ops/web/src/main.ts`**

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
```

- [ ] **Step 8: Создать `ops/web/src/App.vue`**

```vue
<template>
  <router-view />
</template>

<script setup lang="ts">
</script>
```

- [ ] **Step 9: Создать `ops/web/src/router.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router';
import PlaceholderView from './views/PlaceholderView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: PlaceholderView },
  ],
});

export default router;
```

- [ ] **Step 10: Создать `ops/web/src/views/PlaceholderView.vue`**

```vue
<template>
  <main class="placeholder">
    <h1>RO Ops — staging</h1>
    <p>Infrastructure ready. Block 1 complete.</p>
    <p>API health: <code>{{ healthStatus }}</code></p>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const healthStatus = ref('loading...');

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    const body = await res.json();
    healthStatus.value = `${body.status} (db: ${body.db?.ok ? 'ok' : 'down'})`;
  } catch (error) {
    healthStatus.value = `error: ${String(error)}`;
  }
});
</script>

<style scoped>
.placeholder {
  font-family: system-ui, sans-serif;
  max-width: 40rem;
  margin: 4rem auto;
  padding: 2rem;
  line-height: 1.5;
}
.placeholder h1 {
  margin-top: 0;
}
.placeholder code {
  background: #eee;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}
</style>
```

- [ ] **Step 11: Запустить dev server, проверить визуально**

В одном терминале (если ещё не запущен):

```bash
cd ops/api
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" node src/index.js
```

В другом:

```bash
cd ops/web
npm run dev
```

Открой в браузере http://localhost:5173. Должно показать заголовок "RO Ops — staging" и `API health: ok (db: ok)`.

Останови оба сервера (`Ctrl-C`).

- [ ] **Step 12: Прогнать build**

```bash
cd ops/web
npm run build
```

Expected: создаётся `dist/index.html`, `dist/assets/*.js`, без ошибок TypeScript.

- [ ] **Step 13: Commit**

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator"
git add ops/web/package.json ops/web/package-lock.json ops/web/vite.config.ts ops/web/tsconfig.json ops/web/index.html ops/web/src/ ops/web/public/
git commit -m "Add ops/web Vue 3 SPA skeleton with placeholder view"
```

---

## Chunk 5: Caddy + docker-compose

### Task 6: Caddy reverse proxy + docker-compose оркестрация

**Files:**
- Create: `ops/api/Dockerfile`
- Create: `ops/infra/Caddyfile`
- Create: `ops/infra/docker-compose.yml`
- Create: `ops/infra/.env.example`

- [ ] **Step 1: Создать `ops/api/Dockerfile`**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Создать `ops/infra/Caddyfile`**

```
{$DOMAIN} {
    encode gzip

    handle /api/* {
        reverse_proxy api:3000
    }

    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }
}
```

Заметка: `{$DOMAIN}` подставится из переменной окружения (например, `ops-staging.recycleobject.ru`). Caddy сам выпустит сертификат от Let's Encrypt.

- [ ] **Step 3: Создать `ops/infra/.env.example`**

```env
# Copy to .env on the VPS and fill in real values.
# DO NOT commit the real .env.

DOMAIN=ops-staging.recycleobject.ru

POSTGRES_USER=ops
POSTGRES_PASSWORD=<сгенерируй: openssl rand -hex 32>
POSTGRES_DB=ops

# Filled in Task 8 (Object Storage):
S3_ENDPOINT=https://s3.storage.selcloud.ru
S3_BUCKET=ro-ops-backups
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

- [ ] **Step 4: Создать `ops/infra/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: ops-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ../api
      dockerfile: Dockerfile
    image: ops-api:local
    container_name: ops-api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      PORT: "3000"
      APP_VERSION: ${APP_VERSION:-dev}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - internal

  caddy:
    image: caddy:2.8-alpine
    container_name: ops-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ../web/dist:/srv/web:ro
      - caddy-data:/data
      - caddy-config:/config
    environment:
      DOMAIN: ${DOMAIN}
    depends_on:
      - api
    networks:
      - internal

volumes:
  postgres-data:
  caddy-data:
  caddy-config:

networks:
  internal:
    driver: bridge
```

- [ ] **Step 5: Локальный smoke (без TLS, с docker-compose локально)**

Сначала останови dev'овский Postgres, чтобы не было конфликта порта:

```bash
docker stop ops-pg-dev && docker rm ops-pg-dev
```

Подготовь `.env` для локального теста. Создай `ops/infra/.env.local`:

```env
DOMAIN=localhost:8080
POSTGRES_USER=ops
POSTGRES_PASSWORD=local_dev_pw
POSTGRES_DB=ops
APP_VERSION=dev-compose
```

Для локального теста временно подправь `ops/infra/Caddyfile` чтобы он слушал на HTTP без TLS:

```bash
# Создай ops/infra/Caddyfile.local
cat > ops/infra/Caddyfile.local <<'EOF'
:8080 {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }
}
EOF
```

Локальный compose override `ops/infra/docker-compose.local.yml`:

```yaml
services:
  caddy:
    ports:
      - "8080:8080"
    volumes:
      - ./Caddyfile.local:/etc/caddy/Caddyfile:ro
      - ../web/dist:/srv/web:ro
```

Билд web:

```bash
cd ops/web && npm run build && cd ..
```

Запуск compose:

```bash
cd "/Users/krollipolli/Documents/Github/RO calculator/ops/infra"
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

Подожди ~15 секунд (билд + старт). Применить миграцию (теперь к compose'овой БД):

```bash
DATABASE_URL="postgres://ops:local_dev_pw@127.0.0.1:5432/ops" \
  ../db/migrate.sh
```

Если порт 5432 не выставлен наружу — миграцию запустим через `docker exec`:

```bash
docker cp ../db/migrations/001_init.sql ops-postgres:/tmp/001_init.sql
docker exec -i ops-postgres psql -U ops -d ops -f /tmp/001_init.sql
```

Проверки:

```bash
curl -sS http://localhost:8080/api/health
```

Expected: `{"status":"ok",...,"db":{"ok":true,...}}`.

```bash
curl -sS http://localhost:8080/ | head -20
```

Expected: HTML с `<title>RO Ops</title>` и `<div id="app">`.

Останови:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml down
```

- [ ] **Step 6: Удалить временные локальные файлы**

Файлы `Caddyfile.local`, `docker-compose.local.yml`, `.env.local` использовались только для локального теста — они в `.gitignore` (через шаблон `.env`) или просто временные. Удалим:

```bash
rm ops/infra/Caddyfile.local ops/infra/docker-compose.local.yml ops/infra/.env.local
```

- [ ] **Step 7: Commit**

```bash
git add ops/api/Dockerfile ops/infra/Caddyfile ops/infra/docker-compose.yml ops/infra/.env.example
git commit -m "Add docker-compose stack with Caddy reverse proxy"
```

---

## Chunk 6: First deploy to VPS

### Task 7: Залить стек на VPS и убедиться, что TLS работает

**Files:**
- None (этот шаг — деплой существующих файлов)

- [ ] **Step 1: Сгенерировать `POSTGRES_PASSWORD` для прода**

```bash
openssl rand -hex 32
```

Скопируй значение в безопасное место (1Password или менеджер паролей). Понадобится в Step 2.

- [ ] **Step 2: Залить файлы на VPS**

```bash
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env' \
  ops/ ops@<IPV4>:/srv/ops/
```

Expected: rsync скопирует `api/`, `web/`, `infra/`, `db/`. Без ошибок.

- [ ] **Step 3: Создать `.env` на VPS**

```bash
ssh ops@<IPV4>
cd /srv/ops/infra
cp .env.example .env
nano .env  # или vim, или vi
```

В `.env` подставь:
- `DOMAIN=ops-staging.recycleobject.ru`
- `POSTGRES_PASSWORD=<из Step 1>`
- Остальные поля S3 пока оставь пустыми — заполним в Task 8.

Сохрани и выйди (`Ctrl-O Enter Ctrl-X` для nano).

- [ ] **Step 4: Собрать web на VPS**

```bash
# Всё ещё на VPS, в директории /srv/ops
cd /srv/ops/web
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine sh -c "npm ci && npm run build"
```

Expected: `dist/` создан в `/srv/ops/web/dist`. Без ошибок.

(Альтернатива: установить node-20 на VPS и `npm install && npm run build`. Но через docker контейнер чище — VPS остаётся без Node.)

- [ ] **Step 5: Запустить compose**

```bash
cd /srv/ops/infra
docker compose --env-file .env up -d --build
```

Expected: 3 контейнера запускаются — `ops-postgres`, `ops-api`, `ops-caddy`.

Проверка:

```bash
docker compose ps
```

Expected: все три "running" или "healthy".

- [ ] **Step 6: Применить миграции**

```bash
docker cp /srv/ops/db/migrations/001_init.sql ops-postgres:/tmp/001_init.sql
docker exec -i ops-postgres psql -U ops -d ops -f /tmp/001_init.sql
```

Expected: `INSERT 0 1` и `COMMIT`, без ошибок.

- [ ] **Step 7: Проверить логи Caddy на выпуск TLS**

```bash
docker logs ops-caddy 2>&1 | tail -30
```

Expected: видишь что-то вроде:
- `obtaining certificate for ops-staging.recycleobject.ru`
- `certificate obtained successfully`

Если TLS не выпускается — проверь, что:
1. DNS A-запись действительно указывает на VPS (`dig +short ops-staging.recycleobject.ru`).
2. Порты 80 и 443 открыты (UFW status).
3. В `Caddyfile` правильный домен (через переменную `{$DOMAIN}`).

- [ ] **Step 8: Smoke с твоей машины**

С твоей машины (не с VPS):

```bash
curl -sS https://ops-staging.recycleobject.ru/api/health
```

Expected:

```json
{"status":"ok","version":"dev","uptime_seconds":N,"db":{"ok":true,"latency_ms":N}}
```

И:

```bash
curl -sS https://ops-staging.recycleobject.ru/ | grep '<title>'
```

Expected: `<title>RO Ops</title>`.

Открой `https://ops-staging.recycleobject.ru/` в браузере. Должна показаться placeholder-страница "RO Ops — staging" с `API health: ok (db: ok)`.

- [ ] **Step 9: Commit (документ обновится в Task 11; пока пустой commit для трекинга)**

```bash
# На твоей машине, не VPS
cd "/Users/krollipolli/Documents/Github/RO calculator"
git commit --allow-empty -m "Block 1: first deploy live on ops-staging.recycleobject.ru"
```

---

## Chunk 7: GitHub Actions deploy

### Task 8: Настроить автодеплой по push в main

**Files:**
- Create: `.github/workflows/ops-deploy.yml`

- [ ] **Step 1: Подготовить SSH-ключ для GitHub Actions**

**Manual step**, локально на твоей машине:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ops_deploy_key -N "" -C "github-actions-ops-deploy"
```

Это создаст пару `~/.ssh/ops_deploy_key` (приватный, в GitHub Secret) и `~/.ssh/ops_deploy_key.pub` (публичный, на VPS).

Добавь публичный ключ на VPS:

```bash
ssh-copy-id -i ~/.ssh/ops_deploy_key.pub ops@<IPV4>
```

Или вручную:

```bash
cat ~/.ssh/ops_deploy_key.pub | ssh ops@<IPV4> "cat >> ~/.ssh/authorized_keys"
```

Проверь:

```bash
ssh -i ~/.ssh/ops_deploy_key ops@<IPV4> "whoami"
```

Expected: `ops`.

- [ ] **Step 2: Добавить секреты в GitHub**

**Manual step.** Зайди в репо на GitHub → Settings → Secrets and variables → Actions → New repository secret. Создай:

| Имя | Значение |
|---|---|
| `OPS_SSH_PRIVATE_KEY` | Содержимое `~/.ssh/ops_deploy_key` (приватный ключ, целиком) |
| `OPS_HOST` | IPv4 адрес VPS |
| `OPS_USER` | `ops` |

- [ ] **Step 3: Создать `.github/workflows/ops-deploy.yml`**

```yaml
name: Deploy ops stack

on:
  push:
    branches: [main]
    paths:
      - 'ops/**'
      - '.github/workflows/ops-deploy.yml'

concurrency:
  group: ops-deploy
  cancel-in-progress: false

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: ops
          POSTGRES_PASSWORD: ci_password
          POSTGRES_DB: ops
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: |
            ops/api/package-lock.json
            ops/web/package-lock.json

      - name: Install API deps
        run: |
          cd ops/api
          npm ci

      - name: Apply migrations
        env:
          DATABASE_URL: postgres://ops:ci_password@localhost:5432/ops
        run: |
          sudo apt-get install -y postgresql-client
          bash ops/db/migrate.sh

      - name: Run API tests
        env:
          TEST_DATABASE_URL: postgres://ops:ci_password@localhost:5432/ops
        run: |
          cd ops/api
          npm test

      - name: Install Web deps and build
        run: |
          cd ops/web
          npm ci
          npm run build

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.OPS_SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.OPS_HOST }} >> ~/.ssh/known_hosts

      - name: Rsync to VPS
        run: |
          rsync -avz --delete \
            -e "ssh -i ~/.ssh/deploy_key" \
            --exclude='node_modules' \
            --exclude='.env' \
            ops/ ${{ secrets.OPS_USER }}@${{ secrets.OPS_HOST }}:/srv/ops/

      - name: Deploy on VPS
        run: |
          ssh -i ~/.ssh/deploy_key ${{ secrets.OPS_USER }}@${{ secrets.OPS_HOST }} bash <<'REMOTE'
            set -euo pipefail
            cd /srv/ops/infra
            docker compose --env-file .env up -d --build
            # Apply any pending migrations
            for f in /srv/ops/db/migrations/*.sql; do
              docker cp "$f" ops-postgres:/tmp/migration.sql
              docker exec ops-postgres psql -U ops -d ops -f /tmp/migration.sql || true
            done
          REMOTE

      - name: Health check
        run: |
          sleep 15
          for i in 1 2 3 4 5; do
            if curl -sSf "https://ops-staging.recycleobject.ru/api/health" > /dev/null; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i failed, retrying..."
            sleep 5
          done
          echo "Health check failed after retries"
          curl -sS "https://ops-staging.recycleobject.ru/api/health" || true
          exit 1
```

- [ ] **Step 4: Commit + push**

```bash
git add .github/workflows/ops-deploy.yml
git commit -m "Add GitHub Actions deploy workflow for ops stack"
git push origin block-1-infrastructure
```

- [ ] **Step 5: Открыть PR и убедиться что CI зелёный**

Создай PR `block-1-infrastructure → main` в GitHub UI. Дождись CI (вкладка Checks). Должен пройти job `test-and-deploy`. 

**Важно:** на этом этапе CI собирает и тестирует, но НЕ деплоит, потому что workflow триггерится только на push в main (а не на PR). Это правильно — деплой только после merge.

Если CI красный — почитай логи, поправь, перепушь.

- [ ] **Step 6: Merge PR в main и наблюдать деплой**

После того как ревью прошло (или просто squash merge) — наблюдай вкладку Actions: workflow должен запуститься, прогнать тесты, потом задеплоить и сделать health check.

Expected: всё зелёное, и `https://ops-staging.recycleobject.ru/api/health` всё ещё отвечает 200.

- [ ] **Step 7: Вернуться в feature branch (для остальных задач)**

```bash
git checkout main
git pull
git checkout -b block-1-infrastructure-part2
```

(После merge'а ветка `block-1-infrastructure` уже не нужна — дальше работаем в новой.)

---

## Chunk 8: Backups

### Task 9: Selectel Object Storage + бэкап-скрипт + systemd timer

**Files:**
- Create: `ops/infra/scripts/backup.sh`
- Create: `ops/infra/systemd/ops-backup.service`
- Create: `ops/infra/systemd/ops-backup.timer`

- [ ] **Step 1: Создать bucket в Selectel Object Storage**

**Manual step.** В панели Selectel → "Облачные сервисы" → "Object Storage" → "Создать контейнер".

Параметры:
- **Имя:** `ro-ops-backups`
- **Тип:** приватный
- **Регион:** ru-7 (Москва)

Запиши **endpoint** контейнера (он показывается; обычно вида `https://s3.storage.selcloud.ru`).

- [ ] **Step 2: Создать сервисный пользователь и токены для S3**

**Manual step.** В Selectel → "Управление" → "Доступ" → "Сервисные пользователи" → "Создать".

Параметры:
- **Имя:** `ops-backup`
- **Роль:** Object Storage Operator на проекте

После создания — на странице пользователя сгенерируй S3-credentials: ключ доступа (access key) и секрет (secret key). Запиши оба в безопасное место.

- [ ] **Step 3: Добавить S3-секреты в `.env` на VPS**

```bash
ssh ops@<IPV4>
cd /srv/ops/infra
nano .env
```

Заполни:

```env
S3_ENDPOINT=https://s3.storage.selcloud.ru
S3_BUCKET=ro-ops-backups
S3_ACCESS_KEY=<access key из Step 2>
S3_SECRET_KEY=<secret key из Step 2>
```

Сохрани, выйди.

- [ ] **Step 4: Создать `ops/infra/scripts/backup.sh`**

(Создаёт файл локально, потом задеплоится через rsync.)

```bash
#!/usr/bin/env bash
# Daily backup of the ops Postgres database.
# Dumps the DB, gzips, uploads to Selectel Object Storage, rotates locally.
#
# Required environment variables (typically from /srv/ops/infra/.env):
#   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
#   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
#
# Usage:
#   bash backup.sh
#
# Schedule via systemd timer (see ops-backup.timer).

set -euo pipefail

ENV_FILE="/srv/ops/infra/.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

: "${POSTGRES_USER:?must be set}"
: "${POSTGRES_DB:?must be set}"
: "${S3_ENDPOINT:?must be set}"
: "${S3_BUCKET:?must be set}"
: "${S3_ACCESS_KEY:?must be set}"
: "${S3_SECRET_KEY:?must be set}"

BACKUP_DIR="/srv/ops/backups"
mkdir -p "${BACKUP_DIR}"

TS="$(date -u +%Y%m%d-%H%M)"
FILE="${BACKUP_DIR}/${POSTGRES_DB}-${TS}.sql.gz"

echo "==> [$(date -Iseconds)] pg_dump → ${FILE}"
docker exec -i ops-postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${FILE}"

SIZE=$(stat -c %s "${FILE}")
echo "==> Dump size: ${SIZE} bytes"

# Configure s3cmd inline (no global config file required)
S3CFG="$(mktemp)"
cat > "${S3CFG}" <<EOF
[default]
host_base = $(echo "${S3_ENDPOINT}" | sed 's|^https\?://||')
host_bucket = %(bucket)s.$(echo "${S3_ENDPOINT}" | sed 's|^https\?://||')
access_key = ${S3_ACCESS_KEY}
secret_key = ${S3_SECRET_KEY}
use_https = True
signature_v2 = False
EOF

echo "==> Upload to s3://${S3_BUCKET}/$(basename "${FILE}")"
s3cmd -c "${S3CFG}" put "${FILE}" "s3://${S3_BUCKET}/$(basename "${FILE}")"

rm -f "${S3CFG}"

echo "==> Rotate local backups (keep 7 days)"
find "${BACKUP_DIR}" -name "${POSTGRES_DB}-*.sql.gz" -mtime +7 -delete

echo "==> [$(date -Iseconds)] Backup complete."
```

```bash
chmod +x ops/infra/scripts/backup.sh
```

- [ ] **Step 5: Создать `ops/infra/systemd/ops-backup.service`**

```bash
mkdir -p ops/infra/systemd
```

Содержимое `ops/infra/systemd/ops-backup.service`:

```ini
[Unit]
Description=Ops Postgres backup → Selectel Object Storage
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=ops
Group=ops
ExecStart=/usr/bin/bash /srv/ops/infra/scripts/backup.sh
StandardOutput=journal
StandardError=journal
```

- [ ] **Step 6: Создать `ops/infra/systemd/ops-backup.timer`**

```ini
[Unit]
Description=Run ops Postgres backup daily at 03:00 MSK

[Timer]
OnCalendar=*-*-* 03:00:00 Europe/Moscow
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
```

- [ ] **Step 7: Push, дождаться деплоя, установить unit'ы на VPS**

```bash
git add ops/infra/scripts/backup.sh ops/infra/systemd/
git commit -m "Add daily Postgres backup to Selectel Object Storage"
git push origin block-1-infrastructure-part2
```

Создай PR, дождись CI, merge. После деплоя файлы появятся в `/srv/ops/infra/scripts/` на VPS.

Установка unit'ов на VPS (root нужен для копирования в `/etc/systemd/system`):

```bash
ssh root@<IPV4>
cp /srv/ops/infra/systemd/ops-backup.service /etc/systemd/system/
cp /srv/ops/infra/systemd/ops-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ops-backup.timer
systemctl list-timers | grep ops-backup
```

Expected: видишь `ops-backup.timer` в списке с `Next:` на 03:00 завтра.

- [ ] **Step 8: Запустить бэкап вручную, проверить что файл оказался в Object Storage**

```bash
# Всё ещё на VPS, либо как root либо как ops
systemctl start ops-backup.service
journalctl -u ops-backup.service --since "1 minute ago"
```

Expected: видишь логи `pg_dump → ...`, `Upload to s3://...`, `Backup complete.`

Проверь файл в Object Storage через панель Selectel: должен появиться `ops-DDMMYYYY-HHMM.sql.gz` в bucket `ro-ops-backups`.

Локально на VPS:

```bash
ls -la /srv/ops/backups/
```

Expected: один свежий `.sql.gz` файл.

---

## Chunk 9: Restore drill + UptimeRobot + final README

### Task 10: Restore-скрипт + проверка восстановления

**Files:**
- Create: `ops/infra/scripts/restore.sh`

- [ ] **Step 1: Создать `ops/infra/scripts/restore.sh`**

```bash
#!/usr/bin/env bash
# Restore the Postgres database from the latest (or a specified) backup in
# Selectel Object Storage.
#
# Usage:
#   bash restore.sh           # restore latest backup (DANGER: overwrites prod)
#   bash restore.sh <file>    # restore specific file (filename or s3 path)
#
# Recommend running on a STAGING/TEST VPS, not on production.

set -euo pipefail

ENV_FILE="/srv/ops/infra/.env"
[[ -f "${ENV_FILE}" ]] && { set -a; source "${ENV_FILE}"; set +a; }

: "${POSTGRES_USER:?must be set}"
: "${POSTGRES_DB:?must be set}"
: "${S3_ENDPOINT:?must be set}"
: "${S3_BUCKET:?must be set}"
: "${S3_ACCESS_KEY:?must be set}"
: "${S3_SECRET_KEY:?must be set}"

S3CFG="$(mktemp)"
cat > "${S3CFG}" <<EOF
[default]
host_base = $(echo "${S3_ENDPOINT}" | sed 's|^https\?://||')
host_bucket = %(bucket)s.$(echo "${S3_ENDPOINT}" | sed 's|^https\?://||')
access_key = ${S3_ACCESS_KEY}
secret_key = ${S3_SECRET_KEY}
use_https = True
signature_v2 = False
EOF

TARGET="${1:-}"
if [[ -z "${TARGET}" ]]; then
  TARGET=$(s3cmd -c "${S3CFG}" ls "s3://${S3_BUCKET}/" | awk '{print $4}' | grep "${POSTGRES_DB}-" | sort | tail -1)
  if [[ -z "${TARGET}" ]]; then
    echo "No backups found in s3://${S3_BUCKET}/"
    rm -f "${S3CFG}"
    exit 1
  fi
fi

LOCAL="/tmp/$(basename "${TARGET}")"
echo "==> Downloading ${TARGET}"
s3cmd -c "${S3CFG}" get --force "${TARGET}" "${LOCAL}"

echo "==> Restoring to database ${POSTGRES_DB} (DROPPING existing data!)"
read -p "Are you sure? Type 'yes' to continue: " CONFIRM
[[ "${CONFIRM}" == "yes" ]] || { echo "Cancelled."; rm -f "${LOCAL}" "${S3CFG}"; exit 1; }

docker exec ops-postgres dropdb -U "${POSTGRES_USER}" --if-exists "${POSTGRES_DB}_old" || true
docker exec ops-postgres psql -U "${POSTGRES_USER}" -d postgres -c "ALTER DATABASE ${POSTGRES_DB} RENAME TO ${POSTGRES_DB}_old;" || true
docker exec ops-postgres createdb -U "${POSTGRES_USER}" "${POSTGRES_DB}"
gunzip -c "${LOCAL}" | docker exec -i ops-postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

rm -f "${LOCAL}" "${S3CFG}"
echo "==> Restore complete. Old data preserved in database ${POSTGRES_DB}_old."
echo "    Drop it manually when satisfied: docker exec ops-postgres dropdb -U ${POSTGRES_USER} ${POSTGRES_DB}_old"
```

```bash
chmod +x ops/infra/scripts/restore.sh
```

- [ ] **Step 2: Тренировка restore drill (НА ЭТОМ ЖЕ VPS — БЕЗОПАСНО, потому что прод-данных пока почти нет)**

На текущем этапе в БД только `app_meta`. Это безопасно дропать.

```bash
ssh ops@<IPV4>
# Запусти restore latest backup. Тренировка.
bash /srv/ops/infra/scripts/restore.sh
# Ввести yes на запрос
```

Expected: скачивает свежий бэкап, дропает текущую БД (переименовывает в `_old`), создаёт новую, загружает дамп. Финальное сообщение `Restore complete.`

Проверь, что БД восстановилась:

```bash
docker exec ops-postgres psql -U ops -d ops -c "SELECT * FROM app_meta;"
```

Expected: видишь строку `(1, '001-init', ...)`.

И что приложение продолжает работать:

```bash
curl -sS https://ops-staging.recycleobject.ru/api/health
```

Expected: 200, `db.ok = true`.

Дропни старую БД:

```bash
docker exec ops-postgres dropdb -U ops ops_old
```

- [ ] **Step 3: Commit**

```bash
git add ops/infra/scripts/restore.sh
git commit -m "Add restore script with drill-tested recovery from S3"
```

---

### Task 11: UptimeRobot + ops/README.md

**Files:**
- Create: `ops/README.md`

- [ ] **Step 1: Зарегистрироваться в UptimeRobot**

**Manual step.** Зайди на https://uptimerobot.com → Sign up (free plan: до 50 мониторов, проверка каждые 5 минут).

- [ ] **Step 2: Создать монитор**

**Manual step.** UptimeRobot dashboard → Add New Monitor:
- **Monitor Type:** HTTP(s)
- **Friendly Name:** RO Ops Staging API Health
- **URL:** `https://ops-staging.recycleobject.ru/api/health`
- **Monitoring Interval:** 5 minutes
- **Alert Contacts:** твой email (и опционально Telegram через бота `@uptimerobot_bot`)

Сохранить. Через ~5 минут — должно показать "Up".

- [ ] **Step 3: Создать `ops/README.md`**

```markdown
# RO Ops Stack

Operational core of recycleobject.ru — переезжаем сюда со старого Vercel+Supabase
(см. `docs/superpowers/specs/2026-05-15-ops-redesign-design.md`).

## Status

- Stage A — Build (in progress)
- Staging domain: `ops-staging.recycleobject.ru`
- Production: not yet (cutover на финальном этапе Stage C)

## Structure

```
ops/
├── api/                 Node 20 + Express API
├── web/                 Vue 3 + Vite SPA
├── db/                  SQL migrations
└── infra/               docker-compose, Caddyfile, scripts
```

## Local development

Требования: Node 20, Docker.

```bash
# 1. Запусти Postgres локально
docker run -d --name ops-pg-dev \
  -e POSTGRES_USER=ops -e POSTGRES_PASSWORD=ops_dev_password -e POSTGRES_DB=ops \
  -p 127.0.0.1:5433:5432 postgres:16-alpine

# 2. Применить миграции
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" ops/db/migrate.sh

# 3. Запустить API
cd ops/api && npm install
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm start

# 4. В другом терминале — запустить web (с прокси на API)
cd ops/web && npm install && npm run dev

# 5. Открыть http://localhost:5173
```

## Тесты

```bash
cd ops/api
TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm test
```

## Deploy

Автоматически на push в `main` с изменениями в `ops/**` (см. `.github/workflows/ops-deploy.yml`).

После merge'а PR в main:
1. GitHub Actions запускает workflow
2. Тесты прогоняются
3. Web билдится
4. Rsync на VPS
5. `docker compose up -d --build`
6. Health check

## Прод-операции (VPS)

### SSH

```bash
ssh ops@<IPV4>
```

(SSH-ключ должен быть добавлен в `~/.ssh/authorized_keys` на VPS. Деплой использует отдельный ключ из GitHub Secrets.)

### Просмотр логов

```bash
ssh ops@<IPV4>
cd /srv/ops/infra
docker compose logs -f api          # логи API
docker compose logs -f caddy        # логи Caddy
docker compose logs -f postgres     # логи Postgres
```

### Ручной рестарт

```bash
docker compose --env-file .env restart api
```

### Бэкапы

- Запускается автоматически каждый день в 03:00 МСК через systemd timer.
- Хранятся в Selectel Object Storage, bucket `ro-ops-backups`.
- Локально на VPS — последние 7 дней в `/srv/ops/backups/`.

Запустить вручную:

```bash
systemctl start ops-backup.service
journalctl -u ops-backup.service -n 50
```

Посмотреть расписание:

```bash
systemctl list-timers ops-backup.timer
```

### Восстановление из бэкапа

⚠️ **Внимание:** перезаписывает текущую БД. Текущие данные переименовываются в `<db>_old` — это даёт окно для отката.

```bash
# Восстановить последний бэкап
ssh ops@<IPV4>
bash /srv/ops/infra/scripts/restore.sh

# Или конкретный файл из S3
bash /srv/ops/infra/scripts/restore.sh s3://ro-ops-backups/ops-20260515-0300.sql.gz
```

После проверки удалить `_old`:

```bash
docker exec ops-postgres dropdb -U ops ops_old
```

### Мониторинг

- Health check: https://ops-staging.recycleobject.ru/api/health
- UptimeRobot (внешний пинг каждые 5 минут): https://stats.uptimerobot.com/...

## Инфра-параметры

| Параметр | Значение |
|---|---|
| Провайдер | Selectel Cloud |
| Регион | ru-7 / ru-9 (Москва) |
| Конфигурация | 2 vCPU, 2 GB RAM, 30 GB NVMe |
| OS | Ubuntu 22.04 LTS |
| Домен | ops-staging.recycleobject.ru |
| TLS | Let's Encrypt автоматически через Caddy |
| Object Storage | `ro-ops-backups` bucket в Selectel |
| App version | через `APP_VERSION` env (default `dev`) |

## Что дальше

Block 1 (infrastructure) — выполнен. Следующие блоки строятся ПОВЕРХ этого фундамента:

- Block 2 — Auth + employees
- Block 3 — Склад
- Block 4 — Приёмки + Китай
- ... (см. spec)

Каждый блок добавляет таблицы, эндпойнты, экраны — но инфраструктурный путь
(deploy / backup / restore / monitoring) остаётся одним и тем же.
```

- [ ] **Step 4: Commit**

```bash
git add ops/README.md
git commit -m "Add ops README with deploy, backup, and recovery playbook"
```

- [ ] **Step 5: Push, открыть PR, merge**

```bash
git push origin block-1-infrastructure-part2
```

Создай PR на GitHub. CI должен пройти. Merge в main → автодеплой обновит README на VPS.

- [ ] **Step 6: Финальная sanity-проверка по чеклисту**

С твоей машины:

```bash
# 1. Health endpoint over TLS
curl -sS https://ops-staging.recycleobject.ru/api/health

# 2. SPA загружается
curl -sS https://ops-staging.recycleobject.ru/ | grep '<title>'

# 3. Бэкап лежит в S3 (через панель Selectel)
# (manual check — открыть bucket в браузере)

# 4. UptimeRobot показывает "Up"
# (manual check — открыть dashboard)

# 5. GitHub Actions последний run зелёный
# (manual check — открыть Actions вкладку)
```

Если все 5 пунктов зелёные — **Block 1 готов.**

---

## Summary

После выполнения этого плана:

- ✅ Selectel Cloud Server поднят, защищён UFW + fail2ban
- ✅ Docker compose стек (Postgres + Node API + Caddy) запущен
- ✅ HTTPS работает на `ops-staging.recycleobject.ru` (Let's Encrypt автоматически)
- ✅ `/api/health` отвечает 200 и сообщает статус БД
- ✅ Vue 3 SPA билдится и раздаётся через Caddy
- ✅ GitHub Actions деплоит на push в `main`
- ✅ Ежесуточный `pg_dump` → Selectel Object Storage с retention 7 дней локально, 30 дней в S3
- ✅ Restore drill прошёл успешно
- ✅ UptimeRobot пингует и алертит

Следующий блок (Block 2 — Auth + employees) строится поверх этого фундамента.

## Стоимость во время Block 1+ (Stage A)

| Компонент | Стоимость |
|---|---|
| Selectel Cloud Server (2 vCPU / 2 GB) | ~500 ₽/мес |
| Selectel Object Storage (бэкапы) | ~100 ₽/мес |
| Домен (доля от `recycleobject.ru`) | — |
| UptimeRobot Free | $0 |
| **Итого** | **~600 ₽/мес** |
