<template>
  <section class="panel">
    <header class="panel-header"><h2>История</h2></header>
    <table>
      <thead><tr><th>Дата</th><th>Было</th><th>Стало</th><th>Кто</th><th>Комментарий</th></tr></thead>
      <tbody>
        <tr v-for="entry in history" :key="entry.id">
          <td>{{ new Date(entry.created_at).toLocaleString('ru-RU') }}</td>
          <td>{{ entry.from_status ? statusLabel(entry.from_status) : '-' }}</td>
          <td>{{ statusLabel(entry.to_status) }}</td>
          <td>{{ entry.actor_name || '-' }}</td>
          <td>{{ entry.note || '-' }}</td>
        </tr>
        <tr v-if="history.length === 0"><td colspan="5">Истории статусов пока нет</td></tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import type { OrderStatusHistory } from '../../api/orders';
import { statusLabel } from '../../api/orders';

defineProps<{ history: OrderStatusHistory[] }>();
</script>
