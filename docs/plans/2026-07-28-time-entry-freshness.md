# План: свежесть и мониторинг записей часов

- [x] Зафиксировать production-дефект контрольной записью с последующим cleanup.
- [x] Переставить загрузку `time_entries`: живая Yandex DB перед bootstrap.
- [x] Добавить регрессию live-first и fallback-поведения.
- [x] Расширить `Yandex write-back smoke` transient-записью часов от Origin
  `calc.recycleobject.ru`.
- [x] Обновить workflow-контракт и alert scope.
- [x] Повысить версию до `v421` и cache-bust `js/supabase.js`.
- [x] Прогнать локальные проверки.
- [ ] Выпустить PR и проверить production workflows.
