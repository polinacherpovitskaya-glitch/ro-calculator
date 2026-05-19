<template>
  <main class="warehouse-page">
    <header class="page-header">
      <div>
        <h1>Склад</h1>
        <p>{{ warehouse.items.length }} позиций</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/">Главная</RouterLink>
        <RouterLink to="/warehouse/inventory">Инвентаризация</RouterLink>
        <RouterLink to="/warehouse/history">Журнал</RouterLink>
        <button type="button" @click="showCreate = true">Новая позиция</button>
      </div>
    </header>

    <section class="toolbar" aria-label="Фильтры склада">
      <label>
        Поиск
        <input v-model="warehouse.search" type="search" placeholder="Название или SKU" @keydown.enter="reload" />
      </label>
      <label>
        Категория
        <select v-model="warehouse.category" @change="reload">
          <option value="">Все</option>
          <option v-for="category in warehouse.categories" :key="category" :value="category">{{ category }}</option>
        </select>
      </label>
      <button type="button" :disabled="warehouse.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="warehouse.error" class="error">{{ warehouse.error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Название</th>
            <th>Категория</th>
            <th>Количество</th>
            <th>Резерв</th>
            <th>Доступно</th>
            <th>Мин.</th>
            <th>Цена</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="warehouse.loading">
            <td colspan="9">Загрузка...</td>
          </tr>
          <tr v-for="item in warehouse.items" :key="item.id" :class="{ low: isLow(item) }">
            <td>{{ item.sku || '—' }}</td>
            <td>
              <RouterLink :to="`/warehouse/${item.id}`">{{ item.name }}</RouterLink>
            </td>
            <td>
              <input :value="item.category || ''" @change="updateText(item.id, 'category', $event)" />
            </td>
            <td>
              <input class="number-input" type="number" step="0.01" :value="item.qty" @change="updateNumber(item.id, 'qty', $event)" />
            </td>
            <td>{{ formatNumber(item.reserved_qty) }}</td>
            <td>{{ formatNumber(item.available_qty) }}</td>
            <td>
              <input class="number-input" type="number" step="0.01" :value="item.min_qty ?? ''" @change="updateNumber(item.id, 'min_qty', $event)" />
            </td>
            <td>{{ formatPrice(item) }}</td>
            <td class="row-actions">
              <button type="button" @click="deleteItem(item.id)">Удалить</button>
            </td>
          </tr>
          <tr v-if="!warehouse.loading && warehouse.items.length === 0">
            <td colspan="9">Пусто</td>
          </tr>
        </tbody>
      </table>
    </div>

    <dialog :open="showCreate" @close="showCreate = false">
      <form method="dialog" class="create-form" @submit.prevent="createItem">
        <header>
          <h2>Новая позиция</h2>
          <button type="button" aria-label="Закрыть" @click="showCreate = false">×</button>
        </header>
        <label>
          Название
          <input v-model="draft.name" required />
        </label>
        <label>
          SKU
          <input v-model="draft.sku" />
        </label>
        <label>
          Категория
          <input v-model="draft.category" />
        </label>
        <label>
          Количество
          <input v-model.number="draft.qty" type="number" min="0" step="0.01" required />
        </label>
        <label>
          Мин.
          <input v-model.number="draft.min_qty" type="number" min="0" step="0.01" />
        </label>
        <menu>
          <button type="button" @click="showCreate = false">Отмена</button>
          <button type="submit" :disabled="saving">{{ saving ? 'Сохраняем...' : 'Создать' }}</button>
        </menu>
      </form>
    </dialog>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import type { WarehouseItem, WarehouseItemPatch } from '../api/warehouse';
import { useWarehouseStore } from '../stores/warehouse';

const warehouse = useWarehouseStore();
const showCreate = ref(false);
const saving = ref(false);
const draft = reactive({
  name: '',
  sku: '',
  category: '',
  qty: 0,
  min_qty: null as number | null,
});

let searchTimer: number | undefined;

onMounted(() => {
  void warehouse.loadItems();
});

watch(
  () => warehouse.search,
  () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void reload(), 250);
  }
);

async function reload() {
  await warehouse.loadItems();
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}

function formatPrice(item: WarehouseItem) {
  if (item.last_price === null) return '—';
  return `${formatNumber(item.last_price)} ${item.last_currency || ''}`.trim();
}

function isLow(item: WarehouseItem) {
  return item.min_qty !== null && item.available_qty <= item.min_qty;
}

async function updateNumber(id: number, field: 'qty' | 'min_qty', event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value === '' ? null : Number(input.value);
  await warehouse.updateItem(id, { [field]: value } as WarehouseItemPatch);
}

async function updateText(id: number, field: 'category', event: Event) {
  const input = event.target as HTMLInputElement;
  await warehouse.updateItem(id, { [field]: input.value || null });
}

async function deleteItem(id: number) {
  if (!window.confirm('Удалить позицию?')) return;
  await warehouse.deleteItem(id);
}

async function createItem() {
  saving.value = true;
  try {
    await warehouse.createItem({
      name: draft.name,
      sku: draft.sku || null,
      category: draft.category || null,
      qty: draft.qty,
      min_qty: draft.min_qty,
    });
    draft.name = '';
    draft.sku = '';
    draft.category = '';
    draft.qty = 0;
    draft.min_qty = null;
    showCreate.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.warehouse-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 1.5rem;
  background: #f6f7f9;
  color: #1f2933;
  font-family: system-ui, sans-serif;
}

.page-header,
.toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  max-width: 78rem;
  margin: 0 auto 1rem;
}

.page-header h1 {
  margin: 0;
  font-size: 1.7rem;
}

.page-header p {
  margin: 0.25rem 0 0;
  color: #697586;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toolbar {
  align-items: end;
  justify-content: flex-start;
  padding: 0.85rem 0;
}

label {
  display: grid;
  gap: 0.3rem;
  color: #52606d;
  font-size: 0.85rem;
}

input,
select,
button,
a {
  font: inherit;
}

input,
select {
  box-sizing: border-box;
  min-height: 2.25rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  background: #fff;
  padding: 0.45rem 0.55rem;
}

button,
.header-actions a {
  min-height: 2.25rem;
  border: 1px solid #aeb7c2;
  border-radius: 6px;
  background: #fff;
  color: #1f2933;
  padding: 0 0.75rem;
  cursor: pointer;
  text-decoration: none;
}

.header-actions button,
menu button[type='submit'] {
  border-color: #1d4f91;
  background: #1d4f91;
  color: #fff;
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

.table-wrap {
  max-width: 78rem;
  margin: 0 auto;
  overflow-x: auto;
  border: 1px solid #dde2e8;
  background: #fff;
}

table {
  width: 100%;
  min-width: 62rem;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid #edf0f3;
  padding: 0.55rem 0.65rem;
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}

th {
  color: #52606d;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}

td a {
  color: #1d4f91;
}

td input {
  width: 10rem;
}

.number-input {
  width: 6rem;
}

.row-actions {
  text-align: right;
}

.low {
  background: #fff7ed;
}

dialog {
  width: min(32rem, calc(100vw - 2rem));
  border: 1px solid #c7cbd1;
  border-radius: 8px;
  padding: 0;
}

.create-form {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.create-form header,
menu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.create-form h2 {
  margin: 0;
  font-size: 1.15rem;
}

@media (max-width: 760px) {
  .warehouse-page {
    padding: 1rem;
  }

  .page-header,
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    justify-content: space-between;
  }
}
</style>
