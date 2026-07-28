# План: свежесть и мониторинг записей часов

- [x] Зафиксировать production-дефект контрольной записью с последующим cleanup.
- [ ] Переставить загрузку `time_entries`: живая Yandex DB перед bootstrap.
- [ ] Добавить регрессию live-first и fallback-поведения.
- [ ] Расширить `Yandex write-back smoke` transient-записью часов от Origin
  `calc.recycleobject.ru`.
- [ ] Обновить workflow-контракт и alert scope.
- [ ] Повысить версию до `v421` и cache-bust `js/supabase.js`.
- [ ] Прогнать локальные проверки.
- [ ] Выпустить PR и проверить production workflows.
