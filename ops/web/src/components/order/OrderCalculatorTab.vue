<template>
  <section class="panel">
    <header class="panel-header"><h2>Расчет</h2><button type="button" @click="$emit('preview')">Live preview</button></header>
    <div class="metrics">
      <span>Выручка <strong>{{ money(order.total_revenue) }}</strong></span>
      <span>Себестоимость <strong>{{ money(order.total_cost) }}</strong></span>
      <span>Маржа <strong>{{ money(order.total_margin) }}</strong></span>
      <span>Маржа % <strong>{{ percent(order.margin_percent) }}</strong></span>
      <span>Пластик <strong>{{ number(order.production_hours_plastic) }}</strong></span>
      <span>Упаковка <strong>{{ number(order.production_hours_packaging) }}</strong></span>
      <span>Фурнитура <strong>{{ number(order.production_hours_hardware) }}</strong></span>
    </div>
    <p v-if="previewing" class="muted">Пересчет...</p>
    <pre>{{ JSON.stringify(order.calculator_data || {}, null, 2) }}</pre>
  </section>
</template>

<script setup lang="ts">
import type { Order } from '../../api/orders';

defineProps<{ order: Partial<Order>; previewing: boolean }>();
defineEmits<{ preview: [] }>();
function money(value: number | null | undefined) { return value === null || value === undefined ? '-' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
function number(value: number | null | undefined) { return value === null || value === undefined ? '-' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
function percent(value: number | null | undefined) { return value === null || value === undefined ? '-' : `${Number(value).toFixed(2)}%`; }
</script>
