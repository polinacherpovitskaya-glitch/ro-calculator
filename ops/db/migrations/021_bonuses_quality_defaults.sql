-- 021_bonuses_quality_defaults.sql
-- Срок и переделки снова входят в множитель качества (веса 0.5 / 0.3 / 0.2),
-- планки «цель = максимум»: норма даёт 1,0, срывы снижают. Обновляем схемы на
-- старом дефолте «только производительность» и цели периодов на старых
-- порогах по умолчанию.

ALTER TABLE bonus_schemes
  ALTER COLUMN quality_json SET DEFAULT '{"weights":{"productivity":0.5,"on_time_share":0.3,"rework_share":0.2}}'::jsonb;

UPDATE bonus_schemes
   SET quality_json = jsonb_set(quality_json, '{weights}', '{"productivity":0.5,"on_time_share":0.3,"rework_share":0.2}'::jsonb, true),
       updated_at = now()
 WHERE quality_json -> 'weights' = '{"productivity":1,"on_time_share":0,"rework_share":0}'::jsonb;

UPDATE bonus_period_targets
   SET min_value = 0.85, target_value = 1, max_value = 1, updated_at = now()
 WHERE metric_key = 'on_time_share' AND min_value = 0.7 AND target_value = 0.85 AND max_value = 0.95;

UPDATE bonus_period_targets
   SET min_value = 0.05, target_value = 0, max_value = 0, updated_at = now()
 WHERE metric_key = 'rework_share' AND min_value = 0.08 AND target_value = 0.05 AND max_value = 0.02;

INSERT INTO app_meta (id, version) VALUES (1, '021-bonuses-quality-defaults')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
