-- Columns required by the production hours bot after it leaves Supabase.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS daily_hours NUMERIC DEFAULT 8;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_username TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reminder_hour INTEGER DEFAULT 17;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reminder_minute INTEGER DEFAULT 30;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS timezone_offset INTEGER DEFAULT 3;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tasks_required BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_employees_telegram_id
  ON employees (telegram_id)
  WHERE telegram_id IS NOT NULL;

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_description TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE time_entries
SET task_description = COALESCE(task_description, note),
    notes = COALESCE(notes, note)
WHERE task_description IS NULL OR notes IS NULL;

INSERT INTO app_meta (id, version) VALUES (1, '016-timebot-compatibility')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
