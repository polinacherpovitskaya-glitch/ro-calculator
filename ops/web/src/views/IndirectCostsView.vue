<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Косвенные расходы</h1><p>{{ total.toLocaleString('ru-RU') }} ₽ за {{ year }} год</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/production/calendar">Календарь</RouterLink><button type="button" @click="startCreate">Добавить</button></div>
    </header>

    <section class="toolbar">
      <label>Год <input v-model.number="year" type="number" min="2020" max="2100" @change="load" /></label>
      <label>Месяц <select v-model.number="month" @change="load"><option :value="0">Все</option><option v-for="m in 12" :key="m" :value="m">{{ monthName(m) }}</option></select></label>
      <button type="button" :disabled="loading" @click="load">Обновить</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="layout">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Период</th><th>Категория</th><th>Сумма</th><th>Заметка</th><th></th></tr></thead>
          <tbody>
            <template v-for="group in grouped" :key="group.key">
              <tr class="group"><td colspan="5">{{ group.label }} · {{ group.total.toLocaleString('ru-RU') }} ₽</td></tr>
              <tr v-for="cost in group.items" :key="cost.id" :class="{ selected: selected?.id === cost.id }">
                <td>{{ monthName(cost.period_month) }} {{ cost.period_year }}</td>
                <td>{{ cost.category }}</td>
                <td>{{ Number(cost.amount).toLocaleString('ru-RU') }} {{ cost.currency }}</td>
                <td>{{ cost.note || '—' }}</td>
                <td class="right"><button type="button" @click="select(cost)">Открыть</button></td>
              </tr>
            </template>
            <tr v-if="loading"><td colspan="5">Загрузка...</td></tr>
            <tr v-if="!loading && costs.length === 0"><td colspan="5">Пусто</td></tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selected" class="editor">
        <header><h2>{{ isNew ? 'Новый расход' : selected.category }}</h2><button type="button" @click="selected = null">×</button></header>
        <label>Год <input v-model.number="form.period_year" type="number" min="2020" max="2100" /></label>
        <label>Месяц <select v-model.number="form.period_month"><option v-for="m in 12" :key="m" :value="m">{{ monthName(m) }}</option></select></label>
        <label>Категория <input v-model="form.category" /></label>
        <label>Сумма <input v-model.number="form.amount" type="number" min="0" step="0.01" /></label>
        <label>Валюта <input v-model="form.currency" /></label>
        <label>Заметка <textarea v-model="form.note" rows="4" /></label>
        <footer class="actions">
          <button v-if="!isNew" type="button" @click="remove">Удалить</button>
          <button type="button" :disabled="saving" @click="save">Сохранить</button>
        </footer>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { IndirectCost } from '../api/indirect';
import * as api from '../api/indirect';

const costs = ref<IndirectCost[]>([]);
const selected = ref<IndirectCost | null>(null);
const year = ref(new Date().getFullYear());
const month = ref(0);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const names = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const form = reactive({ id: 0, period_year: year.value, period_month: new Date().getMonth() + 1, category: '', amount: 0, currency: 'RUB', note: '' });
const isNew = computed(() => form.id === 0);
const total = computed(() => costs.value.reduce((sum, cost) => sum + Number(cost.amount || 0), 0));
const grouped = computed(() => {
  const map = new Map<string, { key: string; label: string; total: number; items: IndirectCost[] }>();
  for (const cost of costs.value) {
    const key = `${cost.period_year}-${String(cost.period_month).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { key, label: `${monthName(cost.period_month)} ${cost.period_year}`, total: 0, items: [] });
    const group = map.get(key)!;
    group.total += Number(cost.amount || 0);
    group.items.push(cost);
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
});

onMounted(load);

function monthName(value: number) { return names[value] || String(value); }
function message(caught: unknown) { return caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Операция не выполнена'; }
async function load() {
  loading.value = true; error.value = '';
  try { costs.value = await api.listIndirectCosts({ year: year.value, month: month.value || undefined }); }
  catch (caught) { error.value = message(caught); }
  finally { loading.value = false; }
}
function fill(cost: IndirectCost | null) {
  Object.assign(form, { id: cost ? Number(cost.id) : 0, period_year: cost?.period_year || year.value, period_month: cost?.period_month || new Date().getMonth() + 1, category: cost?.category || '', amount: Number(cost?.amount || 0), currency: cost?.currency || 'RUB', note: cost?.note || '' });
}
function select(cost: IndirectCost) { selected.value = cost; fill(cost); }
function startCreate() { selected.value = { id: 0, period_year: year.value, period_month: month.value || new Date().getMonth() + 1, category: '', amount: 0, currency: 'RUB', note: null }; fill(selected.value); }
async function save() {
  saving.value = true; error.value = '';
  const payload = { period_year: form.period_year, period_month: form.period_month, category: form.category, amount: form.amount, currency: form.currency || 'RUB', note: form.note || null };
  try {
    const saved = isNew.value ? await api.createIndirectCost(payload) : await api.updateIndirectCost(form.id, payload);
    selected.value = saved; fill(saved); await load();
  } catch (caught) { error.value = message(caught); }
  finally { saving.value = false; }
}
async function remove() {
  if (!selected.value || !window.confirm('Удалить расход?')) return;
  await api.deleteIndirectCost(Number(selected.value.id));
  selected.value = null;
  await load();
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .toolbar, .layout { max-width: 78rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1.1rem; } p { color: #697586; margin-top: .25rem; } .layout { display: grid; grid-template-columns: minmax(0, 1fr) 23rem; gap: 1rem; align-items: start; } label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, textarea, button, a { box-sizing: border-box; font: inherit; } input, select, textarea { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .78rem; text-transform: uppercase; } .group td { background: #eef3f8; color: #315c96; font-weight: 650; } tr.selected { background: #eef2ff; } .right { text-align: right; }
.editor { display: grid; gap: .75rem; background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; } .editor header, .actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } .actions { justify-content: flex-end; } .error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
