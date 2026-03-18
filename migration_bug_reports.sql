CREATE TABLE IF NOT EXISTS bug_reports (
    id BIGINT PRIMARY KEY,
    task_id BIGINT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    section_key TEXT DEFAULT '',
    section_name TEXT DEFAULT '',
    subsection_key TEXT DEFAULT '',
    subsection_name TEXT DEFAULT '',
    page_route TEXT DEFAULT '',
    page_url TEXT DEFAULT '',
    app_version TEXT DEFAULT '',
    browser TEXT DEFAULT '',
    os TEXT DEFAULT '',
    viewport TEXT DEFAULT '',
    steps_to_reproduce TEXT DEFAULT '',
    expected_result TEXT DEFAULT '',
    actual_result TEXT DEFAULT '',
    severity TEXT DEFAULT 'medium',
    codex_prompt TEXT DEFAULT '',
    codex_status TEXT DEFAULT 'pending',
    codex_result TEXT DEFAULT '',
    codex_error TEXT DEFAULT '',
    submitted_by BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    submitted_by_name TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_task_id ON bug_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON bug_reports(severity);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY "anon_all_bug_reports" ON bug_reports FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-attachments', 'bug-attachments', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
CREATE POLICY "anon_read_bug_attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'bug-attachments');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_insert_bug_attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bug-attachments');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_update_bug_attachments"
ON storage.objects FOR UPDATE
USING (bucket_id = 'bug-attachments')
WITH CHECK (bucket_id = 'bug-attachments');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_delete_bug_attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'bug-attachments');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
