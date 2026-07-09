<template>
  <section class="summary-grid">
    <article v-for="item in items" :key="item.label" class="summary-item">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
      <small>{{ item.hint }}</small>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SummaryReport } from '../../api/analytics';

const props = defineProps<{ data: SummaryReport | null }>();

function money(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}

function hours(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
}

const items = computed(() => {
  const data = props.data;
  return [
    { label: 'Заказы', value: String(data?.orders_count ?? '-'), hint: `закрыто: ${data?.closed_count ?? '-'}` },
    { label: 'План выручка', value: money(data?.plan_revenue), hint: `маржа: ${data?.plan_margin_percent ?? '-'}%` },
    { label: 'План прибыль', value: money(data?.plan_margin), hint: `расходы: ${money(data?.plan_cost)}` },
    { label: 'Факт выручка', value: money(data?.fact_revenue), hint: `маржа: ${data?.fact_margin_percent ?? '-'}%` },
    { label: 'Факт прибыль', value: money(data?.fact_margin), hint: `расходы: ${money(data?.fact_cost)}` },
    { label: 'Загрузка', value: hours(data?.fact_hours), hint: `план: ${hours(data?.plan_hours)}` },
  ];
});
</script>

<style scoped>
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: .75rem; margin-bottom: 1rem; }
.summary-item { display: grid; gap: .25rem; border: 1px solid #d9e2ec; border-radius: 8px; background: white; padding: .85rem; }
.summary-item span, .summary-item small { color: #52606d; }
.summary-item strong { color: #102a43; font-size: 1.25rem; line-height: 1.2; }
.summary-item small { min-height: 1.1rem; }
</style>
