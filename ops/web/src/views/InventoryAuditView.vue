<template>
  <main class="audit-page">
    <header class="page-header">
      <div>
        <RouterLink to="/warehouse">← Склад</RouterLink>
        <h1>Инвентаризация</h1>
        <p>{{ changedRows.length }} изменений</p>
      </div>
      <button type="button" :disabled="saving || changedRows.length === 0" @click="submitAudit">
        {{ saving ? 'Сохраняем...' : 'Завершить' }}
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Название</th>
            <th>Категория</th>
            <th>Текущее</th>
            <th>Факт</th>
            <th>Разница</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="warehouse.loading">
            <td colspan="5">Загрузка...</td>
          </tr>
          <tr v-for="row in rows" :key="row.item.id" :class="{ changed: row.factual !== row.item.qty }">
            <td>{{ row.item.name }}</td>
            <td>{{ row.item.category || '—' }}</td>
            <td>{{ formatNumber(row.item.qty) }}</td>
            <td>
              <input v-model.number="row.factual" type="number" min="0" step="0.01" />
            </td>
            <td>{{ signed(row.factual - row.item.qty) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import * as warehouseApi from '../api/warehouse';
import type { WarehouseItem } from '../api/warehouse';
import { useWarehouseStore } from '../stores/warehouse';

const warehouse = useWarehouseStore();
const rows = reactive<{ item: WarehouseItem; factual: number }[]>([]);
const saving = ref(false);
const error = ref('');

const changedRows = computed(() =>
  rows.filter((row) => Number.isFinite(row.factual) && row.factual >= 0 && row.factual !== row.item.qty)
);

onMounted(async () => {
  await warehouse.loadItems();
  resetRows();
});

watch(
  () => warehouse.items,
  () => resetRows()
);

function resetRows() {
  rows.splice(
    0,
    rows.length,
    ...warehouse.items.map((item) => ({
      item,
      factual: item.qty,
    }))
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}

function signed(value: number) {
  const formatted = formatNumber(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return '0';
}

async function submitAudit() {
  saving.value = true;
  error.value = '';
  try {
    await warehouseApi.runInventoryAudit(
      changedRows.value.map((row) => ({
        item_id: row.item.id,
        factual_qty: row.factual,
        note: 'Инвентаризация',
      }))
    );
    await warehouse.loadItems();
    resetRows();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить инвентаризацию';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.audit-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 1.5rem;
  background: #f6f7f9;
  color: #1f2933;
  font-family: system-ui, sans-serif;
}

.page-header,
.table-wrap,
.error {
  max-width: 78rem;
  margin: 0 auto 1rem;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.page-header a {
  color: #1d4f91;
}

h1,
p {
  margin: 0;
}

h1 {
  margin-top: 0.35rem;
  font-size: 1.55rem;
}

.page-header p {
  margin-top: 0.2rem;
  color: #697586;
}

button {
  min-height: 2.35rem;
  border: 1px solid #1d4f91;
  border-radius: 6px;
  background: #1d4f91;
  color: #fff;
  padding: 0 0.9rem;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.7;
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
  min-width: 44rem;
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

input {
  box-sizing: border-box;
  width: 7rem;
  min-height: 2.25rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font: inherit;
}

.changed {
  background: #eef8f4;
}

@media (max-width: 760px) {
  .audit-page {
    padding: 1rem;
  }

  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
