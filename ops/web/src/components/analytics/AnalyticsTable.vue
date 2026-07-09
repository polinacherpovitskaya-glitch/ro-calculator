<template>
  <section class="table-section">
    <h2>{{ title }}</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th v-for="column in columns" :key="column.key">{{ column.label }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td v-for="column in columns" :key="column.key">{{ format(row[column.key], column.kind) }}</td>
          </tr>
          <tr v-if="rows.length === 0"><td :colspan="columns.length">Нет данных за период</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  columns: Array<{ key: string; label: string; kind?: 'money' | 'date' | 'percent' | 'hours' }>;
  rows: Array<Record<string, unknown>>;
}>();

function format(value: unknown, kind?: string) {
  if (value === null || value === undefined || value === '') return '-';
  if (kind === 'money') return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
  if (kind === 'hours') return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
  if (kind === 'percent') return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
  if (kind === 'date') return String(value).slice(0, 10);
  return String(value);
}
</script>

<style scoped>
.table-section { border: 1px solid #d9e2ec; border-radius: 8px; background: white; padding: 1rem; }
h2 { margin: 0 0 .8rem; font-size: 1rem; color: #102a43; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .6rem; border-bottom: 1px solid #eef2f6; text-align: left; white-space: nowrap; }
th { color: #52606d; font-size: .76rem; text-transform: uppercase; }
td { color: #243b53; }
</style>
