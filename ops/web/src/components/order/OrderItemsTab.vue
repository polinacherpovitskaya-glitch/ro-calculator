<template>
  <section class="panel">
    <header class="panel-header">
      <h2>Позиции</h2>
      <div class="actions">
        <button type="button" :disabled="!orderId" @click="showAdd = true">Добавить позицию</button>
        <button type="button" :disabled="!orderId" @click="showConsume = true">Списать фурнитуру</button>
      </div>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Тип</th><th>Название</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th>Склад</th><th></th></tr></thead>
        <tbody>
          <OrderItemRow v-for="item in items" :key="item.id" :item="item" @save="(row, patch) => $emit('save-item', row, patch)" @remove="$emit('delete-item', $event)" />
          <tr v-if="items.length === 0"><td colspan="8">Позиции появятся после сохранения заказа</td></tr>
        </tbody>
      </table>
    </div>
    <AddItemDialog v-if="showAdd" @close="showAdd = false" @add="addItem" />
    <ConsumeHardwareDialog v-if="showConsume" @close="showConsume = false" @consume="consume" />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { OrderItem, OrderItemInput } from '../../api/orders';
import AddItemDialog from './AddItemDialog.vue';
import ConsumeHardwareDialog from './ConsumeHardwareDialog.vue';
import OrderItemRow from './OrderItemRow.vue';

defineProps<{ orderId: number | null; items: OrderItem[] }>();
const emit = defineEmits<{
  add: [item: OrderItemInput];
  'save-item': [item: OrderItem, patch: OrderItemInput];
  'delete-item': [item: OrderItem];
  consume: [payload: { items: { warehouse_item_id: number; qty: number; note?: string | null }[]; note: string }];
}>();
const showAdd = ref(false);
const showConsume = ref(false);

function addItem(item: OrderItemInput) {
  showAdd.value = false;
  emit('add', item);
}
function consume(payload: { items: { warehouse_item_id: number; qty: number; note?: string | null }[]; note: string }) {
  showConsume.value = false;
  emit('consume', payload);
}
</script>
