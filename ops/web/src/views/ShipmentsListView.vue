<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>Приёмки</h1>
        <p>{{ shipments.shipments.length }} записей</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/warehouse">Склад</RouterLink>
        <RouterLink to="/china">Китай</RouterLink>
        <RouterLink to="/shipments/new">Новая приёмка</RouterLink>
      </div>
    </header>

    <section class="toolbar">
      <label>
        Статус
        <select v-model="shipments.status" @change="reload">
          <option value="">Все</option>
          <option value="planned">Запланирована</option>
          <option value="in_transit">В пути</option>
          <option value="received">Принята</option>
          <option value="cancelled">Отменена</option>
        </select>
      </label>
      <button type="button" :disabled="shipments.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="shipments.error" class="error">{{ shipments.error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Название</th>
            <th>Источник</th>
            <th>Статус</th>
            <th>Ожидание</th>
            <th>Получено</th>
            <th class="right">Сумма</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="shipments.loading">
            <td colspan="7">Загрузка...</td>
          </tr>
          <tr v-for="shipment in shipments.shipments" :key="shipment.id">
            <td>
              <RouterLink :to="`/shipments/${shipment.id}`">{{ shipment.name }}</RouterLink>
            </td>
            <td>{{ shipment.source || '—' }}</td>
            <td><span class="badge" :class="shipment.status">{{ statusLabel(shipment.status) }}</span></td>
            <td>{{ formatDate(shipment.expected_date) }}</td>
            <td>{{ formatDateTime(shipment.received_at) }}</td>
            <td class="right">{{ formatMoney(shipment.total_cost, shipment.currency) }}</td>
            <td class="right">
              <RouterLink :to="`/shipments/${shipment.id}`">Открыть</RouterLink>
            </td>
          </tr>
          <tr v-if="!shipments.loading && shipments.shipments.length === 0">
            <td colspan="7">Пусто</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useShipmentsStore } from '../stores/shipments';

const shipments = useShipmentsStore();

onMounted(() => {
  void shipments.loadShipments();
});

async function reload() {
  await shipments.loadShipments();
}

function statusLabel(status: string) {
  return (
    {
      planned: 'Запланирована',
      in_transit: 'В пути',
      received: 'Принята',
      cancelled: 'Отменена',
    }[status] || status
  );
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return '—';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ${currency || ''}`.trim();
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
.toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  max-width: 78rem;
  margin: 0 auto 1rem;
}
h1 {
  margin: 0;
  font-size: 1.7rem;
}
p {
  margin: 0.25rem 0 0;
  color: #697586;
}
.header-actions,
.toolbar {
  justify-content: flex-start;
}
.header-actions {
  display: flex;
  gap: 0.75rem;
}
label {
  display: grid;
  gap: 0.3rem;
  color: #52606d;
  font-size: 0.85rem;
}
select,
button,
a {
  font: inherit;
}
select {
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
  display: inline-flex;
  align-items: center;
}
.header-actions a:last-child {
  border-color: #1d4f91;
  background: #1d4f91;
  color: #fff;
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
  table-layout: fixed;
  border-collapse: collapse;
}

th:nth-child(1),
td:nth-child(1) {
  width: 34%;
}

th:nth-child(2),
td:nth-child(2),
th:nth-child(3),
td:nth-child(3),
th:nth-child(4),
td:nth-child(4),
th:nth-child(5),
td:nth-child(5),
th:nth-child(6),
td:nth-child(6) {
  width: 7.5rem;
}

th:nth-child(7),
td:nth-child(7) {
  width: 5.5rem;
}
th,
td {
  border-bottom: 1px solid #edf0f3;
  padding: 0.55rem 0.65rem;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
th {
  color: #52606d;
  font-size: 0.78rem;
  text-transform: uppercase;
}
.right {
  text-align: right;
}
.badge {
  display: inline-block;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  background: #eef2f7;
  font-size: 0.78rem;
  font-weight: 700;
}
.received {
  background: #d1fae5;
  color: #065f46;
}
.in_transit {
  background: #dbeafe;
  color: #1e3a8a;
}
.cancelled {
  background: #fee2e2;
  color: #991b1b;
}
@media (max-width: 760px) {
  .page {
    padding: 1rem;
  }
  .page-header,
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
