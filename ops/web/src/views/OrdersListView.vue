<template>
  <main class="orders-page">
    <header class="orders-header">
      <h1>Заказы</h1>
      <nav class="quick-tabs" aria-label="Быстрые фильтры">
        <button
          v-for="tab in quickTabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeQuickTab === tab.key }"
          @click="applyQuickTab(tab.key)"
        >
          {{ tab.label }}
        </button>
        <RouterLink class="new-order" to="/orders/new">+ Новый заказ</RouterLink>
      </nav>
    </header>

    <section class="search-card">
      <label class="search-field">Поиск
        <input v-model="search" type="search" placeholder="Название / клиент" @keydown.enter="load" />
      </label>
      <div class="filter-note">{{ filtered.length }} из {{ orders.orders.length }}</div>
    </section>

    <section class="toolbar" :class="{ expanded: filtersOpen }">
      <button type="button" class="filter-toggle" @click="filtersOpen = !filtersOpen">{{ filtersOpen ? 'Скрыть фильтры' : 'Фильтры' }}</button>
      <label>Статусы
        <select v-model="statusDraft" multiple size="4">
          <option v-for="status in statuses" :key="status" :value="status">{{ statusLabel(status) }}</option>
        </select>
      </label>
      <label>С <input v-model="from" type="date" /></label>
      <label>По <input v-model="to" type="date" /></label>
      <label>Менеджер ID <input v-model.number="managerId" type="number" /></label>
      <button type="button" :disabled="orders.loading" @click="load">Обновить</button>
    </section>

    <p v-if="orders.error" class="error">{{ orders.error }}</p>

    <section v-if="orders.loading" class="order-section">
      <div class="section-title"><span class="chevron">⌄</span><span class="dot blue"></span><strong>Загрузка</strong></div>
      <div class="empty">Загрузка заказов...</div>
    </section>

    <section v-for="group in visibleGroups" :key="group.key" class="order-section">
      <header class="section-title">
        <span class="chevron">⌄</span>
        <span class="dot" :class="group.color"></span>
        <strong>{{ group.label }}</strong>
        <span>{{ group.orders.length }}</span>
        <small>{{ money(group.totalRevenue) }}</small>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="order-name" @click="sortBy('order_name')">Заказ <span v-if="sortKey === 'order_name'">{{ sortDir === 1 ? '↑' : '↓' }}</span></th>
              <th @click="sortBy('deadline')">Дедлайн <span v-if="sortKey === 'deadline'">{{ sortDir === 1 ? '↑' : '↓' }}</span></th>
              <th @click="sortBy('total_revenue')">To-do RO <span v-if="sortKey === 'total_revenue'">{{ sortDir === 1 ? '↑' : '↓' }}</span></th>
              <th @click="sortBy('manager_id')">Кто ведет <span v-if="sortKey === 'manager_id'">{{ sortDir === 1 ? '↑' : '↓' }}</span></th>
              <th @click="sortBy('status')">Статус <span v-if="sortKey === 'status'">{{ sortDir === 1 ? '↑' : '↓' }}</span></th>
              <th @click="sortBy('margin_percent')">Маржа <span v-if="sortKey === 'margin_percent'">{{ sortDir === 1 ? '↑' : '↓' }}</span></th>
              <th class="actions"> </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in group.orders" :key="order.id" @click="$router.push(`/orders/${order.id}`)">
              <td class="order-cell">
                <strong>{{ order.order_name || `Заказ #${order.id}` }}</strong>
                <span>{{ order.client_name || '-' }}</span>
              </td>
              <td class="deadline" :class="{ overdue: isOverdue(order.deadline, order.status) }">{{ formatDeadline(order.deadline) }}</td>
              <td><span class="todo-pill">Empty 0</span></td>
              <td class="manager-cell">
                <strong>{{ managerLabel(order) }}</strong>
                <span>Старт: {{ formatDate(order.created_at) }}</span>
              </td>
              <td><span class="badge" :class="`s-${order.status}`">{{ statusLabel(order.status) }}</span></td>
              <td class="money-cell">
                <strong>{{ money(order.total_revenue) }}</strong>
                <span>{{ margin(order) }}</span>
              </td>
              <td class="row-actions">
                <button type="button" aria-label="Открыть заказ" @click.stop="$router.push(`/orders/${order.id}`)">↗</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section v-if="!orders.loading && visibleGroups.length === 0" class="order-section">
      <div class="empty">Пусто</div>
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
const quickTabs = [
  { key: 'active', label: 'Active', statuses: ['draft', 'quoted', 'approved', 'in_production', 'ready'] as OrderStatus[] },
  { key: 'production', label: 'Production', statuses: ['in_production', 'ready'] as OrderStatus[] },
  { key: 'closed', label: 'Закрытые', statuses: ['shipped', 'closed'] as OrderStatus[] },
  { key: 'cancelled', label: 'Корзина', statuses: ['cancelled'] as OrderStatus[] },
] as const;
type QuickTab = typeof quickTabs[number]['key'];
const statusDraft = ref<OrderStatus[]>([]);
const from = ref('');
const to = ref('');
const managerId = ref<number | null>(null);
const search = ref('');
const sortKey = ref<keyof Order>('updated_at');
const sortDir = ref<-1 | 1>(-1);
const page = ref(1);
const pageSize = 100;
const activeQuickTab = ref<QuickTab>('active');
const filtersOpen = ref(false);
let timer: number | undefined;

onMounted(() => {
  applyQuickTab('active');
});
watch([search, statusDraft, from, to, managerId], () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void load(), 300);
}, { deep: true });

const filtered = computed(() => [...orders.orders].sort((a, b) => compare(a, b)));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const groups = computed(() => [
  { key: 'samples', label: 'Образцы', color: 'blue', statuses: ['quoted', 'approved'] as OrderStatus[] },
  { key: 'production', label: 'Production', color: 'orange', statuses: ['in_production', 'ready'] as OrderStatus[] },
  { key: 'drafts', label: 'Черновики', color: 'violet', statuses: ['draft'] as OrderStatus[] },
  { key: 'closed', label: 'Закрытые', color: 'green', statuses: ['shipped', 'closed'] as OrderStatus[] },
  { key: 'cancelled', label: 'Корзина', color: 'red', statuses: ['cancelled'] as OrderStatus[] },
].map((group) => {
  const groupOrders = paged.value.filter((order) => group.statuses.includes(order.status));
  return {
    ...group,
    orders: groupOrders,
    totalRevenue: groupOrders.reduce((sum, order) => sum + Number(order.total_revenue || 0), 0),
  };
}));
const visibleGroups = computed(() => groups.value.filter((group) => group.orders.length > 0));

async function load() {
  page.value = 1;
  await orders.load({ status: statusDraft.value, from: from.value || undefined, to: to.value || undefined, manager_id: managerId.value || undefined, search: search.value || undefined });
}
function applyQuickTab(key: QuickTab) {
  activeQuickTab.value = key;
  statusDraft.value = [...quickTabs.find((tab) => tab.key === key)!.statuses];
  void load();
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
function margin(order: Order) {
  return order.margin_percent === null || order.margin_percent === undefined ? '-' : `${Number(order.margin_percent).toFixed(2)}%`;
}
function formatDate(value: string | null | undefined) {
  return value ? String(value).slice(0, 10).split('-').reverse().join('.') : '-';
}
function formatDeadline(value: string | null) {
  return value ? String(value).slice(0, 10) : '-';
}
function managerLabel(order: Order) {
  return order.manager_id ? `#${order.manager_id}` : '-';
}
</script>

<style scoped>
.orders-page {
  min-height: 100vh;
  padding: 25px 24px 36px;
  background: #f2f2f2;
  color: #202020;
}

.orders-header,
.search-card,
.toolbar,
.order-section,
.pager,
.error {
  max-width: 1160px;
  margin-left: auto;
  margin-right: auto;
}

.orders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}

h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: 0;
}

.quick-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.quick-tabs button,
.new-order,
.toolbar button,
.pager button,
.row-actions button {
  min-height: 31px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9d9d9;
  border-radius: 14px;
  background: #fff;
  color: #777;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05);
}

.quick-tabs button.active,
.new-order {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.search-card {
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) minmax(18rem, .8fr);
  align-items: end;
  gap: 16px;
  margin-bottom: 16px;
  padding: 18px 20px 12px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .03);
}

label {
  display: grid;
  gap: 6px;
  color: #666;
  font-size: 12px;
  font-weight: 700;
}

input,
select {
  min-height: 35px;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  background: #fff;
  padding: 7px 12px;
  color: #222;
}

.filter-note {
  min-height: 44px;
  display: flex;
  align-items: center;
  border: 1px dashed #ddd;
  border-radius: 7px;
  background: #f7f7f7;
  padding: 0 14px;
  color: #999;
  font-size: 12px;
}

.toolbar {
  display: flex;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.toolbar:not(.expanded) label,
.toolbar:not(.expanded) > button:not(.filter-toggle) {
  display: none;
}

.filter-toggle {
  display: inline-flex;
  margin-bottom: 16px;
}

.order-section {
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #dcdcdc;
  border-radius: 8px;
  overflow: hidden;
}

.section-title {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid #e6e6e6;
  color: #222;
}

.section-title span {
  color: #888;
  font-size: 12px;
  font-weight: 800;
}

.section-title small {
  margin-left: auto;
  color: #999;
  font-size: 12px;
}

.chevron {
  color: #999;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  display: inline-block;
}

.dot.blue { background: #3b82f6; }
.dot.orange { background: #f59e0b; }
.dot.violet { background: #6366f1; }
.dot.green { background: #22c55e; }
.dot.red { background: #ef4444; }

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

th,
td {
  padding: 12px 12px;
  border-bottom: 1px solid #ededed;
  text-align: left;
  vertical-align: middle;
}

th {
  color: #666;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .03em;
  text-transform: uppercase;
  cursor: pointer;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: #fafafa;
}

.order-name {
  width: 28%;
}

.order-cell,
.manager-cell,
.money-cell {
  display: grid;
  gap: 5px;
}

.order-cell strong {
  color: #2563eb;
  font-size: 14px;
  line-height: 1.35;
}

.order-cell span,
.manager-cell span,
.money-cell span {
  color: #858585;
  font-size: 12px;
}

.manager-cell strong,
.money-cell strong {
  color: #222;
  font-size: 13px;
}

.deadline {
  color: #222;
  font-weight: 800;
}

.overdue {
  color: #dc2626;
}

.todo-pill,
.badge {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.todo-pill {
  background: #e5e7eb;
  color: #6b7280;
}

.badge {
  background: #eef2ff;
  color: #1d4ed8;
}

.s-closed,
.s-shipped {
  background: #dcfce7;
  color: #166534;
}

.s-cancelled {
  background: #fee2e2;
  color: #991b1b;
}

.s-in_production {
  background: #fff0c2;
  color: #b45309;
}

.s-ready {
  background: #dbeafe;
  color: #1d4ed8;
}

.row-actions {
  width: 52px;
  text-align: right;
}

.row-actions button {
  width: 32px;
  min-height: 32px;
  border-radius: 8px;
  padding: 0;
  color: #666;
}

.empty {
  padding: 20px;
  color: #777;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.error {
  margin-bottom: 16px;
  color: #b42318;
}

@media (max-width: 900px) {
  .orders-page {
    padding: 18px 12px 28px;
  }

  .orders-header,
  .search-card {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .orders-header {
    display: grid;
  }
}
</style>
