<template>
  <section class="panel">
    <header class="panel-header">
      <h2>Производство</h2>
      <button type="button" @click="add">Добавить план</button>
    </header>
    <table>
      <thead><tr><th>Дата</th><th>Изделие</th><th>Кол-во</th><th>Часы</th><th>Статус</th></tr></thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.id">
          <td>{{ String(entry.date).slice(0, 10) }}</td>
          <td>{{ entry.item_name || '-' }}</td>
          <td>{{ entry.qty ?? '-' }}</td>
          <td>{{ entry.hours_planned ?? '-' }}</td>
          <td>{{ status(entry.status) }}</td>
        </tr>
        <tr v-if="entries.length === 0"><td colspan="5">Планов по заказу пока нет</td></tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ProductionPlanEntry } from '../../api/production';
import { createPlanEntry, listPlanEntries } from '../../api/production';

const props = defineProps<{ orderId: number | null }>();
const entries = ref<ProductionPlanEntry[]>([]);

onMounted(load);
watch(() => props.orderId, load);

async function load() {
  entries.value = props.orderId ? await listPlanEntries({ order_id: props.orderId }) : [];
}
async function add() {
  if (!props.orderId) return;
  const entry = await createPlanEntry({ date: new Date().toISOString().slice(0, 10), order_id: props.orderId, item_name: 'Новая операция', status: 'planned', position: entries.value.length + 1 });
  entries.value = [...entries.value, entry];
}
function status(value: string) {
  return ({ planned: 'Запланировано', in_progress: 'В работе', done: 'Готово', cancelled: 'Отменено' } as Record<string, string>)[value] || value;
}
</script>
