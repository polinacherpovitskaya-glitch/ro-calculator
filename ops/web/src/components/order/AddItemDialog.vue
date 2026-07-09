<template>
  <div class="modal-backdrop">
    <form class="modal" @submit.prevent="submit">
      <header><h2>Добавить позицию</h2><button type="button" @click="$emit('close')">×</button></header>
      <label>Тип
        <select v-model="form.type">
          <option value="product">Товар из шаблона</option>
          <option value="mold">Молд + фурнитура</option>
          <option value="pendant">Подвес</option>
          <option value="packaging">Упаковка</option>
          <option value="hardware">Фурнитура</option>
          <option value="other">Прочее</option>
        </select>
      </label>
      <label>Название <input v-model="form.name" required /></label>
      <label>Количество <input v-model.number="form.qty" type="number" min="0" step="0.01" required /></label>
      <label>Цена <input v-model.number="form.unit_price" type="number" min="0" step="0.01" /></label>
      <label>ID позиции склада <input v-model.number="form.warehouse_item_id" type="number" min="1" /></label>
      <label>Данные позиции (JSON) <textarea v-model="form.dataText" rows="7" spellcheck="false" /></label>
      <footer class="actions">
        <button type="button" @click="$emit('close')">Отмена</button>
        <button type="submit">Добавить</button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import type { OrderItemInput } from '../../api/orders';

const emit = defineEmits<{ close: []; add: [item: OrderItemInput] }>();
const form = reactive({ type: 'product', name: '', qty: 1, unit_price: 0, warehouse_item_id: null as number | null, dataText: '{}' });

function submit() {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(form.dataText || '{}') as Record<string, unknown>;
  } catch {
    window.alert('JSON содержит ошибку');
    return;
  }
  if (form.warehouse_item_id) data.warehouse_item_id = form.warehouse_item_id;
  emit('add', {
    type: form.type,
    name: form.name,
    qty: form.qty,
    unit_price: form.unit_price,
    line_total: Number((Number(form.qty || 0) * Number(form.unit_price || 0)).toFixed(2)),
    item_data: data,
  });
}
</script>
