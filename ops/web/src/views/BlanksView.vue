<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Бланки</h1><p>{{ blanks.blanks.length }} позиций</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/molds">Молды</RouterLink><button type="button" @click="showCreate = true">Новый бланк</button></div>
    </header>

    <section class="toolbar">
      <div class="tabs">
        <button type="button" :class="{ active: blanks.kind === 'hardware' }" @click="switchKind('hardware')">Hardware</button>
        <button type="button" :class="{ active: blanks.kind === 'packaging' }" @click="switchKind('packaging')">Packaging</button>
      </div>
      <label>Поиск <input v-model="blanks.search" type="search" @keydown.enter="reload" /></label>
      <label>Категория <select v-model="blanks.category" @change="reload"><option value="">Все</option><option v-for="category in blanks.categories" :key="category" :value="category">{{ category }}</option></select></label>
      <button type="button" :disabled="blanks.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="blanks.error" class="error">{{ blanks.error }}</p>

    <div class="table-wrap">
      <table>
        <thead><tr><th>SKU</th><th>Название</th><th>Категория</th><th v-if="blanks.kind === 'hardware'">Вес</th><th>Цена</th><th>Валюта</th><th></th></tr></thead>
        <tbody>
          <tr v-if="blanks.loading"><td :colspan="blanks.kind === 'hardware' ? 7 : 6">Загрузка...</td></tr>
          <tr v-for="blank in blanks.blanks" :key="blank.id">
            <td><input :value="blank.sku || ''" @change="updateText(blank.id, 'sku', $event)" /></td>
            <td><input :value="blank.name" @change="updateText(blank.id, 'name', $event)" /></td>
            <td><input :value="blank.category || ''" @change="updateText(blank.id, 'category', $event)" /></td>
            <td v-if="blanks.kind === 'hardware'"><input class="number" type="number" step="0.01" :value="blank.weight ?? ''" @change="updateNumber(blank.id, 'weight', $event)" /></td>
            <td><input class="number" type="number" step="0.01" :value="blank.last_price ?? ''" @change="updateNumber(blank.id, 'last_price', $event)" /></td>
            <td><input :value="blank.last_currency || ''" @change="updateText(blank.id, 'last_currency', $event)" /></td>
            <td class="right"><button type="button" @click="deleteBlank(blank.id)">Удалить</button></td>
          </tr>
          <tr v-if="!blanks.loading && blanks.blanks.length === 0"><td :colspan="blanks.kind === 'hardware' ? 7 : 6">Пусто</td></tr>
        </tbody>
      </table>
    </div>

    <dialog :open="showCreate" @close="showCreate = false">
      <form method="dialog" class="form" @submit.prevent="createBlank">
        <header><h2>Новый бланк</h2><button type="button" @click="showCreate = false">×</button></header>
        <label>Название <input v-model="draft.name" required /></label>
        <label>SKU <input v-model="draft.sku" /></label>
        <label>Категория <input v-model="draft.category" /></label>
        <label v-if="blanks.kind === 'hardware'">Вес <input v-model.number="draft.weight" type="number" step="0.01" /></label>
        <label>Цена <input v-model.number="draft.last_price" type="number" step="0.01" /></label>
        <label>Валюта <input v-model="draft.last_currency" /></label>
        <menu><button type="button" @click="showCreate = false">Отмена</button><button type="submit" :disabled="saving">Создать</button></menu>
      </form>
    </dialog>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import type { BlankKind, BlankPatch } from '../api/blanks';
import { useBlanksStore } from '../stores/blanks';

const blanks = useBlanksStore();
const showCreate = ref(false);
const saving = ref(false);
const draft = reactive({ name: '', sku: '', category: '', weight: null as number | null, last_price: null as number | null, last_currency: '' });
let searchTimer: number | undefined;

onMounted(() => void blanks.loadBlanks());
watch(() => blanks.search, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void reload(), 250); });

async function switchKind(kind: BlankKind) {
  blanks.kind = kind;
  blanks.category = '';
  await blanks.loadBlanks();
}
async function reload() { await blanks.loadBlanks(); }
async function updateText(id: number, field: 'sku' | 'name' | 'category' | 'last_currency', event: Event) {
  const input = event.target as HTMLInputElement;
  await blanks.updateBlank(id, { [field]: input.value || null } as BlankPatch);
}
async function updateNumber(id: number, field: 'weight' | 'last_price', event: Event) {
  const input = event.target as HTMLInputElement;
  await blanks.updateBlank(id, { [field]: input.value === '' ? null : Number(input.value) });
}
async function deleteBlank(id: number) {
  if (!window.confirm('Удалить бланк?')) return;
  await blanks.deleteBlank(id);
}
async function createBlank() {
  saving.value = true;
  try {
    await blanks.createBlank({ ...draft, sku: draft.sku || null, category: draft.category || null, last_currency: draft.last_currency || null });
    Object.assign(draft, { name: '', sku: '', category: '', weight: null, last_price: null, last_currency: '' });
    showCreate.value = false;
  } finally { saving.value = false; }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, .table-wrap { max-width: 78rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar, .tabs { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } p { color: #697586; margin-top: .25rem; } label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, button, a { box-sizing: border-box; font: inherit; } input, select { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; } button.active { background: #1f2933; color: white; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .78rem; text-transform: uppercase; } td input { width: 100%; min-width: 7rem; } .number { max-width: 7rem; } .right { text-align: right; } .error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
dialog { border: 0; border-radius: 8px; padding: 0; box-shadow: 0 20px 60px #10182833; } .form { display: grid; gap: .8rem; width: min(32rem, calc(100vw - 2rem)); padding: 1rem; } .form header, menu { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } menu { padding: 0; margin: 0; }
</style>
