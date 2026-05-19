<template>
  <main class="item-page">
    <header class="page-header">
      <div>
        <RouterLink to="/warehouse">← Склад</RouterLink>
        <h1>{{ form.name || 'Позиция склада' }}</h1>
        <p v-if="item">ID {{ item.id }}</p>
      </div>
      <button type="button" :disabled="saving || !item" @click="save">{{ saving ? 'Сохраняем...' : 'Сохранить' }}</button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="item" class="layout">
      <form class="item-form" @submit.prevent="save">
        <label>
          Название
          <input v-model="form.name" required />
        </label>
        <label>
          SKU
          <input v-model="form.sku" />
        </label>
        <label>
          Категория
          <input v-model="form.category" />
        </label>
        <label>
          Количество
          <input v-model.number="form.qty" type="number" min="0" step="0.01" required />
        </label>
        <label>
          Резерв
          <input :value="formatNumber(item.reserved_qty)" readonly />
        </label>
        <label>
          Доступно
          <input :value="formatNumber(item.available_qty)" readonly />
        </label>
        <label>
          Мин.
          <input v-model.number="form.min_qty" type="number" min="0" step="0.01" />
        </label>
        <label>
          Единица
          <input v-model="form.unit" />
        </label>
        <label>
          Цена
          <input v-model.number="form.last_price" type="number" min="0" step="0.01" />
        </label>
        <label>
          Валюта
          <input v-model="form.last_currency" />
        </label>
        <label class="wide">
          Заметки
          <textarea v-model="form.notes" rows="4"></textarea>
        </label>
      </form>

      <aside class="history-panel">
        <h2>Журнал</h2>
        <ol>
          <li v-for="entry in history" :key="entry.id" class="history-entry">
            <div>
              <strong>{{ entry.type }}</strong>
              <span>{{ formatDate(entry.created_at) }}</span>
            </div>
            <p>{{ formatNumber(entry.qty_before) }} → {{ formatNumber(entry.qty_after) }} ({{ signed(entry.qty_change) }})</p>
            <small v-if="entry.note">{{ entry.note }}</small>
          </li>
          <li v-if="history.length === 0">Нет записей</li>
        </ol>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import * as warehouseApi from '../api/warehouse';
import type { WarehouseHistoryEntry, WarehouseItem } from '../api/warehouse';

const route = useRoute();
const item = ref<WarehouseItem | null>(null);
const history = ref<WarehouseHistoryEntry[]>([]);
const error = ref('');
const saving = ref(false);
const form = reactive({
  name: '',
  sku: '',
  category: '',
  qty: 0,
  min_qty: null as number | null,
  unit: '',
  last_price: null as number | null,
  last_currency: '',
  notes: '',
});

onMounted(() => {
  void load();
});

async function load() {
  error.value = '';
  try {
    const id = Number(route.params.id);
    item.value = await warehouseApi.getItem(id);
    history.value = await warehouseApi.listHistory({ itemId: id, limit: 50 });
    Object.assign(form, {
      name: item.value.name,
      sku: item.value.sku || '',
      category: item.value.category || '',
      qty: item.value.qty,
      min_qty: item.value.min_qty,
      unit: item.value.unit || '',
      last_price: item.value.last_price,
      last_currency: item.value.last_currency || '',
      notes: item.value.notes || '',
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить позицию';
  }
}

async function save() {
  if (!item.value) return;
  saving.value = true;
  error.value = '';
  try {
    item.value = await warehouseApi.updateItem(item.value.id, {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      qty: form.qty,
      min_qty: form.min_qty,
      unit: form.unit || null,
      last_price: form.last_price,
      last_currency: form.last_currency || null,
      notes: form.notes || null,
    });
    history.value = await warehouseApi.listHistory({ itemId: item.value.id, limit: 50 });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить позицию';
  } finally {
    saving.value = false;
  }
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
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
</script>

<style scoped>
.item-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 1.5rem;
  background: #f6f7f9;
  color: #1f2933;
  font-family: system-ui, sans-serif;
}

.page-header,
.layout {
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
h2,
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
  max-width: 78rem;
  margin: 0 auto 1rem;
  color: #b42318;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24rem;
  gap: 1rem;
}

.item-form,
.history-panel {
  border: 1px solid #dde2e8;
  background: #fff;
  padding: 1rem;
}

.item-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

label {
  display: grid;
  gap: 0.35rem;
  color: #52606d;
  font-size: 0.86rem;
}

.wide {
  grid-column: 1 / -1;
}

input,
textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 2.35rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font: inherit;
}

input[readonly] {
  background: #f6f7f9;
}

.history-panel h2 {
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

ol {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.history-entry {
  border-bottom: 1px solid #edf0f3;
  padding-bottom: 0.75rem;
}

.history-entry div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: #52606d;
  font-size: 0.85rem;
}

.history-entry p {
  margin-top: 0.25rem;
}

.history-entry small {
  display: block;
  margin-top: 0.25rem;
  color: #697586;
}

@media (max-width: 900px) {
  .page-header,
  .layout,
  .item-form {
    display: flex;
    flex-direction: column;
  }
}
</style>
