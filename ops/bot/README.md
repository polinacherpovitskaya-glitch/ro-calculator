# Ops Telegram bots

`taskbot.js` runs against the new Ops API with Bearer auth.

`timebot.js` writes directly to the independent PostgreSQL database on the
Yandex VM. In production it runs as a separate `ro-timebot` container on the
private platform network with a persistent state volume.

Required env:

```bash
TG_BOT_TOKEN=<token from BotFather>
OPS_API_URL=https://ops-staging.recycleobject.ru
OPS_BOT_TOKEN=<token from bot_tokens>
TASK_BOT_POLL_INTERVAL_MS=15000
TELEGRAM_PROXY_URL=
TELEGRAM_BASE_API_URL=
TELEGRAM_POLL_TIMEOUT_SECONDS=20
```

Create the API token in Postgres if you are running manually:

```sql
INSERT INTO bot_tokens (token, name, role)
VALUES ('<OPS_BOT_TOKEN>', 'taskbot', 'admin')
ON CONFLICT (token) DO NOTHING;
```

The staging deploy also runs `/srv/ops/infra/scripts/ensure-bot-token.sh` after migrations, so `OPS_BOT_TOKEN` from `/srv/ops/infra/.env` is inserted automatically once `bot_tokens` exists.

The task bot token currently needs `admin` role because `/api/bot/bindings` is admin-only.

The compose service is behind the `bot` profile so the regular staging deploy does not start a restart loop before `TG_BOT_TOKEN` is present:

```bash
cd /srv/ops/infra
docker compose --env-file .env --profile bot up -d --build bot
docker compose --env-file .env --profile bot logs -f bot
```

If the VPS cannot connect directly to `api.telegram.org:443`, set `TELEGRAM_PROXY_URL` to an HTTP(S) proxy URL and restart the bot profile.

## Time tracking bot

The VPS cannot reach Telegram directly. `TELEGRAM_BASE_API_URL` points to the
protected Vercel Function relay deployed with `calc.recycleobject.ru`.
CI writes `TIMEBOT_TOKEN` and the protected relay URL to
`/srv/ops/infra/.env.timebot` without storing either value in git.

The bot writes through the Yandex platform API, using the same source of truth
as the calculator:

```bash
OPS_API_URL=http://ro-platform-shadow-api:3000
OPS_BOT_TOKEN=<token from bot_tokens>
```

Manual start:

```bash
docker run -d \
  --name ro-timebot \
  --restart unless-stopped \
  --network ro-platform-shadow_shadow \
  --env-file /home/robot/timebot/runtime.env \
  -e TIMEBOT_STATE_DIR=/app/state \
  -v ro-timebot-state:/app/state \
  ro-timebot:latest node timebot.js
docker logs -f ro-timebot
```

Runtime files live in the named `timebot-state` volume under `/app/state`.
Removing or recreating the container does not delete unfinished reports or the
pending write queue. Do not run the local LaunchAgent and `ro-timebot` at the
same time: Telegram will reject the second poller with conflict 409.
