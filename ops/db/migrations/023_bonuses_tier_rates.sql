-- 023_bonuses_tier_rates.sql
-- Ставка за нормо-час зависит от ступени квартала: ниже base 1/3, base 2/3,
-- medium 1, aspiration 1.2 от `rates_json.rate`. Ставка на medium = 225 ₽,
-- чтобы при выполнении medium весь год выходило около 100 тыс. ₽ в месяц
-- (5 400 ч × 225 = 1 215 000 ₽). Внутренние работы и часы без заказа — 50 ₽.

UPDATE bonus_schemes
   SET rates_json = jsonb_set(jsonb_set(rates_json, '{rate}', '225'::jsonb, true), '{half}', '50'::jsonb, true),
       updated_at = now()
 WHERE kind = 'production' AND is_active;

INSERT INTO app_meta (id, version) VALUES (1, '023-bonuses-tier-rates')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
