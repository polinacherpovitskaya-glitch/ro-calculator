-- 022_bonuses_productivity_only.sql
-- Владелец решила: срок и переделки в сумму не входят, их последствия вносятся
-- корректировкой. В деньгах остаётся только производительность.

ALTER TABLE bonus_schemes
  ALTER COLUMN quality_json SET DEFAULT '{"weights":{"productivity":1,"on_time_share":0,"rework_share":0}}'::jsonb;

UPDATE bonus_schemes
   SET quality_json = jsonb_set(quality_json, '{weights}', '{"productivity":1,"on_time_share":0,"rework_share":0}'::jsonb, true),
       updated_at = now()
 WHERE quality_json -> 'weights' = '{"productivity":0.5,"on_time_share":0.3,"rework_share":0.2}'::jsonb;

INSERT INTO app_meta (id, version) VALUES (1, '022-bonuses-productivity-only')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
