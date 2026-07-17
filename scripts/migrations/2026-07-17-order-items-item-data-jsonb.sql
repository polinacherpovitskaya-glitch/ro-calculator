-- Preflight-validated migration only. Run on staging first, then once in the
-- approved production freeze window. Do not edit or delete the backup table.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.order_items IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  current_type text;
  unsafe_rows bigint;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'order_items'
    AND column_name = 'item_data';

  IF current_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'Expected public.order_items.item_data to be TEXT, got %', current_type;
  END IF;

  IF to_regclass('public.order_items_item_data_pre_jsonb_20260717') IS NOT NULL THEN
    RAISE EXCEPTION 'Backup table already exists; do not overwrite a previous migration backup';
  END IF;

  CREATE OR REPLACE FUNCTION pg_temp.try_parse_jsonb(value text)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  AS $fn$
  BEGIN
    RETURN value::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  $fn$;

  SELECT count(*) INTO unsafe_rows
  FROM public.order_items
  WHERE item_data IS NULL
     OR jsonb_typeof(pg_temp.try_parse_jsonb(item_data)) IS DISTINCT FROM 'object';

  IF unsafe_rows <> 0 THEN
    RAISE EXCEPTION 'Refusing migration: % item_data rows are empty, invalid, arrays/scalars or double-encoded', unsafe_rows;
  END IF;
END;
$$;

CREATE TABLE public.order_items_item_data_pre_jsonb_20260717 AS
SELECT id, item_data
FROM public.order_items
ORDER BY id;

ALTER TABLE public.order_items
  ALTER COLUMN item_data TYPE jsonb
  USING item_data::jsonb;

DO $$
DECLARE
  non_object_rows bigint;
  live_rows bigint;
  backup_rows bigint;
BEGIN
  SELECT count(*) INTO non_object_rows
  FROM public.order_items
  WHERE jsonb_typeof(item_data) IS DISTINCT FROM 'object';

  SELECT count(*) INTO live_rows FROM public.order_items;
  SELECT count(*) INTO backup_rows FROM public.order_items_item_data_pre_jsonb_20260717;

  IF non_object_rows <> 0 OR live_rows <> backup_rows THEN
    RAISE EXCEPTION 'Post-migration verification failed: non-object %, live %, backup %', non_object_rows, live_rows, backup_rows;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_order_items_item_data_gin
  ON public.order_items USING gin (item_data jsonb_path_ops);

COMMIT;
