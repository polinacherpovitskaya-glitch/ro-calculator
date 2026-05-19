<template>
  <main class="page">
    <header class="page-header">
      <div><h1>Маркетплейсы</h1><p>{{ marketplaces.sets.length }} наборов</p></div>
      <div class="header-actions"><RouterLink to="/">Главная</RouterLink><RouterLink to="/warehouse">Склад</RouterLink><button type="button" @click="startCreate">Новый набор</button></div>
    </header>

    <section class="toolbar">
      <label>Поиск <input v-model="marketplaces.search" type="search" @keydown.enter="reload" /></label>
      <label>Площадка <input v-model="marketplaces.marketplace" @keydown.enter="reload" /></label>
      <button type="button" :disabled="marketplaces.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="marketplaces.error || error" class="error">{{ marketplaces.error || error }}</p>

    <section class="layout">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Название</th><th>Площадка</th><th>SKU</th><th>Цена</th><th>Состав</th><th></th></tr></thead>
          <tbody>
            <tr v-if="marketplaces.loading"><td colspan="6">Загрузка...</td></tr>
            <tr v-for="set in marketplaces.sets" :key="set.id" :class="{ selected: selected?.id === set.id }">
              <td>{{ set.name }}</td>
              <td>{{ set.marketplace || '—' }}</td>
              <td>{{ set.sku || '—' }}</td>
              <td>{{ price(set.price, set.currency) }}</td>
              <td>{{ set.composition.length }}</td>
              <td class="right"><button type="button" @click="selectSet(set)">Открыть</button></td>
            </tr>
            <tr v-if="!marketplaces.loading && marketplaces.sets.length === 0"><td colspan="6">Пусто</td></tr>
          </tbody>
        </table>
      </div>

      <aside class="editor" v-if="selected">
        <header><h2>{{ isNew ? 'Новый набор' : selected.name }}</h2><button type="button" @click="selected = null">×</button></header>
        <label>Название <input v-model="form.name" /></label>
        <label>Площадка <input v-model="form.marketplace" /></label>
        <label>SKU <input v-model="form.sku" /></label>
        <label>Цена <input v-model.number="form.price" type="number" step="0.01" /></label>
        <label>Валюта <input v-model="form.currency" /></label>
        <label class="check"><input v-model="form.is_active" type="checkbox" /> Активен</label>

        <section class="composition">
          <header><h3>Состав</h3><button type="button" @click="addComposition">Добавить</button></header>
          <div v-for="(item, index) in form.composition" :key="index" class="composition-row">
            <select v-model.number="item.warehouse_item_id">
              <option :value="0">Складская позиция</option>
              <option v-for="warehouseItem in warehouse.items" :key="warehouseItem.id" :value="warehouseItem.id">{{ warehouseItem.name }}</option>
            </select>
            <input v-model.number="item.qty" type="number" min="0.01" step="0.01" />
            <button type="button" @click="form.composition.splice(index, 1)">Удалить</button>
          </div>
        </section>

        <footer class="actions">
          <button v-if="!isNew" type="button" @click="sell">Продажа</button>
          <button v-if="!isNew" type="button" @click="deleteSet">Удалить</button>
          <button type="button" :disabled="saving" @click="saveSet">Сохранить</button>
        </footer>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { MarketplaceSet } from '../api/marketplaces';
import * as marketplacesApi from '../api/marketplaces';
import { useMarketplacesStore } from '../stores/marketplaces';
import { useWarehouseStore } from '../stores/warehouse';

const marketplaces = useMarketplacesStore();
const warehouse = useWarehouseStore();
const selected = ref<MarketplaceSet | null>(null);
const saving = ref(false);
const error = ref('');
const form = reactive({ id: 0, name: '', marketplace: '', sku: '', price: null as number | null, currency: 'RUB', is_active: true, composition: [] as Array<{ warehouse_item_id: number; qty: number }> });
const isNew = computed(() => form.id === 0);
let searchTimer: number | undefined;

onMounted(async () => { await Promise.all([marketplaces.loadSets(), warehouse.loadItems()]); });
watch(() => marketplaces.search, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void reload(), 250); });
async function reload() { await marketplaces.loadSets(); }
function price(value: number | null, currency: string | null) { return value === null ? '—' : `${value} ${currency || ''}`.trim(); }
function fillForm(set: MarketplaceSet | null) {
  Object.assign(form, {
    id: set ? Number(set.id) : 0,
    name: set?.name || '',
    marketplace: set?.marketplace || '',
    sku: set?.sku || '',
    price: set?.price ?? null,
    currency: set?.currency || 'RUB',
    is_active: set?.is_active ?? true,
    composition: (set?.composition || []).map((item) => ({ warehouse_item_id: Number(item.warehouse_item_id), qty: Number(item.qty) })),
  });
}
function selectSet(set: MarketplaceSet) { selected.value = set; fillForm(set); }
function startCreate() { selected.value = { id: 0, name: '', marketplace: null, sku: null, price: null, currency: 'RUB', composition: [], is_active: true }; fillForm(null); }
function addComposition() { form.composition.push({ warehouse_item_id: 0, qty: 1 }); }
async function saveSet() {
  saving.value = true; error.value = '';
  const payload = { name: form.name, marketplace: form.marketplace || null, sku: form.sku || null, price: form.price, currency: form.currency || null, is_active: form.is_active, composition: form.composition.filter((item) => item.warehouse_item_id && item.qty > 0) };
  try {
    const saved = isNew.value ? await marketplaces.createSet(payload) : await marketplaces.updateSet(form.id, payload);
    selected.value = saved; fillForm(saved);
  } catch (caught) { error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить набор'; }
  finally { saving.value = false; }
}
async function deleteSet() {
  if (!selected.value || !window.confirm('Удалить набор?')) return;
  await marketplaces.deleteSet(Number(selected.value.id));
  selected.value = null;
}
async function sell() {
  if (!selected.value) return;
  const qty = Number(window.prompt('Количество наборов к списанию', '1') || 0);
  if (!qty) return;
  try { await marketplacesApi.sellMarketplaceSet(Number(selected.value.id), { qty }); await warehouse.loadItems(); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : 'Не удалось списать набор'; }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; } .page-header, .toolbar, .layout { max-width: 78rem; margin: 0 auto 1rem; } .page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; } .header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, h3, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1.1rem; } h3 { font-size: .95rem; } p { color: #697586; margin-top: .25rem; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 24rem; gap: 1rem; align-items: start; } label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; } .check { display: flex; align-items: center; gap: .5rem; }
input, select, button, a { box-sizing: border-box; font: inherit; } input, select { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; } button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .78rem; text-transform: uppercase; } tr.selected { background: #eef2ff; } .right { text-align: right; }
.editor { display: grid; gap: .75rem; background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; } .editor header, .composition header, .actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; } .composition-row { display: grid; grid-template-columns: minmax(0, 1fr) 5rem auto; gap: .5rem; margin-top: .5rem; } .actions { justify-content: flex-end; flex-wrap: wrap; } .error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
