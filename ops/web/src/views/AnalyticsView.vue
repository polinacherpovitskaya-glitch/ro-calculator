<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>Аналитика</h1>
        <p>План-факт, выручка, загрузка и разрезы по заказам</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/">Главная</RouterLink>
        <button type="button" :disabled="loading" @click="load">Обновить</button>
      </div>
    </header>

    <section class="toolbar">
      <label>С <input v-model="from" type="date" /></label>
      <label>По <input v-model="to" type="date" /></label>
      <label>Год с <input v-model.number="yearFrom" type="number" min="2000" max="2100" /></label>
      <label>Год по <input v-model.number="yearTo" type="number" min="2000" max="2100" /></label>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="muted">Загрузка...</p>

    <SummaryCards :data="summaryData" />

    <section class="tabs" aria-label="Отчёты">
      <button v-for="report in reports" :key="report.key" type="button" :class="{ active: active === report.key }" @click="active = report.key">
        {{ report.label }}
      </button>
    </section>

    <BarTableReport
      v-if="active === 'revenue'"
      title="Выручка и маржа по месяцам"
      :rows="revenueRows"
      label-key="month_label"
      value-key="revenue"
      value-kind="money"
    />
    <BarTableReport
      v-if="active === 'clients'"
      title="Топ-клиенты"
      :rows="topClientsRows"
      label-key="client_name"
      value-key="revenue"
      value-kind="money"
    />
    <AnalyticsTable
      v-if="active === 'statuses'"
      title="Динамика заказов по статусам"
      :rows="statusRows"
      :columns="[
        { key: 'month_label', label: 'Месяц' },
        { key: 'status', label: 'Статус' },
        { key: 'orders_count', label: 'Заказы' },
        { key: 'revenue', label: 'Выручка', kind: 'money' },
      ]"
    />
    <BarTableReport
      v-if="active === 'load'"
      title="Производственная загрузка"
      :rows="loadRows"
      label-key="label"
      value-key="hours"
      value-kind="hours"
    />
    <AnalyticsTable
      v-if="active === 'types'"
      title="Производственная загрузка по типам товара"
      :rows="productTypeRows"
      :columns="[
        { key: 'type', label: 'Тип' },
        { key: 'lines_count', label: 'Строки' },
        { key: 'qty', label: 'Кол-во' },
        { key: 'revenue', label: 'Выручка', kind: 'money' },
        { key: 'hours', label: 'Часы', kind: 'hours' },
      ]"
    />
    <AnalyticsTable
      v-if="active === 'factual'"
      title="Фактическая маржа по заказам"
      :rows="factualRows"
      :columns="[
        { key: 'report_date', label: 'Дата', kind: 'date' },
        { key: 'order_name', label: 'Заказ' },
        { key: 'client_name', label: 'Клиент' },
        { key: 'actual_revenue', label: 'Факт выручка', kind: 'money' },
        { key: 'actual_cost', label: 'Факт расходы', kind: 'money' },
        { key: 'actual_margin', label: 'Факт прибыль', kind: 'money' },
        { key: 'actual_margin_percent', label: 'Маржа', kind: 'percent' },
      ]"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { analyticsApi } from '../api/analytics';
import type {
  FactualMarginRow,
  ProductTypeRow,
  ProductionLoadRow,
  RevenueByMonthRow,
  StatusDynamicsRow,
  SummaryReport,
  TopClientRow,
} from '../api/analytics';
import AnalyticsTable from '../components/analytics/AnalyticsTable.vue';
import BarTableReport from '../components/analytics/BarTableReport.vue';
import SummaryCards from '../components/analytics/SummaryCards.vue';

const now = new Date();
const yearFrom = ref(now.getFullYear());
const yearTo = ref(now.getFullYear());
const from = ref(`${now.getFullYear()}-01-01`);
const to = ref(`${now.getFullYear()}-12-31`);
const loading = ref(false);
const error = ref('');
const active = ref('revenue');
const summaryData = ref<SummaryReport | null>(null);
const revenueData = ref<RevenueByMonthRow[]>([]);
const topClientsData = ref<TopClientRow[]>([]);
const statusData = ref<StatusDynamicsRow[]>([]);
const loadData = ref<ProductionLoadRow[]>([]);
const productTypeData = ref<ProductTypeRow[]>([]);
const factualData = ref<FactualMarginRow[]>([]);
let timer: number | undefined;

const reports = [
  { key: 'revenue', label: 'Выручка' },
  { key: 'clients', label: 'Клиенты' },
  { key: 'statuses', label: 'Статусы' },
  { key: 'load', label: 'Загрузка' },
  { key: 'types', label: 'Типы' },
  { key: 'factual', label: 'Факт' },
];

onMounted(load);
watch([from, to, yearFrom, yearTo], () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void load(), 350);
});

const revenueRows = computed(() => revenueData.value.map((row) => ({ ...row, month_label: monthLabel(row.month) })));
const topClientsRows = computed(() => topClientsData.value);
const statusRows = computed(() => statusData.value.map((row) => ({ ...row, month_label: monthLabel(row.month) })));
const loadRows = computed(() => loadData.value.map((row) => ({ ...row, label: `${row.employee_name} · ${stageLabel(row.stage)}` })));
const productTypeRows = computed(() => productTypeData.value);
const factualRows = computed(() => factualData.value);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const period = { from: from.value || undefined, to: to.value || undefined };
    const [summary, revenue, clients, statuses, loadReport, productTypes, factual] = await Promise.all([
      analyticsApi.summary(period),
      analyticsApi.revenueByMonth({ year_from: yearFrom.value, year_to: yearTo.value }),
      analyticsApi.topClients({ ...period, limit: 20 }),
      analyticsApi.statusDynamics(period),
      analyticsApi.productionLoad(period),
      analyticsApi.productTypes(period),
      analyticsApi.factualMargin(period),
    ]);
    summaryData.value = summary;
    revenueData.value = revenue;
    topClientsData.value = clients;
    statusData.value = statuses;
    loadData.value = loadReport;
    productTypeData.value = productTypes;
    factualData.value = factual;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить аналитику';
  } finally {
    loading.value = false;
  }
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' }).format(new Date(value));
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    casting: 'Выливание',
    trim: 'Срезание',
    assembly: 'Сборка',
    packaging: 'Упаковка',
    hardware: 'Фурнитура',
    production: 'Производство',
  };
  return labels[stage] || stage || 'Производство';
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, .tabs, .summary-grid, .bar-table, .table-section, .error, .muted { max-width: 88rem; margin-left: auto; margin-right: auto; }
.page-header, .header-actions, .toolbar, .tabs { display: flex; align-items: end; justify-content: space-between; gap: .75rem; }
.header-actions, .toolbar, .tabs { justify-content: flex-start; flex-wrap: wrap; }
.page-header { margin-bottom: 1rem; }
h1, p { margin: 0; }
h1 { font-size: 1.7rem; }
p { color: #697586; margin-top: .25rem; }
label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, button, a { box-sizing: border-box; font: inherit; }
input { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; }
button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
button:disabled { cursor: wait; opacity: .6; }
.tabs { margin-bottom: 1rem; }
.tabs button.active { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; font-weight: 700; }
.error { margin-bottom: 1rem; color: #b42318; }
.muted { margin-bottom: 1rem; color: #697586; }
</style>
