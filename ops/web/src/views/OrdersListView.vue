<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Заказы</h1><p>{{ filtered.length }} из {{ orders.orders.length }}</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/production/plan">План</RouterLink><RouterLink to="/orders/new">Новый заказ</RouterLink></div>
    </header>

    <section class="toolbar">
      <label>Статусы
        <select v-model="statusDraft" multiple size="4">
          <option v-for="status in statuses" :key="status" :value="status">{{ statusLabel(status) }}</option>
        </select>
      </label>
      <label>С <input v-model="from" type="date" /></label>
      <label>По <input v-model="to" type="date" /></label>
      <label>Менеджер ID <input v-model.number="managerId" type="number" /></label>
      <label>Поиск <input v-model="search" type="search" @keydown.enter="load" /></label>
      <button type="button" :disabled="orders.loading" @click="load">Обновить</button>
    </section>

    <p v-if="orders.error" class="error">{{ orders.error }}</p>

    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key" @click="sortBy(col.key)">{{ col.label }} <span v-if="sortKey === col.key">{{ sortDir === 1 ? '↑' : '↓' }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="orders.loading"><td colspan="8">Загрузка...</td></tr>
          <tr v-for="order in paged" :key="order.id" @click="$router.push(`/orders/${order.id}`)">
            <td>#{{ order.id }}</td>
            <td>{{ order.order_name || '-' }}</td>
            <td>{{ order.client_name || '-' }}</td>
            <td><span class="badge" :class="`s-${order.status}`">{{ statusLabel(order.status) }}</span></td>
            <td :class="{ overdue: isOverdue(order.deadline, order.status) }">{{ order.deadline ? String(order.deadline).slice(0, 10) : '-' }}</td>
            <td>{{ order.manager_id || '-' }}</td>
            <td>{{ money(order.total_revenue) }}</td>
            <td>{{ order.margin_percent === null || order.margin_percent === undefined ? '-' : `${Number(order.margin_percent).toFixed(2)}%` }}</td>
          </tr>
          <tr v-if="!orders.loading && paged.length === 0"><td colspan="8">Пусто</td></tr>
        </tbody>
      </table>
    </section>
    <footer v-if="pages > 1" class="pager">
      <button type="button" :disabled="page === 1" @click="page--">Назад</button>
      <span>{{ page }} / {{ pages }}</span>
      <button type="button" :disabled="page === pages" @click="page++">Вперед</button>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { Order, OrderStatus } from '../api/orders';
import { statusLabel } from '../api/orders';
import { useOrdersStore } from '../stores/orders';

const orders = useOrdersStore();
const statuses: OrderStatus[] = ['draft', 'quoted', 'approved', 'in_production', 'ready', 'shipped', 'closed', 'cancelled'];
const columns = [
  { key: 'id', label: 'ID' },
  { key: 'order_name', label: 'Название' },
  { key: 'client_name', label: 'Клиент' },
  { key: 'status', label: 'Статус' },
  { key: 'deadline', label: 'Дедлайн' },
  { key: 'manager_id', label: 'Менеджер' },
  { key: 'total_revenue', label: 'Выручка' },
  { key: 'margin_percent', label: 'Маржа %' },
] as const;
const statusDraft = ref<OrderStatus[]>([]);
const from = ref('');
const to = ref('');
const managerId = ref<number | null>(null);
const search = ref('');
const sortKey = ref<keyof Order>('updated_at');
const sortDir = ref<-1 | 1>(-1);
const page = ref(1);
const pageSize = 100;
let timer: number | undefined;

onMounted(load);
watch([search, statusDraft, from, to, managerId], () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void load(), 300);
}, { deep: true });

const filtered = computed(() => [...orders.orders].sort((a, b) => compare(a, b)));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));

async function load() {
  page.value = 1;
  await orders.load({ status: statusDraft.value, from: from.value || undefined, to: to.value || undefined, manager_id: managerId.value || undefined, search: search.value || undefined });
}
function sortBy(key: keyof Order) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 1 ? -1 : 1;
  else { sortKey.value = key; sortDir.value = 1; }
}
function compare(a: Order, b: Order) {
  const av = a[sortKey.value] ?? '';
  const bv = b[sortKey.value] ?? '';
  return String(av).localeCompare(String(bv), 'ru', { numeric: true }) * sortDir.value;
}
function isOverdue(value: string | null, status: OrderStatus) {
  return !!value && !['closed', 'cancelled', 'shipped'].includes(status) && new Date(value) < new Date(new Date().toISOString().slice(0, 10));
}
function money(value: number | null | undefined) { return value === null || value === undefined ? '-' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, .table-wrap, .pager { max-width: 88rem; margin: 0 auto 1rem; }
.page-header, .header-actions, .toolbar, .pager { display: flex; align-items: end; justify-content: space-between; gap: .75rem; }
.header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, p { margin: 0; } h1 { font-size: 1.7rem; } p { color: #697586; margin-top: .25rem; }
label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, button, a { box-sizing: border-box; font: inherit; } input, select { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; }
button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .6rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .76rem; text-transform: uppercase; cursor: pointer; } tbody tr { cursor: pointer; }
.badge { display: inline-flex; min-height: 1.6rem; align-items: center; border-radius: 999px; padding: 0 .55rem; background: #eef2ff; color: #3730a3; font-size: .82rem; }
.s-closed { background: #dcfce7; color: #166534; } .s-cancelled { background: #fee2e2; color: #991b1b; } .s-in_production { background: #fef3c7; color: #92400e; } .s-ready { background: #dbeafe; color: #1d4ed8; }
.overdue { color: #b42318; font-weight: 700; } .error { max-width: 88rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 900px) { .table-wrap { overflow-x: auto; } }
</style>
