<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Производственный календарь</h1><p>{{ year }} год</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/production/plan">План</RouterLink><button type="button" @click="load">Обновить</button></div>
    </header>

    <section class="toolbar">
      <label>Год <input v-model.number="year" type="number" min="2020" max="2100" @change="load" /></label>
      <button type="button" :disabled="saving || !selected" @click="saveSelected">Сохранить день</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="layout">
      <div class="months">
        <article v-for="month in months" :key="month.index" class="month">
          <h2>{{ month.name }}</h2>
          <div class="weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
          <div class="grid">
            <span v-for="blank in month.offset" :key="`b-${month.index}-${blank}`" />
            <button v-for="day in month.days" :key="day.date" type="button" :class="dayClass(day.date)" @click="selectDay(day.date)">
              <span class="day-number">{{ day.day }}</span>
              <small class="day-hours">{{ formatHours(dayInfo(day.date).hours) }}</small>
            </button>
          </div>
        </article>
      </div>

      <aside v-if="selected" class="editor">
        <header><h2>{{ selected.date }}</h2><button type="button" @click="selected = null">×</button></header>
        <label class="check"><input v-model="selected.is_working" type="checkbox" /> Рабочий день</label>
        <label>Часы <input v-model.number="selected.hours" type="number" min="0" step="0.5" /></label>
        <label>Заметка <textarea v-model="selected.note" rows="5" /></label>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ProductionCalendarDay } from '../api/production';
import * as api from '../api/production';

const year = ref(new Date().getFullYear());
const days = ref<ProductionCalendarDay[]>([]);
const selected = ref<ProductionCalendarDay | null>(null);
const saving = ref(false);
const error = ref('');
const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const byDate = computed(() => new Map(days.value.map((day) => [normalizeDate(day.date), day])));
const months = computed(() => monthNames.map((name, index) => {
  const count = new Date(year.value, index + 1, 0).getDate();
  const first = new Date(year.value, index, 1).getDay();
  const offset = first === 0 ? 6 : first - 1;
  return { name, index, offset, days: Array.from({ length: count }, (_, i) => ({ day: i + 1, date: isoDate(year.value, index, i + 1) })) };
}));

onMounted(load);

function normalizeDate(value: string) { return String(value).slice(0, 10); }
function isoDate(y: number, monthIndex: number, day: number) { return `${y}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function defaultDay(date: string): ProductionCalendarDay {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  return { date, is_working: !isWeekend, hours: isWeekend ? 0 : 8, note: null, extras: {} };
}
function dayInfo(date: string) { return byDate.value.get(date) || defaultDay(date); }
function formatHours(value: number) { return `${Number(value || 0).toLocaleString('ru-RU')} ч`; }
function dayClass(date: string) {
  const day = dayInfo(date);
  return { day: true, working: day.is_working, weekend: !day.is_working, picked: selected.value?.date === date };
}
async function load() {
  error.value = '';
  try { days.value = (await api.listCalendarDays(year.value)).map((day) => ({ ...day, date: normalizeDate(day.date), hours: Number(day.hours) })); }
  catch (caught) { error.value = caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Не удалось загрузить календарь'; }
}
function selectDay(date: string) { selected.value = { ...dayInfo(date), date }; }
async function saveSelected() {
  if (!selected.value) return;
  saving.value = true; error.value = '';
  try {
    const saved = await api.saveCalendarDays([selected.value]);
    const next = saved[0] ? { ...saved[0], date: normalizeDate(saved[0].date), hours: Number(saved[0].hours) } : selected.value;
    days.value = [...days.value.filter((day) => normalizeDate(day.date) !== next.date), next].sort((a, b) => a.date.localeCompare(b.date));
    selected.value = { ...next };
  } catch (caught) { error.value = caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Не удалось сохранить день'; }
  finally { saving.value = false; }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .toolbar, .layout { max-width: 82rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1rem; } p { color: #697586; margin-top: .25rem; } .layout { display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 1rem; align-items: start; } .months { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
.month, .editor { background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: .85rem; } .weekdays, .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: .25rem; } .weekdays { margin: .65rem 0 .3rem; color: #697586; font-size: .72rem; text-align: center; } .grid .day { min-width: 0; height: 3rem; min-height: 3rem !important; display: grid !important; align-content: center; justify-items: center; gap: .16rem !important; border: 1px solid #d9e2ec; border-radius: 6px; background: #f2f5f8; padding: 0 !important; cursor: pointer; } .day-number { font-weight: 650; line-height: 1; } .day-hours { color: #697586; font-size: .68rem; line-height: 1; white-space: nowrap; } .day.working { background: #eef8f1; border-color: #b7dfc3; } .day.weekend { background: #f3f4f6; color: #697586; } .day.picked { outline: 2px solid #315c96; }
label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; } .check { display: flex; align-items: center; gap: .5rem; } input, textarea, button, a { box-sizing: border-box; font: inherit; } input, textarea { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; justify-content: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; }
.editor { display: grid; gap: .75rem; } .editor header { display: flex; align-items: center; justify-content: space-between; } .error { max-width: 82rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 1050px) { .months { grid-template-columns: repeat(2, minmax(0, 1fr)); } .layout { grid-template-columns: 1fr; } } @media (max-width: 640px) { .months { grid-template-columns: 1fr; } }
</style>
