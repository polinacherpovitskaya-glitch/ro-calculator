// Copy legacy Supabase work-management tables into Postgres.
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
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

const TASK_STATUSES = new Set(['incoming', 'todo', 'in_progress', 'waiting', 'review', 'done', 'cancelled']);
const TASK_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const PROJECT_STATUSES = new Set(['active', 'paused', 'done', 'cancelled', 'archived']);

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    const message = String(error.message || '');
    if (message.includes(`Could not find the table 'public.${table}'`)) return [];
    throw error;
  }
  return data || [];
}

function text(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function integerOrNull(...values) {
  const number = numberOrNull(...values);
  return number === null ? null : Math.trunc(number);
}

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value !== 'false';
  return Boolean(value);
}

function dateOrNull(...values) {
  for (const value of values) {
    const normalized = String(value || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }
  return null;
}

function timeOrNull(...values) {
  for (const value of values) {
    const normalized = String(value || '').slice(11, 19) || String(value || '');
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(normalized)) return normalized;
  }
  return null;
}

function jsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function jsonArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function idSet(table) {
  const { rows } = await pool.query(`SELECT id::text FROM ${table}`);
  return new Set(rows.map((row) => row.id));
}

async function employeeName(id) {
  if (!id) return '';
  const { rows } = await pool.query(`SELECT name FROM employees WHERE id = $1`, [id]);
  return rows[0]?.name || '';
}

async function refreshAreas() {
  const rows = await fetchAll('areas');
  console.log(`areas: ${rows.length || 7}`);
  for (const row of rows) {
    await pool.query(
      `INSERT INTO areas (id, slug, name, color, is_active, extras, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         name = EXCLUDED.name,
         color = EXCLUDED.color,
         is_active = EXCLUDED.is_active,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        text(row.slug, `area-${row.id}`),
        text(row.name, row.title, `Area ${row.id}`),
        text(row.color) || '#6b7280',
        boolValue(row.is_active, true),
        jsonObject(row.extras, { legacy: row }),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshProjects() {
  const rows = await fetchAll('projects');
  const employees = await idSet('employees');
  const areas = await idSet('areas');
  const orders = await idSet('orders');
  console.log(`projects: ${rows.length}`);
  for (const row of rows) {
    const ownerId = integerOrNull(row.owner_id);
    const createdBy = integerOrNull(row.created_by);
    const linkedOrderId = integerOrNull(row.linked_order_id, row.order_id);
    const areaId = integerOrNull(row.area_id);
    const status = PROJECT_STATUSES.has(row.status) ? row.status : 'active';
    await pool.query(
      `INSERT INTO projects
         (id, title, type, owner_id, owner_name, linked_order_id, linked_order_name, area_id, start_date, due_date,
          launch_at, status, brief, goal, result_summary, created_by, created_by_name, extras, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         type = EXCLUDED.type,
         owner_id = EXCLUDED.owner_id,
         owner_name = EXCLUDED.owner_name,
         linked_order_id = EXCLUDED.linked_order_id,
         linked_order_name = EXCLUDED.linked_order_name,
         area_id = EXCLUDED.area_id,
         start_date = EXCLUDED.start_date,
         due_date = EXCLUDED.due_date,
         launch_at = EXCLUDED.launch_at,
         status = EXCLUDED.status,
         brief = EXCLUDED.brief,
         goal = EXCLUDED.goal,
         result_summary = EXCLUDED.result_summary,
         created_by = EXCLUDED.created_by,
         created_by_name = EXCLUDED.created_by_name,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        text(row.title, row.name, `Project ${row.id}`),
        text(row.type) || 'Другое',
        ownerId && employees.has(String(ownerId)) ? ownerId : null,
        text(row.owner_name) || (employees.has(String(ownerId)) ? await employeeName(ownerId) : ''),
        linkedOrderId && orders.has(String(linkedOrderId)) ? linkedOrderId : null,
        text(row.linked_order_name, row.order_name),
        areaId && areas.has(String(areaId)) ? areaId : null,
        dateOrNull(row.start_date),
        dateOrNull(row.due_date, row.end_date),
        row.launch_at || null,
        status,
        text(row.brief),
        text(row.goal),
        text(row.result_summary),
        createdBy && employees.has(String(createdBy)) ? createdBy : null,
        text(row.created_by_name) || (employees.has(String(createdBy)) ? await employeeName(createdBy) : ''),
        jsonObject(row.extras, { legacy: row }),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshTasks() {
  const rows = await fetchAll('tasks');
  const employees = await idSet('employees');
  const areas = await idSet('areas');
  const orders = await idSet('orders');
  const projects = await idSet('projects');
  const china = await idSet('china_purchases');
  const warehouse = await idSet('warehouse_items');
  console.log(`tasks: ${rows.length}`);
  for (const row of rows) {
    const areaId = integerOrNull(row.area_id);
    const orderId = integerOrNull(row.order_id);
    const projectId = integerOrNull(row.project_id);
    const validArea = areaId && areas.has(String(areaId)) ? areaId : null;
    const validOrder = orderId && orders.has(String(orderId)) ? orderId : null;
    const validProject = projectId && projects.has(String(projectId)) ? projectId : null;
    if (!validArea && !validOrder && !validProject) continue;
    const reporterId = integerOrNull(row.reporter_id);
    const assigneeId = integerOrNull(row.assignee_id);
    const reviewerId = integerOrNull(row.reviewer_id);
    const status = TASK_STATUSES.has(row.status) ? row.status : 'incoming';
    const priority = TASK_PRIORITIES.has(row.priority) ? row.priority : 'normal';
    await pool.query(
      `INSERT INTO tasks
         (id, title, description, status, priority, reporter_id, reporter_name, assignee_id, assignee_name, reviewer_id,
          reviewer_name, area_id, order_id, order_name, project_id, project_title, china_purchase_id, warehouse_item_id,
          primary_context_kind, due_date, due_time, waiting_for_text, sort_index, parent_task_id, completed_at, cancelled_at,
          extras, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         priority = EXCLUDED.priority,
         reporter_id = EXCLUDED.reporter_id,
         reporter_name = EXCLUDED.reporter_name,
         assignee_id = EXCLUDED.assignee_id,
         assignee_name = EXCLUDED.assignee_name,
         reviewer_id = EXCLUDED.reviewer_id,
         reviewer_name = EXCLUDED.reviewer_name,
         area_id = EXCLUDED.area_id,
         order_id = EXCLUDED.order_id,
         order_name = EXCLUDED.order_name,
         project_id = EXCLUDED.project_id,
         project_title = EXCLUDED.project_title,
         china_purchase_id = EXCLUDED.china_purchase_id,
         warehouse_item_id = EXCLUDED.warehouse_item_id,
         primary_context_kind = EXCLUDED.primary_context_kind,
         due_date = EXCLUDED.due_date,
         due_time = EXCLUDED.due_time,
         waiting_for_text = EXCLUDED.waiting_for_text,
         sort_index = EXCLUDED.sort_index,
         parent_task_id = EXCLUDED.parent_task_id,
         completed_at = EXCLUDED.completed_at,
         cancelled_at = EXCLUDED.cancelled_at,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        text(row.title, row.name, `Task ${row.id}`),
        text(row.description),
        status,
        priority,
        reporterId && employees.has(String(reporterId)) ? reporterId : null,
        text(row.reporter_name) || (employees.has(String(reporterId)) ? await employeeName(reporterId) : ''),
        assigneeId && employees.has(String(assigneeId)) ? assigneeId : null,
        text(row.assignee_name) || (employees.has(String(assigneeId)) ? await employeeName(assigneeId) : ''),
        reviewerId && employees.has(String(reviewerId)) ? reviewerId : null,
        text(row.reviewer_name) || (employees.has(String(reviewerId)) ? await employeeName(reviewerId) : ''),
        validArea,
        validOrder,
        text(row.order_name),
        validProject,
        text(row.project_title),
        integerOrNull(row.china_purchase_id) && china.has(String(row.china_purchase_id)) ? integerOrNull(row.china_purchase_id) : null,
        integerOrNull(row.warehouse_item_id) && warehouse.has(String(row.warehouse_item_id)) ? integerOrNull(row.warehouse_item_id) : null,
        text(row.primary_context_kind) || (validProject ? 'project' : validOrder ? 'order' : 'area'),
        dateOrNull(row.due_date),
        timeOrNull(row.due_time),
        text(row.waiting_for_text),
        numberOrNull(row.sort_index) || 0,
        integerOrNull(row.parent_task_id),
        row.completed_at || null,
        row.cancelled_at || null,
        jsonObject(row.extras, { legacy: row }),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshTaskComments() {
  const rows = await fetchAll('task_comments');
  const tasks = await idSet('tasks');
  const employees = await idSet('employees');
  console.log(`task_comments: ${rows.filter((row) => tasks.has(String(row.task_id))).length}`);
  for (const row of rows) {
    if (!tasks.has(String(row.task_id))) continue;
    const authorId = integerOrNull(row.author_id);
    await pool.query(
      `INSERT INTO task_comments (id, task_id, author_id, author_name, body, mentions, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         task_id = EXCLUDED.task_id,
         author_id = EXCLUDED.author_id,
         author_name = EXCLUDED.author_name,
         body = EXCLUDED.body,
         mentions = EXCLUDED.mentions,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        row.task_id,
        authorId && employees.has(String(authorId)) ? authorId : null,
        text(row.author_name) || (employees.has(String(authorId)) ? await employeeName(authorId) : ''),
        text(row.body, row.message),
        JSON.stringify(jsonArray(row.mentions)),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshWorkAssets() {
  const rows = await fetchAll('work_assets');
  const tasks = await idSet('tasks');
  const projects = await idSet('projects');
  const employees = await idSet('employees');
  console.log(`work_assets: ${rows.filter((row) => tasks.has(String(row.task_id)) || projects.has(String(row.project_id))).length}`);
  for (const row of rows) {
    const taskId = integerOrNull(row.task_id);
    const projectId = integerOrNull(row.project_id);
    const validTask = taskId && tasks.has(String(taskId)) ? taskId : null;
    const validProject = projectId && projects.has(String(projectId)) ? projectId : null;
    if (!validTask && !validProject) continue;
    const createdBy = integerOrNull(row.created_by);
    await pool.query(
      `INSERT INTO work_assets
         (id, task_id, project_id, kind, title, url, file_name, file_type, file_size, data_url, preview_meta, created_by, created_by_name, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         task_id = EXCLUDED.task_id,
         project_id = EXCLUDED.project_id,
         kind = EXCLUDED.kind,
         title = EXCLUDED.title,
         url = EXCLUDED.url,
         file_name = EXCLUDED.file_name,
         file_type = EXCLUDED.file_type,
         file_size = EXCLUDED.file_size,
         data_url = EXCLUDED.data_url,
         preview_meta = EXCLUDED.preview_meta,
         created_by = EXCLUDED.created_by,
         created_by_name = EXCLUDED.created_by_name,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        validTask,
        validProject,
        text(row.kind) || 'link',
        text(row.title, row.name),
        text(row.url),
        text(row.file_name, row.name),
        text(row.file_type, row.mime_type),
        integerOrNull(row.file_size, row.size_bytes) || 0,
        text(row.data_url),
        jsonObject(row.preview_meta),
        createdBy && employees.has(String(createdBy)) ? createdBy : null,
        text(row.created_by_name) || (employees.has(String(createdBy)) ? await employeeName(createdBy) : ''),
        row.created_at || row.uploaded_at || new Date().toISOString(),
        row.updated_at || row.created_at || row.uploaded_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshChecklist() {
  const rows = await fetchAll('task_checklist_items');
  const tasks = await idSet('tasks');
  const employees = await idSet('employees');
  console.log(`task_checklist_items: ${rows.filter((row) => tasks.has(String(row.task_id))).length}`);
  for (const row of rows) {
    if (!tasks.has(String(row.task_id))) continue;
    const assigneeId = integerOrNull(row.assignee_id);
    await pool.query(
      `INSERT INTO task_checklist_items (id, task_id, title, is_done, sort_index, assignee_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         task_id = EXCLUDED.task_id,
         title = EXCLUDED.title,
         is_done = EXCLUDED.is_done,
         sort_index = EXCLUDED.sort_index,
         assignee_id = EXCLUDED.assignee_id,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        row.task_id,
        text(row.title, row.text),
        boolValue(row.is_done, row.done || false),
        numberOrNull(row.sort_index, row.position) || 0,
        assigneeId && employees.has(String(assigneeId)) ? assigneeId : null,
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshWatchers() {
  const rows = await fetchAll('task_watchers');
  const tasks = await idSet('tasks');
  const employees = await idSet('employees');
  console.log(`task_watchers: ${rows.filter((row) => tasks.has(String(row.task_id)) && employees.has(String(row.user_id || row.employee_id))).length}`);
  for (const row of rows) {
    const userId = integerOrNull(row.user_id, row.employee_id);
    if (!tasks.has(String(row.task_id)) || !employees.has(String(userId))) continue;
    await pool.query(
      `INSERT INTO task_watchers (task_id, user_id, created_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (task_id, user_id) DO UPDATE SET created_at = EXCLUDED.created_at`,
      [row.task_id, userId, row.created_at || new Date().toISOString()]
    );
  }
}

async function refreshActivity() {
  const rows = await fetchAll('work_activity');
  const tasks = await idSet('tasks');
  const projects = await idSet('projects');
  const orders = await idSet('orders');
  const employees = await idSet('employees');
  console.log(`work_activity: ${rows.length}`);
  for (const row of rows) {
    const taskId = integerOrNull(row.task_id);
    const projectId = integerOrNull(row.project_id);
    const orderId = integerOrNull(row.order_id);
    const authorId = integerOrNull(row.author_id);
    await pool.query(
      `INSERT INTO work_activity (id, task_id, project_id, order_id, author_id, author_name, activity_type, message, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         task_id = EXCLUDED.task_id,
         project_id = EXCLUDED.project_id,
         order_id = EXCLUDED.order_id,
         author_id = EXCLUDED.author_id,
         author_name = EXCLUDED.author_name,
         activity_type = EXCLUDED.activity_type,
         message = EXCLUDED.message,
         metadata = EXCLUDED.metadata,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        taskId && tasks.has(String(taskId)) ? taskId : null,
        projectId && projects.has(String(projectId)) ? projectId : null,
        orderId && orders.has(String(orderId)) ? orderId : null,
        authorId && employees.has(String(authorId)) ? authorId : null,
        text(row.author_name) || (employees.has(String(authorId)) ? await employeeName(authorId) : ''),
        text(row.activity_type, row.action, 'note'),
        text(row.message, row.body),
        jsonObject(row.metadata, row.payload || {}),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshTemplates() {
  const rows = await fetchAll('work_templates');
  const areas = await idSet('areas');
  console.log(`work_templates: ${rows.length || 7}`);
  for (const row of rows) {
    const areaId = integerOrNull(row.suggested_area_id);
    await pool.query(
      `INSERT INTO work_templates
         (id, kind, name, title, project_type, description, default_priority, suggested_area_id, checklist_items, suggested_subtasks, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         kind = EXCLUDED.kind,
         name = EXCLUDED.name,
         title = EXCLUDED.title,
         project_type = EXCLUDED.project_type,
         description = EXCLUDED.description,
         default_priority = EXCLUDED.default_priority,
         suggested_area_id = EXCLUDED.suggested_area_id,
         checklist_items = EXCLUDED.checklist_items,
         suggested_subtasks = EXCLUDED.suggested_subtasks,
         is_active = EXCLUDED.is_active,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        text(row.kind, 'task'),
        text(row.name, `Template ${row.id}`),
        text(row.title),
        text(row.project_type),
        text(row.description),
        TASK_PRIORITIES.has(row.default_priority) ? row.default_priority : 'normal',
        areaId && areas.has(String(areaId)) ? areaId : null,
        JSON.stringify(jsonArray(row.checklist_items)),
        JSON.stringify(jsonArray(row.suggested_subtasks)),
        boolValue(row.is_active, true),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshNotificationEvents() {
  const rows = await fetchAll('task_notification_events');
  const tasks = await idSet('tasks');
  const projects = await idSet('projects');
  console.log(`task_notification_events: ${rows.length}`);
  for (const row of rows) {
    const taskId = integerOrNull(row.task_id);
    const projectId = integerOrNull(row.project_id);
    await pool.query(
      `INSERT INTO task_notification_events (id, task_id, project_id, event_type, payload, created_at, processed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         task_id = EXCLUDED.task_id,
         project_id = EXCLUDED.project_id,
         event_type = EXCLUDED.event_type,
         payload = EXCLUDED.payload,
         processed_at = EXCLUDED.processed_at`,
      [
        row.id,
        taskId && tasks.has(String(taskId)) ? taskId : null,
        projectId && projects.has(String(projectId)) ? projectId : null,
        text(row.event_type, 'event'),
        jsonObject(row.payload),
        row.created_at || new Date().toISOString(),
        row.processed_at || row.dispatched_at || null,
      ]
    );
  }
}

async function main() {
  await refreshAreas();
  await refreshProjects();
  await refreshTasks();
  await refreshTaskComments();
  await refreshWorkAssets();
  await refreshChecklist();
  await refreshWatchers();
  await refreshActivity();
  await refreshTemplates();
  await refreshNotificationEvents();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
