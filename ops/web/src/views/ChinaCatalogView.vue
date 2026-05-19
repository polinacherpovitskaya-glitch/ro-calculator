<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>Каталог Китая</h1>
        <p>{{ china.catalog.length }} позиций</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/china">Закупки</RouterLink>
        <RouterLink to="/shipments">Приёмки</RouterLink>
        <button type="button" @click="showCreate = true">Добавить</button>
      </div>
    </header>

    <section class="toolbar">
      <label>
        Поиск
        <input v-model="china.catalogSearch" type="search" placeholder="Название или SKU" @keydown.enter="reload" />
      </label>
      <button type="button" @click="reload">Обновить</button>
    </section>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Название</th>
            <th>SKU</th>
            <th>Поставщик</th>
            <th class="right">Цена</th>
            <th>Валюта</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in china.catalog" :key="item.id">
            <td><input :value="item.name" @change="updateText(item.id, 'name', $event)" /></td>
            <td><input :value="item.sku || ''" @change="updateText(item.id, 'sku', $event)" /></td>
            <td><input :value="item.supplier || ''" @change="updateText(item.id, 'supplier', $event)" /></td>
            <td class="right">
              <input class="number" type="number" step="0.01" :value="item.last_price ?? ''" @change="updateNumber(item.id, $event)" />
            </td>
            <td><input :value="item.last_currency || ''" @change="updateText(item.id, 'last_currency', $event)" /></td>
          </tr>
          <tr v-if="china.catalog.length === 0">
            <td colspan="5">Пусто</td>
          </tr>
        </tbody>
      </table>
    </div>

    <dialog :open="showCreate" @close="showCreate = false">
      <form method="dialog" class="create-form" @submit.prevent="createItem">
        <header>
          <h2>Новая позиция</h2>
          <button type="button" aria-label="Закрыть" @click="showCreate = false">×</button>
        </header>
        <label>
          Название
          <input v-model="draft.name" required />
        </label>
        <label>
          SKU
          <input v-model="draft.sku" />
        </label>
        <label>
          Цена
          <input v-model.number="draft.last_price" type="number" min="0" step="0.01" />
        </label>
        <menu>
          <button type="button" @click="showCreate = false">Отмена</button>
          <button type="submit">Создать</button>
        </menu>
      </form>
    </dialog>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import * as chinaApi from '../api/china';
import { useChinaStore } from '../stores/china';

const china = useChinaStore();
const showCreate = ref(false);
const draft = reactive({ name: '', sku: '', last_price: null as number | null });
let searchTimer: number | undefined;

onMounted(() => {
  void china.loadCatalog();
});

watch(
  () => china.catalogSearch,
  () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void reload(), 250);
  }
);

async function reload() {
  await china.loadCatalog();
}

async function updateText(id: number, field: 'name' | 'sku' | 'supplier' | 'last_currency', event: Event) {
  const input = event.target as HTMLInputElement;
  const item = await chinaApi.updateCatalogItem(id, { [field]: input.value || null });
  china.catalog = china.catalog.map((existing) => (Number(existing.id) === Number(id) ? item : existing));
}

async function updateNumber(id: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const item = await chinaApi.updateCatalogItem(id, { last_price: input.value === '' ? null : Number(input.value) });
  china.catalog = china.catalog.map((existing) => (Number(existing.id) === Number(id) ? item : existing));
}

async function createItem() {
  const item = await chinaApi.createCatalogItem({
    name: draft.name,
    sku: draft.sku || null,
    last_price: draft.last_price,
    last_currency: 'CNY',
  });
  china.catalog = [item, ...china.catalog];
  draft.name = '';
  draft.sku = '';
  draft.last_price = null;
  showCreate.value = false;
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 1.5rem;
  background: #f6f7f9;
  color: #1f2933;
  font-family: system-ui, sans-serif;
}
.page-header,
.toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  max-width: 78rem;
  margin: 0 auto 1rem;
}
h1,
p {
  margin: 0;
}
h1 {
  font-size: 1.7rem;
}
p {
  margin-top: 0.25rem;
  color: #697586;
}
.header-actions,
.toolbar {
  display: flex;
  justify-content: flex-start;
  gap: 0.75rem;
}
label {
  display: grid;
  gap: 0.3rem;
  color: #52606d;
  font-size: 0.85rem;
}
input,
button,
a {
  font: inherit;
}
input {
  min-height: 2.25rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  background: #fff;
  padding: 0.45rem 0.55rem;
}
button,
.header-actions a {
  min-height: 2.25rem;
  border: 1px solid #aeb7c2;
  border-radius: 6px;
  background: #fff;
  color: #1f2933;
  padding: 0 0.75rem;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.header-actions button,
menu button[type='submit'] {
  border-color: #1d4f91;
  background: #1d4f91;
  color: #fff;
}
.table-wrap {
  max-width: 78rem;
  margin: 0 auto;
  overflow-x: auto;
  border: 1px solid #dde2e8;
  background: #fff;
}
table {
  width: 100%;
  min-width: 56rem;
  border-collapse: collapse;
}
th,
td {
  border-bottom: 1px solid #edf0f3;
  padding: 0.55rem 0.65rem;
  text-align: left;
}
th {
  color: #52606d;
  font-size: 0.78rem;
  text-transform: uppercase;
}
td input {
  width: 100%;
}
.number {
  width: 7rem;
}
.right {
  text-align: right;
}
dialog {
  width: min(32rem, calc(100vw - 2rem));
  border: 1px solid #c7cbd1;
  border-radius: 8px;
  padding: 0;
}
.create-form {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}
.create-form header,
menu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}
@media (max-width: 760px) {
  .page {
    padding: 1rem;
  }
  .page-header,
  .toolbar,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
