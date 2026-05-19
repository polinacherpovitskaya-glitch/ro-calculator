// Copy legacy bug reports into normalized Postgres tables.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   DATABASE_URL

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

const { Pool } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

function textOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function fetchAll(table, columns = '*') {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) {
    const message = String(error.message || '');
    if (message.includes(`Could not find the table 'public.${table}'`)) {
      console.log(`${table}: missing in Supabase, skipping`);
      return [];
    }
    throw error;
  }
  return data || [];
}

function splitBugDescription(description) {
  const fields = {
    actual_result: '',
    expected_result: '',
    steps_to_reproduce: '',
    page_route: '',
    page_url: '',
    browser: '',
    os: '',
    viewport: '',
    severity: '',
  };
  const rest = [];
  for (const block of String(description || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)) {
    if (/^проблема:/i.test(block)) fields.actual_result = block.replace(/^проблема:\s*/i, '').trim();
    else if (/^ожидалось:/i.test(block)) fields.expected_result = block.replace(/^ожидалось:\s*/i, '').trim();
    else if (/^шаги:/i.test(block)) fields.steps_to_reproduce = block.replace(/^шаги:\s*/i, '').trim();
    else if (/^маршрут\s*\/\s*hash:/i.test(block)) fields.page_route = block.replace(/^маршрут\s*\/\s*hash:\s*/i, '').trim();
    else if (/^url:/i.test(block)) fields.page_url = block.replace(/^url:\s*/i, '').trim();
    else if (/^браузер:/i.test(block)) fields.browser = block.replace(/^браузер:\s*/i, '').trim();
    else if (/^ос:/i.test(block)) fields.os = block.replace(/^ос:\s*/i, '').trim();
    else if (/^viewport:/i.test(block)) fields.viewport = block.replace(/^viewport:\s*/i, '').trim();
    else if (/^серьезность:/i.test(block)) fields.severity = block.replace(/^серьезность:\s*/i, '').trim().toLowerCase();
    else rest.push(block);
  }
  return { ...fields, fallback_description: rest.join('\n\n') };
}

function parseBugTitle(title) {
  const raw = String(title || '').trim();
  const stripped = raw.replace(/^\[баг\]\s*/i, '').trim();
  const match = stripped.match(/^(.+?)\s+—\s+(.+)$/);
  return {
    title: textOrNull(match ? match[2] : stripped, raw) || 'Bug report',
    page: textOrNull(match ? match[1] : ''),
  };
}

function mapSeverity(value, priority) {
  const normalized = String(value || '').toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(normalized)) return normalized;
  const priorityValue = String(priority || '').toLowerCase();
  if (priorityValue === 'urgent') return 'critical';
  if (priorityValue === 'high') return 'high';
  if (priorityValue === 'low') return 'low';
  return 'medium';
}

function mapStatus(value) {
  const normalized = String(value || '').toLowerCase();
  if (['fixed', 'done', 'completed', 'closed'].includes(normalized)) return 'fixed';
  if (['in_progress', 'doing', 'review'].includes(normalized)) return 'in_progress';
  if (['wontfix', 'cancelled', 'canceled'].includes(normalized)) return 'wontfix';
  if (normalized === 'duplicate') return 'duplicate';
  return 'open';
}

function attachmentStorageKey(asset) {
  const preview = parseJson(asset.preview_meta);
  const storagePath = textOrNull(asset.storage_path, preview.storage_path);
  const bucket = textOrNull(asset.storage_bucket, preview.bucket);
  if (bucket === 'bug-attachments' && storagePath) return `supabase://${storagePath}`;

  const url = textOrNull(asset.url);
  if (url?.startsWith('data:')) return `data-url://work_assets/${asset.id}`;
  if (url?.startsWith('http')) {
    const marker = '/storage/v1/object/public/bug-attachments/';
    const index = url.indexOf(marker);
    if (index >= 0) return `supabase://${decodeURIComponent(url.slice(index + marker.length))}`;
    return url;
  }
  if (textOrNull(asset.data_url)) return `data-url://work_assets/${asset.id}`;
  return `legacy-work-asset://${asset.id}`;
}

async function loadLegacyBugReports() {
  const direct = await fetchAll('bug_reports');
  if (direct.length) {
    return direct.map((row) => ({
      id: numberOrNull(row.id),
      title: textOrNull(row.title) || `Bug report ${row.id}`,
      description: textOrNull(row.actual_result, row.description),
      severity: mapSeverity(row.severity),
      status: mapStatus(row.status || row.codex_status),
      page: textOrNull(row.page, row.page_route, row.section_name),
      reporter_name: textOrNull(row.submitted_by_name, row.reporter_name),
      assignee_id: numberOrNull(row.assignee_id),
      created_at: row.created_at,
      updated_at: row.updated_at,
      fixed_at: mapStatus(row.status || row.codex_status) === 'fixed' ? row.updated_at : null,
      legacy_task_id: numberOrNull(row.task_id),
      extras: { legacy_source: 'bug_reports', legacy: row },
    }));
  }

  const tasks = await fetchAll(
    'tasks',
    'id,title,status,priority,description,reporter_id,reporter_name,assignee_id,assignee_name,created_at,updated_at'
  );
  return tasks
    .filter((task) => /^\[баг\]/i.test(String(task.title || '')))
    .map((task) => {
      const parsedTitle = parseBugTitle(task.title);
      const parsedDescription = splitBugDescription(task.description);
      const status = mapStatus(task.status);
      return {
        id: numberOrNull(task.id),
        title: parsedTitle.title,
        description: textOrNull(parsedDescription.actual_result, parsedDescription.fallback_description, task.description),
        severity: mapSeverity(parsedDescription.severity, task.priority),
        status,
        page: textOrNull(parsedDescription.page_route, parsedTitle.page),
        reporter_name: textOrNull(task.reporter_name),
        assignee_id: numberOrNull(task.assignee_id),
        created_at: task.created_at,
        updated_at: task.updated_at,
        fixed_at: status === 'fixed' ? task.updated_at : null,
        legacy_task_id: numberOrNull(task.id),
        extras: { legacy_source: 'tasks', legacy: task, parsed_description: parsedDescription },
      };
    });
}

async function refreshBugs() {
  const bugs = (await loadLegacyBugReports()).filter((bug) => bug.id);
  console.log(`bug_reports: ${bugs.length}`);

  for (const bug of bugs) {
    await pool.query(
      `INSERT INTO bug_reports
         (id, title, description, severity, status, page, reporter_name, assignee_id, extras, created_at, updated_at, fixed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         severity = EXCLUDED.severity,
         status = EXCLUDED.status,
         page = EXCLUDED.page,
         reporter_name = EXCLUDED.reporter_name,
         assignee_id = EXCLUDED.assignee_id,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at,
         fixed_at = EXCLUDED.fixed_at`,
      [
        bug.id,
        bug.title,
        bug.description,
        bug.severity,
        bug.status,
        bug.page,
        bug.reporter_name,
        bug.assignee_id,
        bug.extras,
        bug.created_at || new Date().toISOString(),
        bug.updated_at || new Date().toISOString(),
        bug.fixed_at,
      ]
    );
  }

  const byTaskId = new Map(bugs.filter((bug) => bug.legacy_task_id).map((bug) => [String(bug.legacy_task_id), bug]));
  const assets = await fetchAll(
    'work_assets',
    'id,task_id,kind,title,url,file_name,file_type,file_size,data_url,preview_meta,storage_bucket,storage_path,created_at,updated_at'
  );
  let attachments = 0;
  for (const asset of assets) {
    if (asset.kind !== 'file') continue;
    const bug = byTaskId.get(String(asset.task_id || ''));
    if (!bug) continue;
    await pool.query(
      `INSERT INTO bug_attachments (id, bug_id, filename, mime_type, size_bytes, storage_key, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         bug_id = EXCLUDED.bug_id,
         filename = EXCLUDED.filename,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         storage_key = EXCLUDED.storage_key,
         uploaded_at = EXCLUDED.uploaded_at`,
      [
        numberOrNull(asset.id),
        bug.id,
        textOrNull(asset.file_name, asset.title) || `attachment-${asset.id}`,
        textOrNull(asset.file_type),
        numberOrNull(asset.file_size),
        attachmentStorageKey(asset),
        asset.created_at || new Date().toISOString(),
      ]
    );
    attachments += 1;
  }
  console.log(`bug_attachments: ${attachments}`);
}

refreshBugs()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
