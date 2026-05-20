<template>
  <section class="panel">
    <header class="panel-header"><h2>Факт</h2><button type="button" :disabled="!orderId" @click="recalc">Пересчитать факт</button></header>
    <div class="header-grid">
      <label>Факт выручка <input v-model.number="form.actual_revenue" type="number" step="0.01" /></label>
      <label>Факт расходы <input v-model.number="form.actual_cost" type="number" step="0.01" /></label>
      <label>Дата закрытия <input v-model="form.closed_at" type="date" /></label>
    </div>
    <label>JSON факт-данных <textarea v-model="form.dataText" rows="9" spellcheck="false" /></label>
    <div class="metrics">
      <span>План маржа <strong>{{ money(order.total_margin) }}</strong></span>
      <span>Факт маржа <strong>{{ money(factual?.actual_margin) }}</strong></span>
      <span>Отклонение <strong>{{ money(delta) }}</strong></span>
      <span>Факт % <strong>{{ factual?.actual_margin_percent === null || factual?.actual_margin_percent === undefined ? '-' : `${Number(factual.actual_margin_percent).toFixed(2)}%` }}</strong></span>
    </div>
    <footer class="actions"><button type="button" :disabled="!orderId" @click="save">Сохранить факт</button></footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { Order, OrderFactual } from '../../api/orders';

const props = defineProps<{ orderId: number | null; order: Partial<Order>; factual: OrderFactual | null }>();
const emit = defineEmits<{ save: [payload: { actual_revenue: number | null; actual_cost: number | null; closed_at: string | null; factual_data: Record<string, unknown> }]; recalc: [] }>();
const form = reactive({ actual_revenue: null as number | null, actual_cost: null as number | null, closed_at: '', dataText: '{}' });
const delta = computed(() => props.factual?.actual_margin === null || props.factual?.actual_margin === undefined || props.order.total_margin === null || props.order.total_margin === undefined ? null : Number(props.factual.actual_margin) - Number(props.order.total_margin));

watch(() => props.factual, (factual) => {
  Object.assign(form, {
    actual_revenue: factual?.actual_revenue ?? null,
    actual_cost: factual?.actual_cost ?? null,
    closed_at: factual?.closed_at ? String(factual.closed_at).slice(0, 10) : '',
    dataText: JSON.stringify(factual?.factual_data || {}, null, 2),
  });
}, { immediate: true, deep: true });

function save() {
  try {
    emit('save', { actual_revenue: form.actual_revenue, actual_cost: form.actual_cost, closed_at: form.closed_at || null, factual_data: JSON.parse(form.dataText || '{}') as Record<string, unknown> });
  } catch {
    window.alert('JSON содержит ошибку');
  }
}
function recalc() { emit('recalc'); }
function money(value: number | null | undefined) { return value === null || value === undefined ? '-' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
</script>
