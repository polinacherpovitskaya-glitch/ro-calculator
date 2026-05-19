<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>Китай</h1>
        <p>{{ china.purchases.length }} закупок</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/shipments">Приёмки</RouterLink>
        <RouterLink to="/china/catalog">Каталог</RouterLink>
        <RouterLink to="/china/new">Новая закупка</RouterLink>
      </div>
    </header>

    <section class="toolbar">
      <label>
        Статус
        <select v-model="china.status" @change="reload">
          <option value="">Все</option>
          <option value="draft">Черновик</option>
          <option value="paid">Оплачено</option>
          <option value="in_transit">В пути</option>
          <option value="arrived">Пришло</option>
          <option value="received">Принято</option>
          <option value="cancelled">Отменено</option>
        </select>
      </label>
      <button type="button" :disabled="china.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="china.error" class="error">{{ china.error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Закупка</th>
            <th>Поставщик</th>
            <th>Статус</th>
            <th class="right">Сумма</th>
            <th>Приёмка</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="china.loading">
            <td colspan="6">Загрузка...</td>
          </tr>
          <tr v-for="purchase in china.purchases" :key="purchase.id">
            <td>
              <RouterLink :to="`/china/${purchase.id}`">{{ purchase.title || `Закупка ${purchase.id}` }}</RouterLink>
            </td>
            <td>{{ purchase.supplier || '—' }}</td>
            <td><span class="badge" :class="purchase.status">{{ statusLabel(purchase.status) }}</span></td>
            <td class="right">{{ formatMoney(purchase.paid_amount, purchase.paid_currency) }}</td>
            <td>
              <RouterLink v-if="purchase.shipment_id" :to="`/shipments/${purchase.shipment_id}`">{{ purchase.shipment_id }}</RouterLink>
              <span v-else>—</span>
            </td>
            <td class="right">
              <RouterLink :to="`/china/${purchase.id}`">Открыть</RouterLink>
            </td>
          </tr>
          <tr v-if="!china.loading && china.purchases.length === 0">
            <td colspan="6">Пусто</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useChinaStore } from '../stores/china';

const china = useChinaStore();

onMounted(() => {
  void china.loadPurchases();
});

async function reload() {
  await china.loadPurchases();
}

function statusLabel(status: string) {
  return (
    {
      draft: 'Черновик',
      paid: 'Оплачено',
      in_transit: 'В пути',
      arrived: 'Пришло',
      received: 'Принято',
      cancelled: 'Отменено',
    }[status] || status
  );
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
h1,
p {
  margin: 0;
}
h1 {
  font-size: 1.7rem;
}
p {
  margin-top: 0.25rem;
  color: #697586;
}
.header-actions,
.toolbar {
  display: flex;
  justify-content: flex-start;
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
  min-width: 56rem;
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
.received,
.arrived {
  background: #d1fae5;
  color: #065f46;
}
.in_transit {
  background: #dbeafe;
  color: #1e3a8a;
}
.paid {
  background: #fff7cc;
  color: #854d0e;
}
@media (max-width: 760px) {
  .page {
    padding: 1rem;
  }
  .page-header,
  .toolbar,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
