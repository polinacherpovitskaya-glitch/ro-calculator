import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

function id() {
  return Number(`11${Math.floor(Math.random() * 1000000000)}`);
}

async function createUser() {
  const employeeId = id();
  const email = `work-${crypto.randomUUID()}@x.test`;
  await getPool().query(`INSERT INTO employees (id, name, email, role) VALUES ($1, $2, $3, 'ops')`, [
    employeeId,
    'Work Tester',
    email,
  ]);
  const passwordHash = await hashPassword('testpass1234');
  const { rows } = await getPool().query(
    `INSERT INTO auth_users (email, password_hash, employee_id, role, must_change_password)
     VALUES ($1, $2, $3, 'admin', FALSE)
     RETURNING id, email, employee_id`,
    [email, passwordHash, employeeId]
  );
  return rows[0];
}

async function login(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}

async function setup(t) {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { port, cookie, user };
}

async function requestJson(port, method, path, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

async function createArea(port, cookie, overrides = {}) {
  const areaId = overrides.id || id();
  const res = await requestJson(port, 'POST', '/api/areas', {
    id: areaId,
    slug: `area-${areaId}`,
    name: `Area ${areaId}`,
    color: '#123456',
    ...overrides,
  }, cookie);
  assert.equal(res.status, 201);
  return (await res.json()).area;
}

async function createProject(port, cookie, areaId, overrides = {}) {
  const projectId = overrides.id || id();
  const res = await requestJson(port, 'POST', '/api/projects', {
    id: projectId,
    title: `Project ${projectId}`,
    area_id: areaId,
    status: 'active',
    ...overrides,
  }, cookie);
  assert.equal(res.status, 201);
  return (await res.json()).project;
}

async function createTask(port, cookie, areaId, projectId = null, overrides = {}) {
  const taskId = overrides.id || id();
  const res = await requestJson(port, 'POST', '/api/tasks', {
    id: taskId,
    title: `Task ${taskId}`,
    area_id: areaId,
    project_id: projectId,
    priority: 'normal',
    ...overrides,
  }, cookie);
  assert.equal(res.status, 201);
  return (await res.json()).task;
}

test('work management endpoints require auth', async (t) => {
  const port = await startServer(t);
  const areas = await fetch(`http://127.0.0.1:${port}/api/areas`);
  const projects = await fetch(`http://127.0.0.1:${port}/api/projects`);
  const tasks = await fetch(`http://127.0.0.1:${port}/api/tasks`);
  assert.equal(areas.status, 401);
  assert.equal(projects.status, 401);
  assert.equal(tasks.status, 401);
});

test('areas CRUD soft-deletes and filters active rows', async (t) => {
  const { port, cookie } = await setup(t);
  const area = await createArea(port, cookie);

  const list = await fetch(`http://127.0.0.1:${port}/api/areas?active=true&search=${encodeURIComponent(area.name)}`, { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).areas.some((entry) => Number(entry.id) === Number(area.id)));

  const patch = await requestJson(port, 'PATCH', `/api/areas/${area.id}`, { name: 'Updated area', is_active: true }, cookie);
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).area.name, 'Updated area');

  const del = await requestJson(port, 'DELETE', `/api/areas/${area.id}`, undefined, cookie);
  assert.equal(del.status, 200);
  assert.equal((await del.json()).area.is_active, false);
});

test('POST /api/areas without idempotency key returns 400', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(port, 'POST', '/api/areas', { id: id(), slug: `no-key-${id()}`, name: 'No key' }, cookie, '');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'NO_IDEMPOTENCY_KEY');
});

test('projects CRUD writes activity and supports detail payloads', async (t) => {
  const { port, cookie } = await setup(t);
  const area = await createArea(port, cookie);
  const project = await createProject(port, cookie, area.id, { brief: 'Initial brief' });

  const list = await fetch(`http://127.0.0.1:${port}/api/projects?status=active&search=Project`, { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).projects.some((entry) => Number(entry.id) === Number(project.id)));

  const patch = await requestJson(port, 'PATCH', `/api/projects/${project.id}`, { status: 'paused', goal: 'Ship it' }, cookie);
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).project.status, 'paused');

  const detail = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}`, { headers: { cookie } });
  const body = await detail.json();
  assert.equal(detail.status, 200);
  assert.equal(Number(body.project.id), Number(project.id));
  assert.ok(body.activity.some((entry) => entry.activity_type === 'project_created'));

  const del = await requestJson(port, 'DELETE', `/api/projects/${project.id}`, undefined, cookie);
  assert.equal(del.status, 200);
  assert.equal((await del.json()).project.status, 'archived');
});

test('projects validate status and JSON extras', async (t) => {
  const { port, cookie } = await setup(t);
  const area = await createArea(port, cookie);
  const badStatus = await requestJson(port, 'POST', '/api/projects', { id: id(), title: 'Bad', area_id: area.id, status: 'wat' }, cookie);
  assert.equal(badStatus.status, 400);
  const badExtras = await requestJson(port, 'POST', '/api/projects', { id: id(), title: 'Bad', area_id: area.id, extras: [] }, cookie);
  assert.equal(badExtras.status, 400);
});

test('tasks CRUD, assign, complete, detail, and activity work', async (t) => {
  const { port, cookie, user } = await setup(t);
  const area = await createArea(port, cookie);
  const project = await createProject(port, cookie, area.id);
  const task = await createTask(port, cookie, area.id, project.id, { description: 'Do the thing', assignee_id: user.employee_id });

  const list = await fetch(`http://127.0.0.1:${port}/api/tasks?project_id=${project.id}&search=Task`, { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).tasks.some((entry) => Number(entry.id) === Number(task.id)));

  const patch = await requestJson(port, 'PATCH', `/api/tasks/${task.id}`, { status: 'in_progress', priority: 'high' }, cookie);
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).task.status, 'in_progress');

  const assign = await requestJson(port, 'POST', `/api/tasks/${task.id}/assign`, { assignee_id: user.employee_id }, cookie);
  assert.equal(assign.status, 200);
  assert.equal(Number((await assign.json()).task.assignee_id), Number(user.employee_id));

  const done = await requestJson(port, 'POST', `/api/tasks/${task.id}/complete`, {}, cookie);
  assert.equal(done.status, 200);
  assert.equal((await done.json()).task.status, 'done');

  const detail = await fetch(`http://127.0.0.1:${port}/api/tasks/${task.id}`, { headers: { cookie } });
  const body = await detail.json();
  assert.equal(detail.status, 200);
  assert.equal(Number(body.task.id), Number(task.id));
  assert.ok(body.activity.some((entry) => entry.activity_type === 'task_created'));
});

test('tasks validate context, status, and priority', async (t) => {
  const { port, cookie } = await setup(t);
  const area = await createArea(port, cookie);
  const noContext = await requestJson(port, 'POST', '/api/tasks', { id: id(), title: 'No context' }, cookie);
  assert.equal(noContext.status, 400);
  const badStatus = await requestJson(port, 'POST', '/api/tasks', { id: id(), title: 'Bad', area_id: area.id, status: 'lost' }, cookie);
  assert.equal(badStatus.status, 400);
  const badPriority = await requestJson(port, 'POST', '/api/tasks', { id: id(), title: 'Bad', area_id: area.id, priority: 'maximum' }, cookie);
  assert.equal(badPriority.status, 400);
});

test('comments, checklist, watchers, assets, and activity endpoints work', async (t) => {
  const { port, cookie, user } = await setup(t);
  const area = await createArea(port, cookie);
  const task = await createTask(port, cookie, area.id);

  const comment = await requestJson(port, 'POST', `/api/work/tasks/${task.id}/comments`, { body: 'Looks good' }, cookie);
  assert.equal(comment.status, 201);
  const commentBody = await comment.json();
  assert.equal(commentBody.comment.body, 'Looks good');

  const editComment = await requestJson(port, 'PATCH', `/api/work/comments/${commentBody.comment.id}`, { body: 'Still good' }, cookie);
  assert.equal(editComment.status, 200);
  assert.equal((await editComment.json()).comment.body, 'Still good');

  const checklist = await requestJson(port, 'POST', `/api/work/tasks/${task.id}/checklist`, { title: 'Check me' }, cookie);
  assert.equal(checklist.status, 201);
  const checklistBody = await checklist.json();

  const checked = await requestJson(port, 'PATCH', `/api/work/checklist/${checklistBody.item.id}`, { is_done: true }, cookie);
  assert.equal(checked.status, 200);
  assert.equal((await checked.json()).item.is_done, true);

  const watcher = await requestJson(port, 'PUT', `/api/work/tasks/${task.id}/watchers/${user.employee_id}`, {}, cookie);
  assert.equal(watcher.status, 200);

  const asset = await requestJson(port, 'POST', '/api/work/assets', { task_id: task.id, kind: 'link', title: 'Brief', url: 'https://example.test' }, cookie);
  assert.equal(asset.status, 201);

  const activity = await fetch(`http://127.0.0.1:${port}/api/work/activity?task_id=${task.id}`, { headers: { cookie } });
  assert.equal(activity.status, 200);
  assert.ok((await activity.json()).activity.length >= 2);

  const detail = await fetch(`http://127.0.0.1:${port}/api/tasks/${task.id}`, { headers: { cookie } });
  const body = await detail.json();
  assert.equal(body.comments.length, 1);
  assert.equal(body.checklist.length, 1);
  assert.equal(body.watchers.length, 1);
  assert.equal(body.assets.length, 1);
});

test('work templates can be listed and created', async (t) => {
  const { port, cookie } = await setup(t);
  const list = await fetch(`http://127.0.0.1:${port}/api/work/templates?kind=task`, { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).templates.length >= 1);

  const template = await requestJson(port, 'POST', '/api/work/templates', {
    id: id(),
    kind: 'task',
    name: 'Custom task',
    default_priority: 'high',
    checklist_items: ['One'],
    suggested_subtasks: [],
  }, cookie);
  assert.equal(template.status, 201);
  assert.equal((await template.json()).template.name, 'Custom task');
});

test('notification events list returns an array', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/work/notification-events`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((await res.json()).events));
});
