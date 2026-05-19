# RO Ops Stack

Operational core of `recycleobject.ru`: migration target for the old Vercel + Supabase stack.

## Status

- Stage A — Build, Block 1 complete pending PR merge
- Staging domain: `https://ops-staging.recycleobject.ru`
- Production cutover: not here; Stage C is owner-run only
- UptimeRobot: deferred/manual follow-up, not blocking Block 1

## Structure

```text
ops/
├── api/                 Node 20 + Express API
├── web/                 Vue 3 + Vite SPA
├── db/                  SQL migrations
└── infra/               docker-compose, Caddyfile, scripts
```

## Local Development

Requirements: Node 20 and Docker/Postgres.

```bash
docker run -d --name ops-pg-dev \
  -e POSTGRES_USER=ops \
  -e POSTGRES_PASSWORD=ops_dev_password \
  -e POSTGRES_DB=ops \
  -p 127.0.0.1:5433:5432 \
  postgres:16-alpine

DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" ops/db/migrate.sh

cd ops/api
npm install
DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm start

cd ../web
npm install
npm run dev
```

Open `http://localhost:5173`.

## Tests

```bash
cd ops/api
TEST_DATABASE_URL="postgres://ops:ops_dev_password@127.0.0.1:5433/ops" npm test

cd ../web
npm run build
```

## Deploy

Deploy is automatic on push to `main` when `ops/**` or `.github/workflows/ops-deploy.yml` changes.

1. GitHub Actions installs dependencies.
2. It applies migrations to a CI Postgres service.
3. It runs API tests and builds the web app.
4. On `main` only, it rsyncs `ops/` to `/srv/ops/`.
5. It runs `docker compose --env-file .env up -d --build`.
6. It applies migrations to staging and checks `/api/health`.

Required GitHub Actions secrets:

```text
OPS_SSH_PRIVATE_KEY
OPS_HOST
OPS_USER
```

## VPS Operations

SSH:

```bash
ssh ops@ops-staging.recycleobject.ru
```

Logs:

```bash
cd /srv/ops/infra
docker compose logs -f api
docker compose logs -f caddy
docker compose logs -f postgres
```

Restart:

```bash
cd /srv/ops/infra
docker compose --env-file .env restart api
```

Health:

```bash
curl -sS https://ops-staging.recycleobject.ru/api/health
```

Expected:

```json
{"status":"ok","version":"dev","uptime_seconds":1,"db":{"ok":true,"latency_ms":1}}
```

## Backups

Backups run daily at 03:00 MSK through `ops-backup.timer`.

- S3 bucket: `ro-ops-backups`
- Region endpoint: `https://s3.ru-3.storage.selcloud.ru`
- Local backups: `/srv/ops/backups/`
- Local retention: 7 days
- S3 retention: managed in Selectel bucket policy/lifecycle

Manual backup:

```bash
ssh ops@ops-staging.recycleobject.ru
systemctl start ops-backup.service
journalctl -u ops-backup.service -n 50
```

Timer:

```bash
systemctl list-timers ops-backup.timer
```

## Restore

Warning: restore replaces the current `ops` database. The script first renames the existing DB to `ops_old`.

Recommended drill flow while staging has no production data:

```bash
ssh ops@ops-staging.recycleobject.ru
cd /srv/ops/infra
docker compose --env-file .env stop api caddy
printf "yes\n" | bash /srv/ops/infra/scripts/restore.sh
docker exec ops-postgres psql -U ops -d ops -c "SELECT id, version FROM app_meta;"
docker exec ops-postgres dropdb -U ops ops_old
docker compose --env-file .env up -d
curl -sS https://ops-staging.recycleobject.ru/api/health
```

For a specific backup:

```bash
bash /srv/ops/infra/scripts/restore.sh s3://ro-ops-backups/ops-YYYYMMDD-HHMM.sql.gz
```

## Monitoring

External monitoring is intended to use UptimeRobot:

- Monitor type: HTTP(s)
- URL: `https://ops-staging.recycleobject.ru/api/health`
- Interval: 5 minutes
- Alert contacts: email, optional Telegram

This manual UptimeRobot setup is deferred and is not blocking Block 1 completion. The health endpoint and TLS are already live.

## Current Infra

| Parameter | Value |
|---|---|
| Provider | Selectel Cloud |
| Region | Moscow VPS; S3 bucket in ru-3 |
| OS | Ubuntu 22.04 LTS |
| Domain | `ops-staging.recycleobject.ru` |
| TLS | Let's Encrypt via Caddy |
| Database | PostgreSQL 16 in Docker |
| API | Node 20 + Express |
| Web | Vue 3 + Vite |

## Next

Block 2 adds authentication and employees on top of this foundation.
