<template>
  <main class="page">
    <header class="page-header"><h1>Часы</h1><RouterLink to="/">Главная</RouterLink></header>
    <section class="toolbar">
      <label>Сотрудник <select v-model.number="draft.employee_id"><option :value="0">Выбрать</option><option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label>Дата <input v-model="draft.date" type="date" /></label>
      <label>Часы <input v-model.number="draft.hours" type="number" min="0.25" step="0.25" /></label>
      <label>Проект <input v-model="draft.project_name" /></label>
      <label>Этап <input v-model="draft.stage" /></label>
      <label class="check"><input v-model="draft.is_overtime" type="checkbox" /> overtime</label>
      <button type="button" @click="addEntry">Добавить</button>
    </section>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="summary">Всего: <b>{{ totalHours.toFixed(2) }}</b> ч</section>
    <table>
      <thead><tr><th>Дата</th><th>Сотрудник</th><th>Проект</th><th>Этап</th><th>Часы</th><th></th></tr></thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.id">
          <td>{{ entry.date }}</td><td>{{ entry.employee_name }}</td><td>{{ entry.project_name }}</td><td>{{ entry.stage }}</td>
          <td>{{ entry.hours }}<span v-if="entry.is_overtime"> overtime</span></td>
          <td class="right"><button type="button" @click="removeEntry(entry.id)">Удалить</button></td>
        </tr>
        <tr v-if="!entries.length"><td colspan="6">Пусто</td></tr>
      </tbody>
    </table>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { apiFetch } from '../api';
import * as api from '../api/timePayroll';

const employees = ref<Array<{ id: number; name: string }>>([]);
const entries = ref<api.TimeEntry[]>([]);
const error = ref('');
const today = new Date().toISOString().slice(0, 10);
const draft = reactive({ employee_id: 0, date: today, hours: 8, project_name: '', stage: 'other', is_overtime: false });
const totalHours = computed(() => entries.value.reduce((sum, entry) => sum + Number(entry.hours || 0), 0));

async function load() {
  const [empBody, timeEntries] = await Promise.all([
    apiFetch<{ employees: Array<{ id: number; name: string }> }>('/api/employees?active=true'),
    api.listTimeEntries({ date_from: `${today.slice(0, 7)}-01`, date_to: today }),
  ]);
  employees.value = empBody.employees;
  entries.value = timeEntries;
}

async function addEntry() {
  error.value = '';
  if (!draft.employee_id) { error.value = 'Выберите сотрудника'; return; }
  await api.createTimeEntry(draft);
  await load();
}

async function removeEntry(id: number) {
  await api.deleteTimeEntry(id);
  await load();
}

onMounted(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, .summary, table { max-width: 78rem; margin: 0 auto 1rem; }
.page-header, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
label { display: grid; gap: .3rem; font-size: .85rem; color: #52606d; } .check { display: flex; align-items: center; min-height: 2.25rem; }
input, select, button, a { box-sizing: border-box; min-height: 2.25rem; font: inherit; border: 1px solid #cbd5df; border-radius: 6px; background: white; padding: .35rem .55rem; color: inherit; text-decoration: none; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; } .right { text-align: right; } .error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
</style>
