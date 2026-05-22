<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Цвета</h1><p>{{ colors.colors.length }} позиций</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/molds">Молды</RouterLink><button type="button" @click="showCreate = true">Новый цвет</button></div>
    </header>

    <section class="toolbar">
      <label>Поиск <input v-model="colors.search" type="search" @keydown.enter="reload" /></label>
      <label>Категория <select v-model="colors.category" @change="reload"><option value="">Все</option><option v-for="category in colors.categories" :key="category" :value="category">{{ category }}</option></select></label>
      <button type="button" :disabled="colors.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="colors.error" class="error">{{ colors.error }}</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Превью</th><th>Название</th><th>HEX</th><th>Категория</th><th></th></tr></thead>
        <tbody>
          <tr v-if="colors.loading"><td colspan="5">Загрузка...</td></tr>
          <tr v-for="color in colors.colors" :key="color.id">
            <td><span class="swatch" :class="{ invalid: !isValidHex(color.hex) }" :style="swatchStyle(color.hex)" :title="isValidHex(color.hex) ? color.hex || '' : 'HEX не задан'" /></td>
            <td><input :value="color.name" @change="updateText(color.id, 'name', $event)" /></td>
            <td><input :value="color.hex || ''" placeholder="#RRGGBB" @change="updateText(color.id, 'hex', $event)" /></td>
            <td><input :value="color.category || ''" @change="updateText(color.id, 'category', $event)" /></td>
            <td class="right"><button type="button" @click="deleteColor(color.id)">Удалить</button></td>
          </tr>
          <tr v-if="!colors.loading && colors.colors.length === 0"><td colspan="5">Пусто</td></tr>
        </tbody>
      </table>
    </div>

    <dialog :open="showCreate" @close="showCreate = false">
      <form method="dialog" class="form" @submit.prevent="createColor">
        <header><h2>Новый цвет</h2><button type="button" @click="showCreate = false">×</button></header>
        <label>Название <input v-model="draft.name" required /></label>
        <label>HEX <input v-model="draft.hex" placeholder="#RRGGBB" /></label>
        <label>Категория <input v-model="draft.category" /></label>
        <menu><button type="button" @click="showCreate = false">Отмена</button><button type="submit" :disabled="saving">Создать</button></menu>
      </form>
    </dialog>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import type { ColorPatch } from '../api/colors';
import { useColorsStore } from '../stores/colors';

const colors = useColorsStore();
const showCreate = ref(false);
const saving = ref(false);
const draft = reactive({ name: '', hex: '', category: '' });
let searchTimer: number | undefined;

onMounted(() => void colors.loadColors());
watch(() => colors.search, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void reload(), 250); });
async function reload() { await colors.loadColors(); }
function isValidHex(value: string | null | undefined) {
  return /^#[0-9a-f]{6}$/i.test(value || '');
}
function swatchStyle(value: string | null | undefined) {
  return isValidHex(value) ? { background: value || '#ffffff' } : {};
}
async function updateText(id: number, field: 'name' | 'hex' | 'category', event: Event) {
  const input = event.target as HTMLInputElement;
  await colors.updateColor(id, { [field]: input.value || null } as ColorPatch);
}
async function deleteColor(id: number) {
  if (!window.confirm('Удалить цвет?')) return;
  await colors.deleteColor(id);
}
async function createColor() {
  saving.value = true;
  try {
    await colors.createColor({ name: draft.name, hex: draft.hex || null, category: draft.category || null });
    Object.assign(draft, { name: '', hex: '', category: '' });
    showCreate.value = false;
  } finally { saving.value = false; }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .toolbar, .table-wrap { max-width: 78rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } p { color: #697586; margin-top: .25rem; } label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, button, a { box-sizing: border-box; font: inherit; } input, select { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .78rem; text-transform: uppercase; } td input { width: 100%; min-width: 8rem; } .right { text-align: right; } .swatch { display: inline-block; width: 2rem; height: 2rem; border: 1px solid #cbd5df; border-radius: 6px; vertical-align: middle; } .swatch.invalid { background: repeating-linear-gradient(45deg, #f8fafc 0 5px, #e5e7eb 5px 10px); border-style: dashed; } .error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
dialog { border: 0; border-radius: 8px; padding: 0; box-shadow: 0 20px 60px #10182833; } .form { display: grid; gap: .8rem; width: min(28rem, calc(100vw - 2rem)); padding: 1rem; } .form header, menu { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } menu { padding: 0; margin: 0; }
</style>
