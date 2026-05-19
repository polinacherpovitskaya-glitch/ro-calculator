<template>
  <main class="page">
    <header class="page-header">
      <div><h1>План производства</h1><p>{{ entries.length }} записей</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/production/calendar">Календарь</RouterLink><RouterLink to="/templates">Шаблоны</RouterLink><button type="button" @click="startCreate">Добавить</button></div>
    </header>

    <section class="toolbar">
      <label>Дата <input v-model="filterDate" type="date" /></label>
      <label>Заказ <input v-model.number="filterOrderId" type="number" /></label>
      <button type="button" :disabled="loading" @click="load">Обновить</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="layout">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Дата</th><th>Позиция</th><th>Заказ</th><th>Изделие</th><th>Кол-во</th><th>Часы</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="8">Загрузка...</td></tr>
            <tr v-for="entry in entries" :key="entry.id" :class="{ selected: selected?.id === entry.id }">
              <td>{{ dateOnly(entry.date) }}</td>
              <td>{{ entry.position }}</td>
              <td>{{ entry.order_id || '—' }}</td>
              <td>{{ entry.item_name || '—' }}</td>
              <td>{{ entry.qty ?? '—' }}</td>
              <td>{{ entry.hours_planned ?? '—' }}</td>
              <td>{{ statusLabel(entry.status) }}</td>
              <td class="row-actions"><button type="button" @click="move(entry, -1)">↑</button><button type="button" @click="move(entry, 1)">↓</button><button type="button" @click="selectEntry(entry)">Открыть</button></td>
            </tr>
            <tr v-if="!loading && entries.length === 0"><td colspan="8">Пусто</td></tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selected" class="editor">
        <header><h2>{{ isNew ? 'Новая запись' : `#${selected.id}` }}</h2><button type="button" @click="selected = null">×</button></header>
        <label>Дата <input v-model="form.date" type="date" /></label>
        <label>Заказ <input v-model.number="form.order_id" type="number" /></label>
        <label>Изделие <input v-model="form.item_name" /></label>
        <label>Количество <input v-model.number="form.qty" type="number" min="0" step="0.01" /></label>
        <label>Часы <input v-model.number="form.hours_planned" type="number" min="0" step="0.1" /></label>
        <label>Оператор ID <input v-model.number="form.operator_id" type="number" /></label>
        <label>Статус <select v-model="form.status"><option value="planned">Запланировано</option><option value="in_progress">В работе</option><option value="done">Готово</option><option value="cancelled">Отменено</option></select></label>
        <label>Позиция <input v-model.number="form.position" type="number" /></label>
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
import type { ProductionPlanEntry } from '../api/production';
import * as api from '../api/production';

const entries = ref<ProductionPlanEntry[]>([]);
const selected = ref<ProductionPlanEntry | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const filterDate = ref('');
const filterOrderId = ref<number | null>(null);
const form = reactive({ id: 0, date: new Date().toISOString().slice(0, 10), order_id: null as number | null, item_name: '', qty: null as number | null, hours_planned: null as number | null, operator_id: null as number | null, status: 'planned' as ProductionPlanEntry['status'], position: 100, note: '' });
const isNew = computed(() => form.id === 0);

onMounted(load);

function message(caught: unknown) { return caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Операция не выполнена'; }
function dateOnly(value: string) { return String(value).slice(0, 10); }
function statusLabel(status: string) { return ({ planned: 'Запланировано', in_progress: 'В работе', done: 'Готово', cancelled: 'Отменено' } as Record<string, string>)[status] || status; }
async function load() {
  loading.value = true; error.value = '';
  try { entries.value = await api.listPlanEntries({ date: filterDate.value || undefined, order_id: filterOrderId.value || undefined }); }
  catch (caught) { error.value = message(caught); }
  finally { loading.value = false; }
}
function fill(entry: ProductionPlanEntry | null) {
  Object.assign(form, {
    id: entry ? Number(entry.id) : 0,
    date: entry ? dateOnly(entry.date) : new Date().toISOString().slice(0, 10),
    order_id: entry?.order_id ?? null,
    item_name: entry?.item_name || '',
    qty: entry?.qty === null ? null : Number(entry?.qty ?? 0),
    hours_planned: entry?.hours_planned === null ? null : Number(entry?.hours_planned ?? 0),
    operator_id: entry?.operator_id ?? null,
    status: entry?.status || 'planned',
    position: entry?.position || 100,
    note: entry?.note || '',
  });
}
function selectEntry(entry: ProductionPlanEntry) { selected.value = entry; fill(entry); }
function startCreate() { selected.value = { id: 0, date: form.date, order_id: null, item_name: null, qty: null, hours_planned: null, operator_id: null, status: 'planned', position: 100, note: null }; fill(null); }
function payload() {
  return { date: form.date, order_id: form.order_id || null, item_name: form.item_name || null, qty: form.qty, hours_planned: form.hours_planned, operator_id: form.operator_id || null, status: form.status, position: form.position, note: form.note || null };
}
async function save() {
  saving.value = true; error.value = '';
  try {
    const saved = isNew.value ? await api.createPlanEntry(payload()) : await api.updatePlanEntry(form.id, payload());
    selected.value = saved; fill(saved); await load();
  } catch (caught) { error.value = message(caught); }
  finally { saving.value = false; }
}
async function move(entry: ProductionPlanEntry, direction: -1 | 1) {
  const sorted = [...entries.value].sort((a, b) => a.position - b.position || a.id - b.id);
  const index = sorted.findIndex((item) => item.id === entry.id);
  const neighbor = sorted[index + direction];
  if (!neighbor) return;
  try { await api.reorderPlanEntry(entry.id, neighbor.position + direction); await load(); }
  catch (caught) { error.value = message(caught); }
}
async function remove() {
  if (!selected.value || !window.confirm('Удалить запись плана?')) return;
  await api.deletePlanEntry(Number(selected.value.id));
  selected.value = null;
  await load();
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .toolbar, .layout { max-width: 84rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1.1rem; } p { color: #697586; margin-top: .25rem; } .layout { display: grid; grid-template-columns: minmax(0, 1fr) 24rem; gap: 1rem; align-items: start; } label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, textarea, button, a { box-sizing: border-box; font: inherit; } input, select, textarea { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .6rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .76rem; text-transform: uppercase; } tr.selected { background: #eef2ff; } .row-actions { display: flex; gap: .35rem; justify-content: flex-end; }
.editor { display: grid; gap: .75rem; background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; } .editor header, .actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } .actions { justify-content: flex-end; } .error { max-width: 84rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 980px) { .layout { grid-template-columns: 1fr; } .table-wrap { overflow-x: auto; } }
</style>
