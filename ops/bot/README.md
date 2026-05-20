# Ops Telegram bot

`taskbot.js` runs against the new Ops API with Bearer auth. It does not use Supabase.

Required env:

```bash
TG_BOT_TOKEN=<token from BotFather>
OPS_API_URL=https://ops-staging.recycleobject.ru
OPS_BOT_TOKEN=<token from bot_tokens>
TASK_BOT_POLL_INTERVAL_MS=15000
```

Create the API token in Postgres:

```sql
INSERT INTO bot_tokens (token, name, role)
VALUES ('<OPS_BOT_TOKEN>', 'taskbot', 'admin')
ON CONFLICT (token) DO NOTHING;
```

The token currently needs `admin` role because `/api/bot/bindings` is admin-only. Time-entry recording remains dependent on the later `time_entries` migration block, so `timebot.js` is not the Docker entrypoint yet.
