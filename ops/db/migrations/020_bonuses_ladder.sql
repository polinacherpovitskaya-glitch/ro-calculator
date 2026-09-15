-- 020_bonuses_ladder.sql
-- Шкала бонуса: ниже base четверть ставки (что-то платится всегда), выше
-- aspiration рост продолжается до потолка 2,0. Обновляем default и схемы,
-- которые ещё на старой шкале по умолчанию.

ALTER TABLE bonus_schemes
  ALTER COLUMN ladder_json SET DEFAULT '{"below_min":0.25,"min":0.5,"target":1,"max":1.5,"cap":2}'::jsonb;

UPDATE bonus_schemes
   SET ladder_json = '{"below_min":0.25,"min":0.5,"target":1,"max":1.5,"cap":2}'::jsonb,
       updated_at = now()
 WHERE ladder_json = '{"below_min":0,"min":0.5,"target":1,"max":1.5}'::jsonb;

INSERT INTO app_meta (id, version) VALUES (1, '020-bonuses-ladder')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
