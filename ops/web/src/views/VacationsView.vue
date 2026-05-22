<template>
  <main class="page">
    <header class="page-header"><h1>Отпуска</h1><RouterLink to="/">Главная</RouterLink></header>
    <section class="toolbar">
      <label>Сотрудник <select v-model.number="draft.employee_id"><option :value="0">Выбрать</option><option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <label>С <input v-model="draft.start_date" type="date" /></label>
      <label>По <input v-model="draft.end_date" type="date" /></label>
      <label>Тип
        <select v-model="draft.type">
          <option value="vacation">Отпуск</option>
          <option value="sick">Больничный</option>
          <option value="unpaid">Без оплаты</option>
          <option value="holiday">Праздник</option>
        </select>
      </label>
      <label class="check"><input v-model="draft.is_paid" type="checkbox" /> оплачиваемый</label>
      <button type="button" @click="addVacation">Добавить</button>
    </section>
    <table>
      <thead><tr><th>Сотрудник</th><th>Даты</th><th>Тип</th><th>Оплата</th></tr></thead>
      <tbody>
        <tr v-for="vacation in vacations" :key="vacation.id">
          <td>{{ vacation.employee_name }}</td>
          <td>{{ formatDate(vacation.start_date) }} - {{ formatDate(vacation.end_date) }}</td>
          <td>{{ typeLabel(vacation.type) }}</td>
          <td>{{ vacation.is_paid ? 'Да' : 'Нет' }}</td>
        </tr>
        <tr v-if="!vacations.length"><td colspan="4">Пусто</td></tr>
      </tbody>
    </table>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { apiFetch } from '../api';
import * as api from '../api/timePayroll';

const employees = ref<Array<{ id: number; name: string }>>([]);
const vacations = ref<api.Vacation[]>([]);
const today = new Date().toISOString().slice(0, 10);
const draft = reactive({ employee_id: 0, start_date: today, end_date: today, type: 'vacation', is_paid: true });
const typeLabels: Record<string, string> = {
  vacation: 'Отпуск',
  sick: 'Больничный',
  unpaid: 'Без оплаты',
  holiday: 'Праздник',
};

async function load() {
  const [empBody, rows] = await Promise.all([
    apiFetch<{ employees: Array<{ id: number; name: string }> }>('/api/employees?active=true'),
    api.listVacations(),
  ]);
  employees.value = empBody.employees;
  vacations.value = rows;
}

async function addVacation() {
  if (!draft.employee_id) return;
  await api.createVacation(draft);
  await load();
}

function typeLabel(value: string) {
  return typeLabels[value] || value;
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}

onMounted(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, table { max-width: 78rem; margin: 0 auto 1rem; }
.page-header, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
label { display: grid; gap: .3rem; font-size: .85rem; color: #52606d; } .check { display: flex; align-items: center; min-height: 2.25rem; }
input, select, button, a { box-sizing: border-box; min-height: 2.25rem; font: inherit; border: 1px solid #cbd5df; border-radius: 6px; background: white; padding: .35rem .55rem; color: inherit; text-decoration: none; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; }
</style>
