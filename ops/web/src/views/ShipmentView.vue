<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>{{ isNew ? 'Новая приёмка' : form.name || 'Приёмка' }}</h1>
        <p v-if="!isNew">{{ statusLabel(form.status) }}</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/shipments">Приёмки</RouterLink>
        <RouterLink to="/warehouse/history">Журнал</RouterLink>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="panel">
      <div class="grid">
        <label>
          Название
          <input v-model="form.name" :disabled="!isNew && form.status === 'received'" />
        </label>
        <label>
          Источник
          <select v-model="form.source" :disabled="!isNew && form.status === 'received'">
            <option value="china">Китай</option>
            <option value="russia">Россия</option>
            <option value="other">Другое</option>
          </select>
        </label>
        <label>
          Ожидаемая дата
          <input v-model="form.expected_date" type="date" :disabled="!isNew && form.status === 'received'" />
        </label>
        <label>
          Валюта
          <input v-model="form.currency" :disabled="!isNew && form.status === 'received'" />
        </label>
        <label class="wide">
          Заметка
          <textarea v-model="form.note" rows="2" :disabled="!isNew && form.status === 'received'" />
        </label>
      </div>
    </section>

    <section class="panel">
      <header class="section-header">
        <h2>Позиции</h2>
        <button v-if="isNew" type="button" @click="addItem">Добавить</button>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Склад</th>
              <th>Название</th>
              <th>SKU новой</th>
              <th>Кол-во</th>
              <th>Цена</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in form.items" :key="index">
              <td>
                <select v-model="item.warehouse_item_id" :disabled="!isNew">
                  <option :value="null">Новая позиция</option>
                  <option v-for="warehouseItem in warehouse.items" :key="warehouseItem.id" :value="warehouseItem.id">
                    {{ warehouseItem.name }}
                  </option>
                </select>
              </td>
              <td><input v-model="item.name" :disabled="!isNew" /></td>
              <td><input v-model="item.sku" :disabled="!isNew || !!item.warehouse_item_id" /></td>
              <td><input v-model.number="item.qty" class="number" type="number" min="0" step="0.01" :disabled="!isNew" /></td>
              <td><input v-model.number="item.unit_price" class="number" type="number" min="0" step="0.01" :disabled="!isNew" /></td>
              <td class="right"><button v-if="isNew" type="button" @click="removeItem(index)">Удалить</button></td>
            </tr>
            <tr v-if="form.items.length === 0">
              <td colspan="6">Нет позиций</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="form.status !== 'received'" class="stock-notice">
      <strong>Принятие увеличит складские остатки и запишет receipt в журнал.</strong>
    </section>

    <footer class="actions">
      <button v-if="isNew" type="button" :disabled="saving" @click="save">Создать</button>
      <button v-if="!isNew && form.status !== 'received'" type="button" :disabled="saving" @click="receive">Принять</button>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as shipmentsApi from '../api/shipments';
import { useWarehouseStore } from '../stores/warehouse';

interface DraftItem {
  warehouse_item_id: number | null;
  name: string;
  sku: string;
  qty: number;
  unit_price: number | null;
}

const route = useRoute();
const router = useRouter();
const warehouse = useWarehouseStore();
const saving = ref(false);
const error = ref('');
const isNew = computed(() => route.params.id === 'new');
const form = reactive({
  id: 0,
  name: '',
  source: 'china',
  status: 'planned',
  expected_date: '',
  currency: 'RUB',
  note: '',
  items: [] as DraftItem[],
});

onMounted(async () => {
  await warehouse.loadItems();
  if (isNew.value) {
    addItem();
    return;
  }
  const shipment = await shipmentsApi.getShipment(Number(route.params.id));
  form.id = Number(shipment.id);
  form.name = shipment.name;
  form.source = shipment.source || 'china';
  form.status = shipment.status;
  form.expected_date = shipment.expected_date || '';
  form.currency = shipment.currency || 'RUB';
  form.note = shipment.note || '';
  form.items = (shipment.items || []).map((item) => ({
    warehouse_item_id: item.warehouse_item_id ? Number(item.warehouse_item_id) : null,
    name: item.name,
    sku: String(item.extras?.sku || ''),
    qty: Number(item.received_qty ?? item.qty),
    unit_price: item.unit_price === null || item.unit_price === undefined ? null : Number(item.unit_price),
  }));
});

function addItem() {
  form.items.push({ warehouse_item_id: null, name: '', sku: '', qty: 1, unit_price: null });
}

function removeItem(index: number) {
  form.items.splice(index, 1);
}

function statusLabel(status: string) {
  return ({ planned: 'Запланирована', in_transit: 'В пути', received: 'Принята', cancelled: 'Отменена' }[status] || status);
}

function payloadItems() {
  return form.items.map((item) => ({
    warehouse_item_id: item.warehouse_item_id,
    name: item.name,
    qty: item.qty,
    unit_price: item.unit_price,
    currency: form.currency || null,
    extras: item.warehouse_item_id ? {} : { create_new: true, sku: item.sku },
  }));
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const created = await shipmentsApi.createShipment({
      name: form.name,
      source: form.source,
      expected_date: form.expected_date || null,
      currency: form.currency || null,
      note: form.note || null,
      items: payloadItems(),
    });
    form.id = Number(created.id);
    form.status = created.status;
    form.items = (created.items || []).map((item) => ({
      warehouse_item_id: item.warehouse_item_id ? Number(item.warehouse_item_id) : null,
      name: item.name,
      sku: String(item.extras?.sku || ''),
      qty: Number(item.received_qty ?? item.qty),
      unit_price: item.unit_price === null || item.unit_price === undefined ? null : Number(item.unit_price),
    }));
    await router.replace(`/shipments/${created.id}`);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить приёмку';
  } finally {
    saving.value = false;
  }
}

async function receive() {
  if (!window.confirm('Принять приёмку и увеличить складские остатки?')) return;
  saving.value = true;
  error.value = '';
  try {
    const shipment = await shipmentsApi.receiveShipment(form.id);
    form.status = shipment.status;
    form.items = (shipment.items || []).map((item) => ({
      warehouse_item_id: item.warehouse_item_id ? Number(item.warehouse_item_id) : null,
      name: item.name,
      sku: String(item.extras?.sku || ''),
      qty: Number(item.received_qty ?? item.qty),
      unit_price: item.unit_price === null || item.unit_price === undefined ? null : Number(item.unit_price),
    }));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось принять приёмку';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 1.5rem;
  background: #f6f7f9;
  color: #1f2933;
  font-family: system-ui, sans-serif;
}
.page-header,
.panel,
.stock-notice,
.actions {
  max-width: 78rem;
  margin: 0 auto 1rem;
}
.page-header,
.section-header,
.actions,
.header-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.actions {
  justify-content: flex-end;
}
h1,
h2,
p {
  margin: 0;
}
h1 {
  font-size: 1.7rem;
}
h2 {
  font-size: 1.1rem;
}
p {
  margin-top: 0.25rem;
  color: #697586;
}
.panel {
  border: 1px solid #dde2e8;
  background: #fff;
  padding: 1rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}
.wide {
  grid-column: span 4;
}
label {
  display: grid;
  gap: 0.3rem;
  color: #52606d;
  font-size: 0.85rem;
}
input,
select,
textarea,
button,
a {
  font: inherit;
}
input,
select,
textarea {
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
.actions button,
.section-header button {
  border-color: #1d4f91;
  background: #1d4f91;
  color: #fff;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 56rem;
  border-collapse: collapse;
}
th,
td {
  border-bottom: 1px solid #edf0f3;
  padding: 0.55rem 0.65rem;
  text-align: left;
}
th {
  color: #52606d;
  font-size: 0.78rem;
  text-transform: uppercase;
}
td input,
td select {
  width: 100%;
}
.number {
  width: 6rem;
}
.right {
  text-align: right;
}
.stock-notice {
  border: 1px solid #d9c48d;
  background: #fff8e5;
  color: #6d4f00;
  padding: 0.8rem 1rem;
}
.error {
  max-width: 78rem;
  margin: 0 auto 1rem;
  color: #b42318;
}
@media (max-width: 760px) {
  .page {
    padding: 1rem;
  }
  .page-header,
  .actions {
    align-items: stretch;
    flex-direction: column;
  }
  .grid {
    grid-template-columns: 1fr;
  }
  .wide {
    grid-column: span 1;
  }
}
</style>
