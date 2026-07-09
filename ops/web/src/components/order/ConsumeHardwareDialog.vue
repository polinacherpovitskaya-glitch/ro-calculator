<template>
  <div class="modal-backdrop">
    <form class="modal wide" @submit.prevent="submit">
      <header><h2>Списать фурнитуру</h2><button type="button" @click="$emit('close')">×</button></header>
      <section class="toolbar compact">
        <label>Поиск склада <input v-model="search" type="search" @keydown.enter.prevent="loadItems" /></label>
        <button type="button" @click="loadItems">Найти</button>
      </section>
      <table>
        <thead><tr><th>Позиция</th><th>Доступно</th><th>Списать</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.name }} <small>#{{ item.id }}</small></td>
            <td>{{ item.available_qty ?? item.qty }}</td>
            <td><input v-model.number="qtyById[item.id]" type="number" min="0" step="0.01" /></td>
          </tr>
          <tr v-if="items.length === 0"><td colspan="3">Ничего не выбрано</td></tr>
        </tbody>
      </table>
      <label>Комментарий <textarea v-model="note" rows="3" /></label>
      <footer class="actions">
        <button type="button" @click="$emit('close')">Отмена</button>
        <button type="submit">Списать</button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { WarehouseItem } from '../../api/warehouse';
import { listItems } from '../../api/warehouse';

const emit = defineEmits<{ close: []; consume: [payload: { items: { warehouse_item_id: number; qty: number; note?: string | null }[]; note: string }] }>();
const search = ref('');
const note = ref('');
const items = ref<WarehouseItem[]>([]);
const qtyById = reactive<Record<number, number>>({});

onMounted(loadItems);

async function loadItems() {
  items.value = (await listItems({ search: search.value || undefined })).slice(0, 20);
}
function submit() {
  const selected = Object.entries(qtyById)
    .map(([id, qty]) => ({ warehouse_item_id: Number(id), qty: Number(qty), note: note.value || null }))
    .filter((item) => item.qty > 0);
  if (!selected.length) {
    window.alert('Выберите количество для списания');
    return;
  }
  emit('consume', { items: selected, note: note.value });
}
</script>
