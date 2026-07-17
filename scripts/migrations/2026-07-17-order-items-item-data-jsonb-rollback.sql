-- Use only after an approved failed cutover. Restores exact pre-migration TEXT
-- values from the backup created by 2026-07-17-order-items-item-data-jsonb.sql.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.order_items IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  current_type text;
  live_rows bigint;
  backup_rows bigint;
  missing_rows bigint;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'order_items'
    AND column_name = 'item_data';

  IF current_type IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'Expected public.order_items.item_data to be JSONB, got %', current_type;
  END IF;
  IF to_regclass('public.order_items_item_data_pre_jsonb_20260717') IS NULL THEN
    RAISE EXCEPTION 'Required TEXT backup table is missing';
  END IF;

  SELECT count(*) INTO live_rows FROM public.order_items;
  SELECT count(*) INTO backup_rows FROM public.order_items_item_data_pre_jsonb_20260717;
  SELECT count(*) INTO missing_rows
  FROM public.order_items live
  FULL OUTER JOIN public.order_items_item_data_pre_jsonb_20260717 backup USING (id)
  WHERE live.id IS NULL OR backup.id IS NULL;

  IF live_rows <> backup_rows OR missing_rows <> 0 THEN
    RAISE EXCEPTION 'Refusing rollback: live %, backup %, unmatched %', live_rows, backup_rows, missing_rows;
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_order_items_item_data_gin;

ALTER TABLE public.order_items
  ALTER COLUMN item_data TYPE text
  USING item_data::text;

UPDATE public.order_items AS live
SET item_data = backup.item_data
FROM public.order_items_item_data_pre_jsonb_20260717 AS backup
WHERE live.id = backup.id;

DO $$
DECLARE
  mismatched_rows bigint;
BEGIN
  SELECT count(*) INTO mismatched_rows
  FROM public.order_items live
  JOIN public.order_items_item_data_pre_jsonb_20260717 backup USING (id)
  WHERE live.item_data IS DISTINCT FROM backup.item_data;

  IF mismatched_rows <> 0 THEN
    RAISE EXCEPTION 'Rollback verification failed: % TEXT rows differ from backup', mismatched_rows;
  END IF;
END;
$$;

COMMIT;
