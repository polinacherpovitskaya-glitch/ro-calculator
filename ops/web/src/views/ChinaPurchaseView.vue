<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>{{ isNew ? 'Новая закупка' : form.title || 'Закупка' }}</h1>
        <p v-if="!isNew">{{ statusLabel(form.status) }}</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/china">Китай</RouterLink>
        <RouterLink to="/china/catalog">Каталог</RouterLink>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="panel">
      <div class="grid">
        <label>
          Название
          <input v-model="form.title" :disabled="!isNew && form.status === 'received'" />
        </label>
        <label>
          Поставщик
          <input v-model="form.supplier" :disabled="!isNew && form.status === 'received'" />
        </label>
        <label>
          Статус
          <select v-model="form.status" :disabled="form.status === 'received'">
            <option value="draft">Черновик</option>
            <option value="paid">Оплачено</option>
            <option value="in_transit">В пути</option>
            <option value="arrived">Пришло</option>
          </select>
        </label>
        <label>
          Валюта
          <input v-model="form.paid_currency" :disabled="!isNew && form.status === 'received'" />
        </label>
        <label class="wide">
          Ссылка
          <input v-model="form.order_url" :disabled="!isNew && form.status === 'received'" />
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
              <th>Каталог</th>
              <th>Склад</th>
              <th>Название</th>
              <th>Кол-во</th>
              <th>Цена</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in form.items" :key="index">
              <td>
                <select :disabled="!isNew" @change="applyCatalog(index, $event)">
                  <option value="">—</option>
                  <option v-for="catalogItem in china.catalog" :key="catalogItem.id" :value="catalogItem.id">
                    {{ catalogItem.name }}
                  </option>
                </select>
              </td>
              <td>
                <select v-model="item.warehouse_item_id" :disabled="!isNew">
                  <option :value="null">Не связана</option>
                  <option v-for="warehouseItem in warehouse.items" :key="warehouseItem.id" :value="warehouseItem.id">
                    {{ warehouseItem.name }}
                  </option>
                </select>
              </td>
              <td><input v-model="item.name" :disabled="!isNew" /></td>
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

    <section v-if="!isNew && form.status !== 'received'" class="danger">
      <strong>Принятие создаст приёмку, увеличит складские остатки и запишет receipt в журнал.</strong>
    </section>

    <footer class="actions">
      <button v-if="isNew" type="button" :disabled="saving" @click="save">Создать</button>
      <button v-if="!isNew && form.status !== 'received'" type="button" :disabled="saving" @click="receive">Принять на склад</button>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as chinaApi from '../api/china';
import { useChinaStore } from '../stores/china';
import { useWarehouseStore } from '../stores/warehouse';

interface DraftItem {
  warehouse_item_id: number | null;
  name: string;
  qty: number;
  unit_price: number | null;
}

const route = useRoute();
const router = useRouter();
const china = useChinaStore();
const warehouse = useWarehouseStore();
const saving = ref(false);
const error = ref('');
const isNew = computed(() => route.params.id === 'new');
const form = reactive({
  id: 0,
  title: '',
  supplier: '',
  order_url: '',
  status: 'draft',
  paid_currency: 'CNY',
  note: '',
  items: [] as DraftItem[],
});

onMounted(async () => {
  await Promise.all([warehouse.loadItems(), china.loadCatalog()]);
  if (isNew.value) {
    addItem();
    return;
  }
  const purchase = await chinaApi.getPurchase(Number(route.params.id));
  form.id = Number(purchase.id);
  form.title = purchase.title || '';
  form.supplier = purchase.supplier || '';
  form.order_url = purchase.order_url || '';
  form.status = purchase.status;
  form.paid_currency = purchase.paid_currency || 'CNY';
  form.note = purchase.note || '';
  form.items = (purchase.items || []).map((item) => ({
    warehouse_item_id: item.warehouse_item_id ? Number(item.warehouse_item_id) : null,
    name: item.name,
    qty: Number(item.qty),
    unit_price: item.unit_price === null || item.unit_price === undefined ? null : Number(item.unit_price),
  }));
});

function addItem() {
  form.items.push({ warehouse_item_id: null, name: '', qty: 1, unit_price: null });
}

function removeItem(index: number) {
  form.items.splice(index, 1);
}

function applyCatalog(index: number, event: Event) {
  const id = Number((event.target as HTMLSelectElement).value);
  const catalogItem = china.catalog.find((item) => Number(item.id) === id);
  const target = form.items[index];
  if (!catalogItem || !target) return;
  target.name = catalogItem.name;
  target.unit_price = catalogItem.last_price;
}

function statusLabel(status: string) {
  return ({ draft: 'Черновик', paid: 'Оплачено', in_transit: 'В пути', arrived: 'Пришло', received: 'Принято' }[status] || status);
}

function paidAmount() {
  return form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0);
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const purchase = await chinaApi.createPurchase({
      title: form.title,
      supplier: form.supplier || null,
      order_url: form.order_url || null,
      status: form.status,
      paid_amount: paidAmount(),
      paid_currency: form.paid_currency || null,
      note: form.note || null,
      items: form.items.map((item) => ({
        warehouse_item_id: item.warehouse_item_id,
        name: item.name,
        qty: item.qty,
        unit_price: item.unit_price,
        currency: form.paid_currency || null,
        extras: {},
      })),
    });
    form.id = Number(purchase.id);
    form.status = purchase.status;
    form.items = (purchase.items || []).map((item) => ({
      warehouse_item_id: item.warehouse_item_id ? Number(item.warehouse_item_id) : null,
      name: item.name,
      qty: Number(item.qty),
      unit_price: item.unit_price === null || item.unit_price === undefined ? null : Number(item.unit_price),
    }));
    await router.replace(`/china/${purchase.id}`);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить закупку';
  } finally {
    saving.value = false;
  }
}

async function receive() {
  if (!window.confirm('Принять закупку на склад?')) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await chinaApi.receivePurchase(form.id);
    form.status = result.purchase.status;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось принять закупку';
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
.danger,
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
  min-width: 60rem;
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
.danger {
  border: 1px solid #f4b4ae;
  background: #fff5f3;
  color: #9f1f17;
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
