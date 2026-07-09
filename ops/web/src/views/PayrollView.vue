<template>
  <main class="page">
    <header class="page-header"><h1>Зарплаты</h1><RouterLink to="/">Главная</RouterLink></header>
    <section class="toolbar">
      <label>Год <input v-model.number="period.year" type="number" /></label>
      <label>Месяц <input v-model.number="period.month" type="number" min="1" max="12" /></label>
      <label>Период <select v-model="period.half"><option value="first">1-15</option><option value="second">16-конец</option><option value="full">месяц</option></select></label>
      <button type="button" @click="recalculate">Пересчитать всех</button>
    </section>
    <table>
      <thead><tr><th>Сотрудник</th><th>Часы</th><th>Сверхурочные</th><th>База</th><th>Доплата</th><th>Итого</th><th></th></tr></thead>
      <tbody>
        <tr v-for="row in periods" :key="row.id">
          <td>{{ row.employee_name }}</td><td>{{ row.hours_regular }}</td><td>{{ row.hours_overtime }}</td>
          <td>{{ money(row.base_amount) }}</td><td>{{ money(row.overtime_amount) }}</td><td><b>{{ money(row.total) }}</b></td>
          <td><button type="button" @click="markPaid(row.id)">{{ row.paid_at ? 'Оплачено' : 'Отметить выплачено' }}</button></td>
        </tr>
        <tr v-if="!periods.length"><td colspan="7">Нет расчётов</td></tr>
      </tbody>
    </table>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import * as api from '../api/timePayroll';

const now = new Date();
const period = reactive({ year: now.getFullYear(), month: now.getMonth() + 1, half: 'first' });
const periods = ref<api.PayrollPeriod[]>([]);
const money = (value: number) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`;

async function load() {
  periods.value = await api.listPayrollPeriods(period);
}

async function recalculate() {
  periods.value = await api.calculatePayroll(period);
}

async function markPaid(id: number) {
  await api.markPayrollPaid(id, true);
  await load();
}

onMounted(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, table { max-width: 78rem; margin: 0 auto 1rem; }
.page-header, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
label { display: grid; gap: .3rem; font-size: .85rem; color: #52606d; }
input, select, button, a { box-sizing: border-box; min-height: 2.25rem; font: inherit; border: 1px solid #cbd5df; border-radius: 6px; background: white; padding: .35rem .55rem; color: inherit; text-decoration: none; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; }
</style>
