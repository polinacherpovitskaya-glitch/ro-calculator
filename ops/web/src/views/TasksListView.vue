<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Задачи</h1><p>{{ tasks.length }} записей</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/projects">Проекты</RouterLink><RouterLink to="/gantt">Гант</RouterLink><button type="button" @click="startCreate">Новая задача</button></div>
    </header>

    <section class="toolbar">
      <label>Поиск <input v-model="filters.search" type="search" @keydown.enter="load" /></label>
      <label>Статус <select v-model="filters.status"><option value="">Все</option><option v-for="status in statuses" :key="status" :value="status">{{ api.taskStatusLabel(status) }}</option></select></label>
      <label>Проект <select v-model.number="filters.project_id"><option :value="0">Все</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }}</option></select></label>
      <label>Область <select v-model.number="filters.area_id"><option :value="0">Все</option><option v-for="area in areas" :key="area.id" :value="area.id">{{ area.name }}</option></select></label>
      <button type="button" :disabled="loading" @click="load">Обновить</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="layout">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Задача</th><th class="status-col">Статус</th><th class="priority-col">Приоритет</th><th>Контекст</th><th class="date-col">Дедлайн</th><th class="action-col"></th></tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="6">Загрузка...</td></tr>
            <tr v-for="task in tasks" :key="task.id" :class="{ selected: selected?.id === task.id }">
              <td><strong>{{ task.title }}</strong><small>{{ task.assignee_name || 'Без исполнителя' }}</small></td>
              <td>{{ api.taskStatusLabel(task.status) }}</td>
              <td>{{ api.priorityLabel(task.priority) }}</td>
              <td>{{ task.project_name || task.project_title || task.area_name || task.order_id || '—' }}</td>
              <td class="date-col">{{ formatDate(task.due_date) }}</td>
              <td class="right action-col"><button type="button" @click="openTask(task)">Открыть</button></td>
            </tr>
            <tr v-if="!loading && tasks.length === 0"><td colspan="6">Пусто</td></tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selected" class="editor">
        <header><h2>{{ isNew ? 'Новая задача' : selected.title }}</h2><button type="button" @click="selected = null">×</button></header>
        <label>Название <input v-model="form.title" /></label>
        <label>Описание <textarea v-model="form.description" rows="4" /></label>
        <div class="grid2">
          <label>Статус <select v-model="form.status"><option v-for="status in statuses" :key="status" :value="status">{{ api.taskStatusLabel(status) }}</option></select></label>
          <label>Приоритет <select v-model="form.priority"><option v-for="priority in priorities" :key="priority" :value="priority">{{ api.priorityLabel(priority) }}</option></select></label>
          <label>Проект <select v-model.number="form.project_id"><option :value="0">—</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }}</option></select></label>
          <label>Область <select v-model.number="form.area_id"><option :value="0">—</option><option v-for="area in areas" :key="area.id" :value="area.id">{{ area.name }}</option></select></label>
          <label>Исполнитель ID <input v-model.number="form.assignee_id" type="number" /></label>
          <label>Дедлайн <input v-model="form.due_date" type="date" /></label>
        </div>
        <label>Ожидаем <input v-model="form.waiting_for_text" /></label>
        <footer class="actions">
          <button v-if="!isNew" type="button" @click="complete">Закрыть</button>
          <button type="button" :disabled="saving" @click="save">Сохранить</button>
        </footer>

        <section v-if="detail" class="detail">
          <h3>Чек-лист</h3>
          <div v-for="item in detail.checklist" :key="item.id" class="checkline"><input :checked="item.is_done" type="checkbox" @change="toggleChecklist(item)" /><span>{{ item.title }}</span></div>
          <form class="inline" @submit.prevent="addChecklist"><input v-model="newChecklist" placeholder="Новый пункт" /><button type="submit">Добавить</button></form>
          <h3>Комментарии</h3>
          <p v-for="comment in detail.comments" :key="comment.id" class="comment"><strong>{{ comment.author_name || '—' }}</strong> {{ comment.body }}</p>
          <form class="inline" @submit.prevent="addComment"><input v-model="newComment" placeholder="Комментарий" /><button type="submit">Отправить</button></form>
          <h3>Активность</h3>
          <p v-for="entry in detail.activity.slice(0, 6)" :key="entry.id" class="activity">{{ entry.message }}</p>
        </section>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import * as api from '../api/work';
import type { Area, ChecklistItem, Project, Task, TaskDetail, TaskPriority, TaskStatus } from '../api/work';

const statuses: TaskStatus[] = ['incoming', 'todo', 'in_progress', 'waiting', 'review', 'done', 'cancelled'];
const priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
const tasks = ref<Task[]>([]);
const areas = ref<Area[]>([]);
const projects = ref<Project[]>([]);
const selected = ref<Task | null>(null);
const detail = ref<TaskDetail | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const newComment = ref('');
const newChecklist = ref('');
const filters = reactive({ search: '', status: '', project_id: 0, area_id: 0 });
const form = reactive({ id: 0, title: '', description: '', status: 'incoming' as TaskStatus, priority: 'normal' as TaskPriority, project_id: 0, area_id: 9107, assignee_id: null as number | null, due_date: '', waiting_for_text: '' });
const isNew = computed(() => form.id === 0);
let timer: number | undefined;

onMounted(async () => { await Promise.all([loadRefs(), load()]); });
watch(() => filters.search, () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 250); });

function message(caught: unknown) { return caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Операция не выполнена'; }
function formatDate(value: string | null | undefined) {
  const raw = value ? String(value).slice(0, 10) : '';
  if (!raw) return '—';
  const [year, month, day] = raw.split('-');
  return year && month && day ? `${day}.${month}.${year}` : raw;
}
async function loadRefs() { [areas.value, projects.value] = await Promise.all([api.listAreas({ active: true }), api.listProjects({ status: 'active' })]); }
async function load() {
  loading.value = true; error.value = '';
  try { tasks.value = await api.listTasks({ search: filters.search, status: filters.status || undefined, project_id: filters.project_id || undefined, area_id: filters.area_id || undefined }); }
  catch (caught) { error.value = message(caught); }
  finally { loading.value = false; }
}
function fill(task: Task | null) {
  Object.assign(form, {
    id: task ? Number(task.id) : 0,
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'incoming',
    priority: task?.priority || 'normal',
    project_id: task?.project_id || 0,
    area_id: task?.area_id || areas.value[0]?.id || 9107,
    assignee_id: task?.assignee_id || null,
    due_date: task?.due_date ? String(task.due_date).slice(0, 10) : '',
    waiting_for_text: task?.waiting_for_text || '',
  });
}
async function openTask(task: Task) { selected.value = task; fill(task); detail.value = await api.getTask(Number(task.id)); }
function startCreate() { selected.value = { id: 0 } as Task; detail.value = null; fill(null); }
function payload() { return { title: form.title, description: form.description, status: form.status, priority: form.priority, project_id: form.project_id || null, area_id: form.area_id || null, assignee_id: form.assignee_id || null, due_date: form.due_date || null, waiting_for_text: form.waiting_for_text || '' }; }
async function save() {
  saving.value = true; error.value = '';
  try {
    const saved = isNew.value ? await api.createTask(payload()) : await api.updateTask(form.id, payload());
    selected.value = saved; fill(saved); detail.value = await api.getTask(Number(saved.id)); await load();
  } catch (caught) { error.value = message(caught); }
  finally { saving.value = false; }
}
async function complete() { if (!selected.value) return; selected.value = await api.completeTask(Number(selected.value.id)); fill(selected.value); await load(); }
async function addComment() { if (!selected.value || !newComment.value.trim()) return; await api.addComment(Number(selected.value.id), newComment.value); newComment.value = ''; detail.value = await api.getTask(Number(selected.value.id)); }
async function addChecklist() { if (!selected.value || !newChecklist.value.trim()) return; await api.addChecklistItem(Number(selected.value.id), newChecklist.value); newChecklist.value = ''; detail.value = await api.getTask(Number(selected.value.id)); }
async function toggleChecklist(item: ChecklistItem) { await api.updateChecklistItem(Number(item.id), { is_done: !item.is_done }); if (selected.value) detail.value = await api.getTask(Number(selected.value.id)); }
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .toolbar, .layout { max-width: 90rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, h3, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1.1rem; } h3 { margin-top: .4rem; font-size: .9rem; } p, small { color: #697586; } small { display: block; margin-top: .2rem; } .layout { display: grid; grid-template-columns: minmax(0, 1fr) 28rem; gap: 1rem; align-items: start; } label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, textarea, button, a { box-sizing: border-box; font: inherit; } input, select, textarea { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .6rem; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: top; } th { color: #52606d; font-size: .76rem; text-transform: uppercase; } tr.selected { background: #eef2ff; } .right { text-align: right; } .status-col { width: 8rem; } .priority-col { width: 7.5rem; } .date-col { width: 6.8rem; white-space: nowrap; } .action-col { width: 5.8rem; }
.editor { display: grid; gap: .75rem; background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; } .editor header, .actions, .inline, .checkline { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } .actions { justify-content: flex-end; } .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; } .detail { display: grid; gap: .45rem; border-top: 1px solid #eef2f6; padding-top: .75rem; } .inline input { flex: 1; } .comment, .activity { font-size: .88rem; padding: .4rem .5rem; background: #f8fafc; border-radius: 6px; } .error { max-width: 90rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 980px) { .layout { grid-template-columns: 1fr; } .table-wrap { overflow-x: auto; } }
</style>
