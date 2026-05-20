import { apiFetch } from './index';

export type TaskStatus = 'incoming' | 'todo' | 'in_progress' | 'waiting' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'paused' | 'done' | 'cancelled' | 'archived';

export interface Area {
  id: number;
  slug: string;
  name: string;
  color: string | null;
  is_active: boolean;
  extras: Record<string, unknown>;
}

export interface Project {
  id: number;
  title: string;
  type: string | null;
  owner_id: number | null;
  owner_name: string | null;
  linked_order_id: number | null;
  linked_order_name: string | null;
  area_id: number | null;
  area_name?: string | null;
  area_color?: string | null;
  start_date: string | null;
  due_date: string | null;
  status: ProjectStatus;
  brief: string | null;
  goal: string | null;
  result_summary: string | null;
  extras: Record<string, unknown>;
  updated_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  reporter_id: number | null;
  reporter_name: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  reviewer_id: number | null;
  reviewer_name: string | null;
  area_id: number | null;
  area_name?: string | null;
  area_color?: string | null;
  order_id: number | null;
  project_id: number | null;
  project_title: string | null;
  project_name?: string | null;
  due_date: string | null;
  due_time: string | null;
  waiting_for_text: string | null;
  sort_index: number | null;
  completed_at: string | null;
  cancelled_at: string | null;
  extras: Record<string, unknown>;
  updated_at: string;
}

export interface TaskComment { id: number; task_id: number; author_name: string | null; body: string; created_at: string; }
export interface ChecklistItem { id: number; task_id: number; title: string; is_done: boolean; sort_index: number | null; }
export interface TaskWatcher { task_id: number; user_id: number; employee_name?: string | null; }
export interface WorkActivity { id: number; task_id: number | null; project_id: number | null; activity_type: string; message: string; created_at: string; }
export interface WorkAsset { id: number; task_id: number | null; project_id: number | null; kind: string; title: string | null; url: string | null; }
export interface WorkTemplate { id: number; kind: string; name: string; title: string | null; checklist_items: string[]; is_active: boolean; }

export interface TaskDetail {
  task: Task;
  comments: TaskComment[];
  checklist: ChecklistItem[];
  watchers: TaskWatcher[];
  assets: WorkAsset[];
  activity: WorkActivity[];
}

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function taskStatusLabel(status: string) {
  return ({ incoming: 'Входящие', todo: 'К работе', in_progress: 'В работе', waiting: 'Ожидание', review: 'Проверка', done: 'Готово', cancelled: 'Отменено' } as Record<string, string>)[status] || status;
}

export function priorityLabel(priority: string) {
  return ({ low: 'Низкий', normal: 'Обычный', high: 'Высокий', urgent: 'Срочно' } as Record<string, string>)[priority] || priority;
}

export function projectStatusLabel(status: string) {
  return ({ active: 'Активен', paused: 'Пауза', done: 'Готов', cancelled: 'Отменен', archived: 'Архив' } as Record<string, string>)[status] || status;
}

export async function listAreas(params: { active?: boolean; search?: string } = {}) {
  const { areas } = await apiFetch<{ areas: Area[] }>(`/api/areas${query(params)}`);
  return areas;
}

export async function createArea(input: Partial<Area>) {
  const { area } = await apiFetch<{ area: Area }>('/api/areas', { method: 'POST', body: JSON.stringify({ id: Date.now(), ...input }) });
  return area;
}

export async function updateArea(id: number, input: Partial<Area>) {
  const { area } = await apiFetch<{ area: Area }>(`/api/areas/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  return area;
}

export async function deleteArea(id: number) {
  const { area } = await apiFetch<{ area: Area }>(`/api/areas/${id}`, { method: 'DELETE' });
  return area;
}

export async function listProjects(params: { status?: string; area_id?: number; search?: string } = {}) {
  const { projects } = await apiFetch<{ projects: Project[] }>(`/api/projects${query(params)}`);
  return projects;
}

export async function getProject(id: number) {
  return apiFetch<{ project: Project; tasks: Task[]; assets: WorkAsset[]; activity: WorkActivity[] }>(`/api/projects/${id}`);
}

export async function createProject(input: Partial<Project>) {
  const { project } = await apiFetch<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify({ id: Date.now(), ...input }) });
  return project;
}

export async function updateProject(id: number, input: Partial<Project>) {
  const { project } = await apiFetch<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  return project;
}

export async function deleteProject(id: number) {
  const { project } = await apiFetch<{ project: Project }>(`/api/projects/${id}`, { method: 'DELETE' });
  return project;
}

export async function listTasks(params: { status?: string; assignee_id?: number; project_id?: number; area_id?: number; due_date?: string; search?: string } = {}) {
  const { tasks } = await apiFetch<{ tasks: Task[] }>(`/api/tasks${query(params)}`);
  return tasks;
}

export async function getTask(id: number) {
  return apiFetch<TaskDetail>(`/api/tasks/${id}`);
}

export async function createTask(input: Partial<Task>) {
  const { task } = await apiFetch<{ task: Task }>('/api/tasks', { method: 'POST', body: JSON.stringify({ id: Date.now(), ...input }) });
  return task;
}

export async function updateTask(id: number, input: Partial<Task>) {
  const { task } = await apiFetch<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  return task;
}

export async function completeTask(id: number) {
  const { task } = await apiFetch<{ task: Task }>(`/api/tasks/${id}/complete`, { method: 'POST', body: '{}' });
  return task;
}

export async function addComment(taskId: number, body: string) {
  const { comment } = await apiFetch<{ comment: TaskComment }>(`/api/work/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  return comment;
}

export async function addChecklistItem(taskId: number, title: string) {
  const { item } = await apiFetch<{ item: ChecklistItem }>(`/api/work/tasks/${taskId}/checklist`, { method: 'POST', body: JSON.stringify({ title }) });
  return item;
}

export async function updateChecklistItem(id: number, input: Partial<ChecklistItem>) {
  const { item } = await apiFetch<{ item: ChecklistItem }>(`/api/work/checklist/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  return item;
}

export async function listTemplates(kind?: string) {
  const { templates } = await apiFetch<{ templates: WorkTemplate[] }>(`/api/work/templates${query({ kind, active: true })}`);
  return templates;
}
