<template>
  <main class="history-page">
    <header class="page-header">
      <div>
        <RouterLink to="/warehouse">← Склад</RouterLink>
        <h1>Журнал движений</h1>
      </div>
      <div class="pager">
        <button type="button" :disabled="page === 0 || loading" @click="prevPage">Назад</button>
        <span>{{ page + 1 }}</span>
        <button type="button" :disabled="history.length < limit || loading" @click="nextPage">Вперёд</button>
      </div>
    </header>

    <section class="filters">
      <label>
        Тип
        <select v-model="type" @change="reloadFirst">
          <option value="">Все</option>
          <option value="receipt">receipt</option>
          <option value="consume">consume</option>
          <option value="inventory_audit">inventory_audit</option>
          <option value="manual_edit">manual_edit</option>
          <option value="return">return</option>
        </select>
      </label>
      <label>
        Позиция ID
        <input v-model.number="itemId" type="number" min="1" @keydown.enter="reloadFirst" />
      </label>
      <label>
        С
        <input v-model="from" type="date" @change="reloadFirst" />
      </label>
      <label>
        По
        <input v-model="to" type="date" @change="reloadFirst" />
      </label>
      <label>
        Лимит
        <select v-model.number="limit" @change="reloadFirst">
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <button type="button" :disabled="loading" @click="reloadFirst">Обновить</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Позиция</th>
            <th>До</th>
            <th>После</th>
            <th>Изменение</th>
            <th>Сотрудник</th>
            <th>Заметка</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8">Загрузка...</td>
          </tr>
          <tr v-for="entry in history" :key="entry.id">
            <td>{{ formatDate(entry.created_at) }}</td>
            <td>{{ entry.type }}</td>
            <td>{{ entry.item_id || '—' }}</td>
            <td>{{ formatNumber(entry.qty_before) }}</td>
            <td>{{ formatNumber(entry.qty_after) }}</td>
            <td :class="entry.qty_change >= 0 ? 'plus' : 'minus'">{{ signed(entry.qty_change) }}</td>
            <td>{{ entry.actor_name || '—' }}</td>
            <td>{{ entry.note || '—' }}</td>
          </tr>
          <tr v-if="!loading && history.length === 0">
            <td colspan="8">Пусто</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import * as warehouseApi from '../api/warehouse';
import type { WarehouseHistoryEntry } from '../api/warehouse';

const history = ref<WarehouseHistoryEntry[]>([]);
const loading = ref(false);
const error = ref('');
const type = ref('');
const itemId = ref<number | null>(null);
const from = ref('');
const to = ref('');
const limit = ref(50);
const page = ref(0);

onMounted(() => {
  void load();
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    history.value = await warehouseApi.listHistory({
      itemId: itemId.value || undefined,
      type: type.value || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      limit: limit.value,
      offset: page.value * limit.value,
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить журнал';
  } finally {
    loading.value = false;
  }
}

function reloadFirst() {
  page.value = 0;
  void load();
}

function prevPage() {
  page.value = Math.max(0, page.value - 1);
  void load();
}

function nextPage() {
  page.value += 1;
  void load();
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}

function signed(value: number) {
  const formatted = formatNumber(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
</script>

<style scoped>
.history-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 1.5rem;
  background: #f6f7f9;
  color: #1f2933;
  font-family: system-ui, sans-serif;
}

.page-header,
.filters,
.table-wrap,
.error {
  max-width: 78rem;
  margin: 0 auto 1rem;
}

.page-header,
.filters,
.pager {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}

.page-header {
  justify-content: space-between;
}

.page-header a {
  color: #1d4f91;
}

h1 {
  margin: 0.35rem 0 0;
  font-size: 1.55rem;
}

label {
  display: grid;
  gap: 0.3rem;
  color: #52606d;
  font-size: 0.85rem;
}

input,
select,
button {
  min-height: 2.25rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  background: #fff;
  padding: 0.45rem 0.55rem;
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.error {
  color: #b42318;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid #dde2e8;
  background: #fff;
}

table {
  width: 100%;
  min-width: 58rem;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid #edf0f3;
  padding: 0.55rem 0.65rem;
  text-align: left;
  white-space: nowrap;
}

th {
  color: #52606d;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}

.plus {
  color: #067647;
}

.minus {
  color: #b42318;
}

@media (max-width: 760px) {
  .history-page {
    padding: 1rem;
  }

  .page-header,
  .filters {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
