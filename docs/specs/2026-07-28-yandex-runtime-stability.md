# Стабильность Yandex API и timebot monitor

## Проблема

После cutover replacement API несколько раз автоматически перезапустился во
время тяжёлых static snapshot reads. Диагностика показала:

- PostgreSQL, timebot и старый Supabase не перезапускались;
- OOM не было;
- API завершался после PostgreSQL connection timeout;
- `pg.Pool` использовал `connectionTimeoutMillis: 1000` и не имел listener для
  фоновой pool error;
- одиночный Telegram self-probe timeout дважды создавал краткий incident, хотя
  повторный независимый relay probe был зелёным.

## Решение

1. Увеличить PostgreSQL connect timeout API до 5 секунд.
2. Обрабатывать фоновые `pg.Pool` errors без завершения Node-процесса.
3. Не разрешать pool освобождать event loop активного HTTP-сервера.
4. Добавить отдельный безопасный Yandex API deploy:
   - тесты и migrations на disposable PostgreSQL;
   - pre-deploy custom-format backup production DB;
   - upload только API/schema/deploy files;
   - restart replacement API без refresh production rows;
   - проверка API, DB, Supabase rollback и bot;
   - сохранение всех предыдущих verified dumps без автоматической очистки.
5. Если свежий timebot snapshot не прошёл только Telegram probe, отложить
   решение до независимого relay `getMe`; database/poller/staleness ошибки
   остаются немедленно блокирующими.

## Ограничения безопасности

- Не запускать migration rehearsal или source-to-target refresh.
- Не останавливать и не удалять Supabase, volumes, Storage или rollback image.
- Не удалять старые production dumps по возрасту.
- До API deploy создавать и проверять отдельный production dump.
- Не логировать connection strings, токены или Telegram secrets.

## Приёмка

- API tests и pool safety test зелёные.
- API-only deploy создаёт pre-deploy dump и проходит HTTPS health.
- API container после deploy имеет `restart_count=0`.
- Timebot, независимый Telegram relay и Yandex DB зелёные.
- Live, mirror и write-back smokes зелёные.
