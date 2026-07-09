<template>
  <section class="panel order-summary-panel">
    <div class="header-grid">
      <label>Название <input v-model="draft.order_name" @input="emitChange" /></label>
      <label>Клиент <input v-model="draft.client_name" @input="emitChange" /></label>
      <label>Телефон <input v-model="draft.client_phone" @input="emitChange" /></label>
      <label>Email <input v-model="draft.client_email" type="email" @input="emitChange" /></label>
      <label>Дедлайн <input v-model="draft.deadline" type="date" @input="emitChange" /></label>
      <label>Статус
        <select v-model="nextStatus">
          <option v-for="status in statuses" :key="status" :value="status">{{ statusLabel(status) }}</option>
        </select>
      </label>
    </div>
    <div class="metrics">
      <span><em>Выручка</em><strong>{{ money(draft.total_revenue) }}</strong></span>
      <span><em>Себестоимость</em><strong>{{ money(draft.total_cost) }}</strong></span>
      <span><em>Маржа</em><strong>{{ money(draft.total_margin) }}</strong></span>
      <span><em>Маржа %</em><strong>{{ percent(draft.margin_percent) }}</strong></span>
      <span><em>План часов</em><strong>{{ number(draft.total_hours_plan) }}</strong></span>
    </div>
    <footer class="actions">
      <button type="button" class="primary-action" :disabled="saving" @click="$emit('save')">Сохранить</button>
      <button type="button" :disabled="!canPersist || saving" @click="$emit('recalc')">Пересчитать</button>
      <button type="button" :disabled="!canPersist || saving || nextStatus === draft.status" @click="$emit('status', nextStatus)">Сменить статус</button>
      <button type="button" :disabled="!canPersist" @click="$emit('clone')">Клонировать</button>
      <button type="button" :disabled="!canPersist" @click="printQuote">Печать КП</button>
      <button type="button" :disabled="!canPersist || saving" class="danger" @click="$emit('delete')">Удалить</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { Order, OrderInput, OrderStatus } from '../../api/orders';
import { statusLabel } from '../../api/orders';

const props = defineProps<{ order: Partial<Order>; canPersist: boolean; saving: boolean }>();
const emit = defineEmits<{
  change: [patch: Partial<OrderInput>];
  save: [];
  recalc: [];
  status: [status: OrderStatus];
  clone: [];
  delete: [];
}>();

const statuses: OrderStatus[] = ['draft', 'quoted', 'approved', 'in_production', 'ready', 'shipped', 'closed', 'cancelled'];
const draft = reactive({
  order_name: '',
  client_name: '',
  client_phone: '',
  client_email: '',
  deadline: '',
  status: 'draft' as OrderStatus,
  total_revenue: null as number | null,
  total_cost: null as number | null,
  total_margin: null as number | null,
  margin_percent: null as number | null,
  total_hours_plan: null as number | null,
});
const nextStatus = computed({
  get: () => draft.status,
  set: (value: OrderStatus) => { draft.status = value; },
});

watch(() => props.order, (order) => {
  Object.assign(draft, {
    order_name: order.order_name || '',
    client_name: order.client_name || '',
    client_phone: order.client_phone || '',
    client_email: order.client_email || '',
    deadline: order.deadline ? String(order.deadline).slice(0, 10) : '',
    status: order.status || 'draft',
    total_revenue: order.total_revenue ?? null,
    total_cost: order.total_cost ?? null,
    total_margin: order.total_margin ?? null,
    margin_percent: order.margin_percent ?? null,
    total_hours_plan: order.total_hours_plan ?? null,
  });
}, { immediate: true, deep: true });

function emitChange() {
  emit('change', {
    order_name: draft.order_name || null,
    client_name: draft.client_name || null,
    client_phone: draft.client_phone || null,
    client_email: draft.client_email || null,
    deadline: draft.deadline || null,
  });
}
function money(value: number | null | undefined) { return value === null || value === undefined ? '-' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
function number(value: number | null | undefined) { return value === null || value === undefined ? '-' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
function percent(value: number | null | undefined) { return value === null || value === undefined ? '-' : `${Number(value).toFixed(2)}%`; }
function printQuote() { window.print(); }
</script>

<style scoped>
.order-summary-panel {
  align-content: start;
}

.metrics em {
  font-style: normal;
}

.primary-action {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
</style>
