<template>
  <tr>
    <td><input v-model="draft.position" type="number" @change="save" /></td>
    <td>
      <select v-model="draft.type" @change="save">
        <option value="product">Товар</option>
        <option value="mold">Молд</option>
        <option value="hardware">Фурнитура</option>
        <option value="pendant">Подвес</option>
        <option value="packaging">Упаковка</option>
        <option value="other">Прочее</option>
      </select>
    </td>
    <td><input v-model="draft.name" @change="save" /></td>
    <td><input v-model.number="draft.qty" type="number" min="0" step="0.01" @change="save" /></td>
    <td><input v-model.number="draft.unit_price" type="number" min="0" step="0.01" @change="save" /></td>
    <td>{{ lineTotal }}</td>
    <td><input v-model="warehouseId" type="number" min="1" placeholder="ID" @change="save" /></td>
    <td class="row-actions"><button type="button" @click="$emit('remove', item)">Удалить</button></td>
  </tr>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { OrderItem, OrderItemInput } from '../../api/orders';

const props = defineProps<{ item: OrderItem }>();
const emit = defineEmits<{ save: [item: OrderItem, patch: OrderItemInput]; remove: [item: OrderItem] }>();
const draft = reactive({ type: 'product', name: '', qty: 1, unit_price: 0, position: 1 });
const warehouseId = computed({
  get: () => props.item.item_data?.warehouse_item_id ? String(props.item.item_data.warehouse_item_id) : '',
  set: (value: string) => { props.item.item_data.warehouse_item_id = value ? Number(value) : undefined; },
});
const lineTotal = computed(() => Number((Number(draft.qty || 0) * Number(draft.unit_price || 0)).toFixed(2)).toLocaleString('ru-RU'));

watch(() => props.item, (item) => {
  Object.assign(draft, {
    type: item.type || 'product',
    name: item.name || '',
    qty: Number(item.qty ?? 1),
    unit_price: Number(item.unit_price ?? 0),
    position: Number(item.position ?? 1),
  });
}, { immediate: true, deep: true });

function save() {
  const item_data = { ...(props.item.item_data || {}) };
  emit('save', props.item, {
    type: draft.type,
    name: draft.name || null,
    qty: draft.qty,
    unit_price: draft.unit_price,
    line_total: Number((Number(draft.qty || 0) * Number(draft.unit_price || 0)).toFixed(2)),
    position: draft.position,
    item_data,
  });
}
</script>
