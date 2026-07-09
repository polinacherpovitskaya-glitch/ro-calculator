<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>Молды</h1>
        <p>{{ molds.molds.length }} всего, {{ molds.activeCount }} активных</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/">Главная</RouterLink>
        <RouterLink to="/blanks">Бланки</RouterLink>
        <RouterLink to="/colors">Цвета</RouterLink>
        <RouterLink to="/marketplaces">Маркетплейсы</RouterLink>
        <button type="button" @click="showCreate = true">Новый молд</button>
      </div>
    </header>

    <section class="toolbar">
      <label>Поиск <input v-model="molds.search" type="search" placeholder="Название" @keydown.enter="reload" /></label>
      <label>
        Статус
        <select v-model="molds.status" @change="reload">
          <option value="">Все</option>
          <option value="active">Активные</option>
          <option value="retired">Выведены</option>
          <option value="broken">Сломаны</option>
        </select>
      </label>
      <button type="button" :disabled="molds.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="molds.error" class="error">{{ molds.error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Фото</th>
            <th>Название</th>
            <th>Тип</th>
            <th>Статус</th>
            <th>Использование</th>
            <th>Лимит</th>
            <th>Заметка</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="molds.loading"><td colspan="8">Загрузка...</td></tr>
          <tr v-for="mold in molds.molds" :key="mold.id">
            <td>
              <RouterLink v-if="mold.photo_url" class="photo-link" :to="`/molds/${mold.id}`">
                <img class="photo-thumb" :src="mold.photo_url" :alt="mold.name" loading="lazy" />
              </RouterLink>
              <span v-else class="photo-empty">Нет фото</span>
            </td>
            <td><RouterLink :to="`/molds/${mold.id}`">{{ mold.name }}</RouterLink></td>
            <td><input :value="mold.type || ''" @change="updateText(mold.id, 'type', $event)" /></td>
            <td>
              <select :value="mold.status" @change="updateText(mold.id, 'status', $event)">
                <option value="active">active</option>
                <option value="retired">retired</option>
                <option value="broken">broken</option>
              </select>
            </td>
            <td>{{ mold.usage_count }}</td>
            <td><input class="number" type="number" :value="mold.usage_limit ?? ''" @change="updateNumber(mold.id, 'usage_limit', $event)" /></td>
            <td><input :value="mold.note || ''" @change="updateText(mold.id, 'note', $event)" /></td>
            <td class="right"><button type="button" @click="deleteMold(mold.id)">Удалить</button></td>
          </tr>
          <tr v-if="!molds.loading && molds.molds.length === 0"><td colspan="8">Пусто</td></tr>
        </tbody>
      </table>
    </div>

    <dialog :open="showCreate" @close="showCreate = false">
      <form method="dialog" class="form" @submit.prevent="createMold">
        <header><h2>Новый молд</h2><button type="button" @click="showCreate = false">×</button></header>
        <label>Название <input v-model="draft.name" required /></label>
        <label>Тип <input v-model="draft.type" /></label>
        <label>Лимит <input v-model.number="draft.usage_limit" type="number" min="0" /></label>
        <label>Фото URL <input v-model="draft.photo_url" /></label>
        <label>Заметка <textarea v-model="draft.note" rows="2" /></label>
        <menu><button type="button" @click="showCreate = false">Отмена</button><button type="submit" :disabled="saving">Создать</button></menu>
      </form>
    </dialog>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import type { MoldPatch } from '../api/molds';
import { useMoldsStore } from '../stores/molds';

const molds = useMoldsStore();
const showCreate = ref(false);
const saving = ref(false);
const draft = reactive({ name: '', type: '', usage_limit: null as number | null, photo_url: '', note: '' });
let searchTimer: number | undefined;

onMounted(() => void molds.loadMolds());

watch(
  () => molds.search,
  () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void reload(), 250);
  }
);

async function reload() {
  await molds.loadMolds();
}

async function updateText(id: number, field: 'type' | 'status' | 'note', event: Event) {
  const input = event.target as HTMLInputElement;
  await molds.updateMold(id, { [field]: input.value || null } as MoldPatch);
}

async function updateNumber(id: number, field: 'usage_limit', event: Event) {
  const input = event.target as HTMLInputElement;
  await molds.updateMold(id, { [field]: input.value === '' ? null : Number(input.value) });
}

async function deleteMold(id: number) {
  if (!window.confirm('Удалить молд?')) return;
  await molds.deleteMold(id);
}

async function createMold() {
  saving.value = true;
  try {
    await molds.createMold({
      name: draft.name,
      type: draft.type || null,
      usage_limit: draft.usage_limit,
      photo_url: draft.photo_url || null,
      note: draft.note || null,
    });
    Object.assign(draft, { name: '', type: '', usage_limit: null, photo_url: '', note: '' });
    showCreate.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, .table-wrap { max-width: 78rem; margin: 0 auto 1rem; }
.page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; }
.header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } p { color: #697586; margin-top: .25rem; }
label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, textarea, button, a { box-sizing: border-box; font: inherit; }
input, select, textarea { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; }
button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .55rem .6rem; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: middle; } th { color: #52606d; font-size: .78rem; text-transform: uppercase; }
th:nth-child(1) { width: 5.5rem; }
th:nth-child(2) { width: 10rem; }
th:nth-child(3) { width: 8rem; }
th:nth-child(4) { width: 8rem; }
th:nth-child(5) { width: 8.5rem; }
th:nth-child(6) { width: 7rem; }
th:nth-child(8) { width: 6rem; }
td input, td select { width: 100%; min-width: 0; } .number { max-width: 6.5rem; } .right { text-align: right; } .right button { width: 100%; justify-content: center; padding: 0 .45rem; } .error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
.photo-link { width: 4rem; height: 4rem; min-height: 0; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: #eef2f6; }
.photo-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo-empty { display: inline-flex; align-items: center; justify-content: center; width: 4rem; height: 4rem; color: #8792a0; background: #f1f3f5; border-radius: 6px; font-size: .72rem; font-weight: 700; text-align: center; }
dialog { border: 0; border-radius: 8px; padding: 0; box-shadow: 0 20px 60px #10182833; } .form { display: grid; gap: .8rem; width: min(32rem, calc(100vw - 2rem)); padding: 1rem; } .form header, menu { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } menu { padding: 0; margin: 0; }
</style>
