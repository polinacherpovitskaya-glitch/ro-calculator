<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Области</h1><p>{{ areas.length }} записей</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/tasks">Задачи</RouterLink><RouterLink to="/projects">Проекты</RouterLink><button type="button" @click="startCreate">Новая область</button></div>
    </header>
    <section class="toolbar">
      <label>Поиск <input v-model="search" type="search" @keydown.enter="load" /></label>
      <label class="check"><input v-model="activeOnly" type="checkbox" /> Только активные</label>
      <button type="button" :disabled="loading" @click="load">Обновить</button>
    </section>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="layout">
      <table>
        <thead><tr><th>Цвет</th><th>Slug</th><th>Название</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="5">Загрузка...</td></tr>
          <tr v-for="area in areas" :key="area.id" :class="{ selected: selected?.id === area.id }">
            <td><span class="swatch" :style="{ background: area.color || '#6b7280' }"></span></td>
            <td>{{ area.slug }}</td>
            <td>{{ area.name }}</td>
            <td>{{ area.is_active ? 'Активна' : 'Архив' }}</td>
            <td class="right"><button type="button" @click="selectArea(area)">Открыть</button></td>
          </tr>
          <tr v-if="!loading && areas.length === 0"><td colspan="5">Пусто</td></tr>
        </tbody>
      </table>
      <aside v-if="selected" class="editor">
        <header><h2>{{ isNew ? 'Новая область' : selected.name }}</h2><button type="button" @click="selected = null">×</button></header>
        <label>Slug <input v-model="form.slug" /></label>
        <label>Название <input v-model="form.name" /></label>
        <label>Цвет <input v-model="form.color" type="color" /></label>
        <label class="check"><input v-model="form.is_active" type="checkbox" /> Активна</label>
        <footer class="actions"><button v-if="!isNew" type="button" @click="archive">В архив</button><button type="button" :disabled="saving" @click="save">Сохранить</button></footer>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import * as api from '../api/work';
import type { Area } from '../api/work';

const areas = ref<Area[]>([]);
const selected = ref<Area | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const search = ref('');
const activeOnly = ref(true);
const form = reactive({ id: 0, slug: '', name: '', color: '#6b7280', is_active: true });
const isNew = computed(() => form.id === 0);
let timer: number | undefined;

onMounted(load);
watch(search, () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 250); });

function message(caught: unknown) { return caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Операция не выполнена'; }
async function load() {
  loading.value = true; error.value = '';
  try { areas.value = await api.listAreas({ search: search.value, active: activeOnly.value ? true : undefined }); }
  catch (caught) { error.value = message(caught); }
  finally { loading.value = false; }
}
function fill(area: Area | null) { Object.assign(form, { id: area ? Number(area.id) : 0, slug: area?.slug || '', name: area?.name || '', color: area?.color || '#6b7280', is_active: area?.is_active ?? true }); }
function selectArea(area: Area) { selected.value = area; fill(area); }
function startCreate() { selected.value = { id: 0 } as Area; fill(null); }
async function save() {
  saving.value = true; error.value = '';
  try { const saved = isNew.value ? await api.createArea({ slug: form.slug, name: form.name, color: form.color, is_active: form.is_active }) : await api.updateArea(form.id, { slug: form.slug, name: form.name, color: form.color, is_active: form.is_active }); selected.value = saved; fill(saved); await load(); }
  catch (caught) { error.value = message(caught); }
  finally { saving.value = false; }
}
async function archive() { if (!selected.value) return; selected.value = await api.deleteArea(Number(selected.value.id)); fill(selected.value); await load(); }
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .toolbar, .layout { max-width: 76rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1.1rem; } p { color: #697586; margin-top: .25rem; } .layout { display: grid; grid-template-columns: minmax(0, 1fr) 24rem; gap: 1rem; align-items: start; } label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; } .check { display: flex; align-items: center; gap: .5rem; }
input, button, a { box-sizing: border-box; font: inherit; } input { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .6rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .76rem; text-transform: uppercase; } tr.selected { background: #eef2ff; } .right { text-align: right; } .swatch { display: inline-block; width: 1.2rem; height: 1.2rem; border-radius: 4px; border: 1px solid #cbd5df; }
.editor { display: grid; gap: .75rem; background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; } .editor header, .actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } .actions { justify-content: flex-end; } .error { max-width: 76rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
