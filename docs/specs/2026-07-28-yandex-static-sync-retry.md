# Надёжная синхронизация Yandex static mirrors

## Проблема

Во время production release `v423` две matrix-сборки одновременно запросили
полный bootstrap через replacement API. Один запрос `order_items` временно
вернул ошибку, был безопасно преобразован в пустой набор, и bootstrap guard
правильно запретил публикацию `calc2`.

## Решение

- Собирать и загружать `calc` и `calc2` последовательно (`max-parallel: 1`),
  чтобы не удваивать тяжёлые bootstrap-запросы и Object Storage upload.
- Повторять полную сборку до трёх раз с паузой при временной API-ошибке.
- Не ослаблять `assertHealthyBootstrap`: любая последняя попытка с пустой
  обязательной таблицей по-прежнему завершает workflow ошибкой до upload.

## Безопасность

- Последний рабочий snapshot остаётся в bucket до полной успешной сборки.
- Retry не выполняет production writes.
- Из bucket, базы и rollback-копий ничего не удаляется.

## Приёмка

- Workflow contract фиксирует последовательную matrix и retry.
- `bootstrap-guard-smoke` продолжает отклонять пустую обязательную таблицу.
- Оба bucket jobs публикуют одну версию и проходят проверку URL.
- После публикации зелёные mirror, live и write-back smokes.

