<template>
  <main class="page">
    <header class="page-header">
      <div><h1>{{ isNew ? 'Новый заказ' : `Заказ #${order.id}` }}</h1><p>{{ dirty ? 'Есть несохраненные изменения' : 'Сохранено' }}</p></div>
      <div class="header-actions"><RouterLink to="/orders">Заказы</RouterLink><RouterLink to="/">Главная</RouterLink></div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <OrderHeader
      :order="order"
      :can-persist="!isNew && !!order.id"
      :saving="saving"
      @change="patchLocal"
      @save="saveOrder"
      @recalc="recalc"
      @status="changeStatus"
      @clone="clone"
      @delete="remove"
    />

    <nav class="tabs">
      <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
    </nav>

    <OrderItemsTab
      v-if="activeTab === 'items'"
      :order-id="order.id || null"
      :items="items"
      @add="addItem"
      @save-item="saveItem"
      @delete-item="deleteItem"
      @consume="consume"
    />
    <OrderCalculatorTab v-if="activeTab === 'calc'" :order="order" :previewing="previewing" @preview="preview" />
    <OrderProductionTab v-if="activeTab === 'production'" :order-id="order.id || null" />
    <OrderFactualTab v-if="activeTab === 'factual'" :order-id="order.id || null" :order="order" :factual="factual" @save="saveFactualData" @recalc="recalcFactualData" />
    <OrderHistoryTab v-if="activeTab === 'history'" :history="history" />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { apiFetch } from '../api';
import type { Order, OrderFactual, OrderInput, OrderItem, OrderItemInput, OrderStatus, OrderStatusHistory } from '../api/orders';
import * as api from '../api/orders';
import OrderCalculatorTab from '../components/order/OrderCalculatorTab.vue';
import OrderFactualTab from '../components/order/OrderFactualTab.vue';
import OrderHeader from '../components/order/OrderHeader.vue';
import OrderHistoryTab from '../components/order/OrderHistoryTab.vue';
import OrderItemsTab from '../components/order/OrderItemsTab.vue';
import OrderProductionTab from '../components/order/OrderProductionTab.vue';

type TabKey = 'items' | 'calc' | 'production' | 'factual' | 'history';

const route = useRoute();
const router = useRouter();
const tabs: { key: TabKey; label: string }[] = [
  { key: 'items', label: 'Позиции' },
  { key: 'calc', label: 'Расчет' },
  { key: 'production', label: 'Производство' },
  { key: 'factual', label: 'Факт' },
  { key: 'history', label: 'История' },
];
const order = reactive<Partial<Order>>({ status: 'draft', order_name: '', client_name: '', calculator_data: {} });
const items = ref<OrderItem[]>([]);
const factual = ref<OrderFactual | null>(null);
const history = ref<OrderStatusHistory[]>([]);
const activeTab = ref<TabKey>('items');
const saving = ref(false);
const previewing = ref(false);
const dirty = ref(false);
const error = ref('');
let previewTimer: number | undefined;
const isNew = computed(() => route.params.id === 'new');

onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload);
  if (!isNew.value) await load();
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
onBeforeRouteLeave(() => !dirty.value || window.confirm('Есть несохраненные изменения. Уйти со страницы?'));

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
function message(caught: unknown) { return caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Операция не выполнена'; }
function orderId() { return Number(route.params.id || order.id); }
async function load() {
  error.value = '';
  const detail = await api.getOrder(orderId());
  Object.assign(order, detail.order);
  items.value = detail.items;
  factual.value = detail.factual;
  history.value = detail.status_history;
  dirty.value = false;
}
function patchLocal(patch: Partial<OrderInput>) {
  Object.assign(order, patch);
  dirty.value = true;
  schedulePreview();
}
function itemRevenue(item: OrderItem) {
  const qty = Number(item.qty || 0);
  const unitPrice = Number(item.unit_price || 0);
  return item.line_total === null || item.line_total === undefined ? qty * unitPrice : Number(item.line_total);
}
function calcPreviewInput() {
  const settings = ((order.calculator_data || {}) as Record<string, unknown>).settings || {};
  return {
    id: order.id,
    order_name: order.order_name || undefined,
    client_name: order.client_name || undefined,
    status: order.status,
    products: [],
    hardwareItems: [],
    packagingItems: [],
    pendantItems: [],
    extraCosts: items.value.map((item) => ({ item_type: 'extra_cost', name: item.name || 'Позиция заказа', amount: itemRevenue(item) })),
    settings,
  };
}
async function saveOrder() {
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      order_name: order.order_name || null,
      client_name: order.client_name || null,
      client_phone: order.client_phone || null,
      client_email: order.client_email || null,
      deadline: order.deadline || null,
      calculator_data: order.calculator_data || {},
    };
    const saved = isNew.value ? await api.createOrder(payload) : await api.updateOrder(Number(order.id), payload);
    Object.assign(order, saved);
    dirty.value = false;
    if (isNew.value) await router.replace(`/orders/${saved.id}`);
  } catch (caught) {
    error.value = message(caught);
  } finally {
    saving.value = false;
  }
}
async function addItem(input: OrderItemInput) {
  if (!order.id) await saveOrder();
  if (!order.id) return;
  try {
    await api.createOrderItem(Number(order.id), { ...input, position: items.value.length + 1 });
    await load();
    schedulePreview();
  } catch (caught) { error.value = message(caught); }
}
async function saveItem(item: OrderItem, patch: OrderItemInput) {
  if (!order.id) return;
  try {
    await api.updateOrderItem(Number(order.id), item.id, patch);
    await load();
    schedulePreview();
  } catch (caught) { error.value = message(caught); }
}
async function deleteItem(item: OrderItem) {
  if (!order.id || !window.confirm('Удалить позицию?')) return;
  try {
    await api.deleteOrderItem(Number(order.id), item.id);
    await load();
    schedulePreview();
  } catch (caught) { error.value = message(caught); }
}
async function preview() {
  previewing.value = true;
  error.value = '';
  try {
    const result = await apiFetch<Record<string, unknown>>('/api/calc/preview', {
      method: 'POST',
      body: JSON.stringify(calcPreviewInput()),
    });
    Object.assign(order, {
      calculator_data: { ...(order.calculator_data || {}), ...result },
      total_revenue: result.total_revenue as number,
      total_cost: result.total_cost as number,
      total_margin: result.total_margin as number,
      margin_percent: result.margin_percent as number,
      total_hours_plan: result.total_hours_plan as number,
      production_hours_plastic: result.production_hours_plastic as number,
      production_hours_packaging: result.production_hours_packaging as number,
      production_hours_hardware: result.production_hours_hardware as number,
    });
    dirty.value = true;
  } catch (caught) { error.value = message(caught); }
  finally { previewing.value = false; }
}
function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void preview(), 500);
}
async function recalc() {
  if (!order.id) return;
  try {
    Object.assign(order, await api.recalcOrder(Number(order.id)));
    dirty.value = false;
    await load();
  } catch (caught) { error.value = message(caught); }
}
async function changeStatus(status: OrderStatus) {
  if (!order.id || status === order.status) return;
  const note = window.prompt('Комментарий к смене статуса') || undefined;
  try {
    Object.assign(order, await api.changeOrderStatus(Number(order.id), status, note));
    await load();
  } catch (caught) { error.value = message(caught); }
}
async function clone() {
  if (!order.id) return;
  try {
    const copy = await api.cloneOrder(Number(order.id));
    await router.push(`/orders/${copy.id}`);
  } catch (caught) { error.value = message(caught); }
}
async function remove() {
  if (!order.id || !window.confirm('Удалить draft-заказ?')) return;
  try {
    await api.deleteOrder(Number(order.id));
    dirty.value = false;
    await router.push('/orders');
  } catch (caught) { error.value = message(caught); }
}
async function consume(payload: { items: { warehouse_item_id: number; qty: number; note?: string | null }[]; note: string }) {
  if (!order.id) return;
  try {
    await api.consumeHardware(Number(order.id), payload.items, payload.note);
    await load();
  } catch (caught) { error.value = message(caught); }
}
async function saveFactualData(payload: { actual_revenue: number | null; actual_cost: number | null; closed_at: string | null; factual_data: Record<string, unknown> }) {
  if (!order.id) return;
  try { factual.value = await api.saveFactual(Number(order.id), payload); }
  catch (caught) { error.value = message(caught); }
}
async function recalcFactualData() {
  if (!order.id) return;
  try { factual.value = await api.recalcFactual(Number(order.id)); }
  catch (caught) { error.value = message(caught); }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .tabs, :deep(.panel) { max-width: 88rem; margin: 0 auto 1rem; }
.page-header, .header-actions, .tabs, :deep(.panel-header), :deep(.actions), :deep(.toolbar) { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.header-actions, .tabs, :deep(.actions), :deep(.toolbar) { justify-content: flex-start; flex-wrap: wrap; }
h1, p { margin: 0; } h1 { font-size: 1.7rem; } p, :deep(.muted) { color: #697586; margin-top: .25rem; }
:deep(h2) { margin: 0; font-size: 1.05rem; }
:deep(.panel) { background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; display: grid; gap: 1rem; }
:deep(.header-grid) { display: grid; grid-template-columns: repeat(3, minmax(12rem, 1fr)); gap: .75rem; }
:deep(.metrics) { display: flex; flex-wrap: wrap; gap: .75rem; }
:deep(.metrics span) { display: grid; gap: .2rem; min-width: 9rem; border: 1px solid #eef2f6; border-radius: 6px; padding: .6rem; color: #52606d; }
:deep(.metrics strong) { color: #1f2933; }
:deep(label) { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
:deep(input), :deep(select), :deep(textarea), button, a { box-sizing: border-box; font: inherit; }
:deep(input), :deep(select), :deep(textarea) { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; }
button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
button.active { background: #1f2933; color: white; border-color: #1f2933; }
button.danger { color: #b42318; border-color: #f3b4ad; }
:deep(table) { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; }
:deep(th), :deep(td) { padding: .6rem; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: top; }
:deep(th) { color: #52606d; font-size: .76rem; text-transform: uppercase; }
:deep(.table-wrap) { overflow-x: auto; }
:deep(pre) { max-height: 30rem; overflow: auto; margin: 0; padding: 1rem; background: #111827; color: #e5e7eb; border-radius: 8px; font-size: .78rem; }
:deep(.modal-backdrop) { position: fixed; inset: 0; display: grid; place-items: center; padding: 1rem; background: rgba(15, 23, 42, .42); z-index: 20; }
:deep(.modal) { width: min(34rem, 100%); max-height: 92vh; overflow: auto; display: grid; gap: .75rem; background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 20px 60px rgba(15, 23, 42, .22); }
:deep(.modal.wide) { width: min(50rem, 100%); }
:deep(.modal header) { display: flex; justify-content: space-between; align-items: center; gap: .75rem; }
.error { max-width: 88rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 900px) { :deep(.header-grid) { grid-template-columns: 1fr; } }
</style>
