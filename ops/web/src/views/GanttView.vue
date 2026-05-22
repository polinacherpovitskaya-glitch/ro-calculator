<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Гант</h1><p>{{ rows.length }} строк</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/tasks">Задачи</RouterLink><RouterLink to="/projects">Проекты</RouterLink><button type="button" @click="load">Обновить</button></div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="timeline">
      <header class="scale">
        <span class="scale-label">Задачи</span>
        <div class="scale-days">
          <b v-for="day in days" :key="day">{{ day.slice(5) }}</b>
        </div>
      </header>
      <div v-if="loading" class="empty">Загрузка...</div>
      <div v-for="row in rows" :key="row.kind + row.id" class="row">
        <div class="label"><strong>{{ row.title }}</strong><small>{{ row.subtitle }}</small></div>
        <div class="track">
          <span class="bar" :class="row.kind" :style="{ left: `${row.left}%`, width: `${row.width}%` }">{{ row.status }}</span>
        </div>
      </div>
      <div v-if="!loading && rows.length === 0" class="empty">Пусто</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import * as api from '../api/work';
import type { Project, Task } from '../api/work';

const projects = ref<Project[]>([]);
const tasks = ref<Task[]>([]);
const loading = ref(false);
const error = ref('');
const today = new Date();
const days = computed(() => Array.from({ length: 21 }, (_, index) => dateOffset(index - 3)));
const start = computed(() => new Date(`${days.value[0]}T00:00:00`));
const end = computed(() => new Date(`${days.value[days.value.length - 1]}T00:00:00`));
const rows = computed(() => {
  const projectRows = projects.value.map((project) => rowForProject(project)).filter(Boolean);
  const taskRows = tasks.value.map((task) => rowForTask(task)).filter(Boolean);
  return [...projectRows, ...taskRows].slice(0, 80) as TimelineRow[];
});

interface TimelineRow { kind: 'project' | 'task'; id: number; title: string; subtitle: string; status: string; left: number; width: number; }

onMounted(load);

function message(caught: unknown) { return caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Операция не выполнена'; }
function dateOffset(offset: number) { const date = new Date(today); date.setDate(today.getDate() + offset); return date.toISOString().slice(0, 10); }
function pct(date: Date) { const total = end.value.getTime() - start.value.getTime(); return Math.max(0, Math.min(100, ((date.getTime() - start.value.getTime()) / total) * 100)); }
function span(from: string | null, to: string | null) {
  if (!from && !to) return null;
  const startDate = new Date(`${from || to}T00:00:00`);
  const endDate = new Date(`${to || from}T00:00:00`);
  return { left: pct(startDate), width: Math.max(4, pct(endDate) - pct(startDate) + 4) };
}
function rowForProject(project: Project) {
  const range = span(project.start_date, project.due_date);
  if (!range) return null;
  return { kind: 'project', id: Number(project.id), title: project.title, subtitle: project.area_name || 'Проект', status: api.projectStatusLabel(project.status), ...range };
}
function rowForTask(task: Task) {
  const range = span(task.due_date, task.due_date);
  if (!range) return null;
  return { kind: 'task', id: Number(task.id), title: task.title, subtitle: task.project_name || task.area_name || 'Задача', status: api.taskStatusLabel(task.status), ...range };
}
async function load() {
  loading.value = true; error.value = '';
  try { [projects.value, tasks.value] = await Promise.all([api.listProjects(), api.listTasks()]); }
  catch (caught) { error.value = message(caught); }
  finally { loading.value = false; }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .timeline { max-width: 92rem; margin: 0 auto 1rem; } .page-header, .header-actions { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions { justify-content: flex-start; flex-wrap: wrap; }
h1, p { margin: 0; } h1 { font-size: 1.7rem; } p, small { color: #697586; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; font: inherit; text-decoration: none; cursor: pointer; }
.timeline { background: white; border: 1px solid #d9e2ec; border-radius: 8px; overflow-x: auto; } .scale, .row { display: grid; grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr); } .scale { position: sticky; top: 0; z-index: 1; background: #f8fafc; border-bottom: 1px solid #d9e2ec; } .scale-label { padding: .65rem; color: #52606d; font-size: .76rem; font-weight: 800; text-transform: uppercase; } .scale-days { display: grid; grid-template-columns: repeat(21, minmax(2rem, 1fr)); } .scale b { padding: .65rem 0; color: #52606d; font-size: .72rem; text-align: center; border-left: 1px solid #eef2f6; }
.row { border-bottom: 1px solid #eef2f6; } .label { padding: .65rem; } .label strong, .label small { display: block; } .track { position: relative; min-height: 3rem; background-image: repeating-linear-gradient(90deg, #eef2f6 0, #eef2f6 1px, transparent 1px, transparent calc(100% / 21)); } .bar { position: absolute; top: .7rem; min-width: 3rem; height: 1.6rem; border-radius: 6px; padding: .25rem .45rem; color: white; font-size: .78rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } .bar.project { background: #2563eb; } .bar.task { background: #0f766e; }
.empty { padding: 1rem; color: #697586; } .error { max-width: 92rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 900px) { .page-header { align-items: start; flex-direction: column; } }
</style>
