<template>
  <section class="bar-table">
    <h2>{{ title }}</h2>
    <div v-if="rows.length" class="bars">
      <div v-for="row in normalized" :key="row.key" class="bar-row">
        <div class="bar-label">{{ row.label }}</div>
        <div class="track"><span :style="{ width: `${row.percent}%` }"></span></div>
        <div class="bar-value">{{ row.valueLabel }}</div>
      </div>
    </div>
    <p v-else>Нет данных за период</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  rows: Array<Record<string, unknown>>;
  labelKey: string;
  valueKey: string;
  valueKind?: 'money' | 'hours' | 'number';
}>();

function format(value: number) {
  if (props.valueKind === 'money') return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
  if (props.valueKind === 'hours') return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

const normalized = computed(() => {
  const max = Math.max(1, ...props.rows.map((row) => Number(row[props.valueKey]) || 0));
  return props.rows.map((row, index) => {
    const value = Number(row[props.valueKey]) || 0;
    return {
      key: `${String(row[props.labelKey] ?? index)}-${index}`,
      label: String(row[props.labelKey] ?? '-'),
      percent: Math.max(2, Math.min(100, (value / max) * 100)),
      valueLabel: format(value),
    };
  });
});
</script>

<style scoped>
.bar-table { border: 1px solid #d9e2ec; border-radius: 8px; background: white; padding: 1rem; }
h2 { margin: 0 0 .8rem; font-size: 1rem; color: #102a43; }
p { margin: 0; color: #697586; }
.bars { display: grid; gap: .7rem; }
.bar-row { display: grid; grid-template-columns: minmax(8rem, 1.2fr) minmax(10rem, 3fr) minmax(6rem, .8fr); gap: .75rem; align-items: center; }
.bar-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334e68; }
.track { height: .7rem; border-radius: 999px; background: #eef2f6; overflow: hidden; }
.track span { display: block; height: 100%; border-radius: inherit; background: #2563eb; }
.bar-value { text-align: right; color: #102a43; font-variant-numeric: tabular-nums; }
@media (max-width: 760px) {
  .bar-row { grid-template-columns: 1fr; gap: .25rem; }
  .bar-value { text-align: left; }
}
</style>
