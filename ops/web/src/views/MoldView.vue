<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>{{ form.name || 'Молд' }}</h1>
        <p>{{ form.status }} · {{ form.usage_count }} использований</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/molds">Молды</RouterLink>
        <RouterLink to="/warehouse/history">Журнал</RouterLink>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="panel">
      <div v-if="form.photo_url" class="photo-preview">
        <img :src="form.photo_url" :alt="form.name || 'Фото молда'" />
      </div>
      <div class="grid">
        <label>Название <input v-model="form.name" /></label>
        <label>Тип <input v-model="form.type" /></label>
        <label>
          Статус
          <select v-model="form.status">
            <option value="active">active</option>
            <option value="retired">retired</option>
            <option value="broken">broken</option>
          </select>
        </label>
        <label>Лимит <input v-model.number="form.usage_limit" type="number" min="0" /></label>
        <label class="wide">Фото URL <input v-model="form.photo_url" /></label>
        <label class="wide">Заметка <textarea v-model="form.note" rows="2" /></label>
      </div>
      <footer class="actions"><button type="button" :disabled="saving" @click="saveMold">Сохранить</button></footer>
    </section>

    <section class="panel">
      <header class="section-header">
        <h2>Фурнитура</h2>
        <button type="button" @click="addHardware">Добавить</button>
      </header>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Склад</th><th>На использование</th><th>Остаток</th><th>Заметка</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in hardwareDraft" :key="index">
              <td>
                <select v-model.number="item.warehouse_item_id">
                  <option :value="0">Выбрать</option>
                  <option v-for="warehouseItem in warehouse.items" :key="warehouseItem.id" :value="warehouseItem.id">{{ warehouseItem.name }}</option>
                </select>
              </td>
              <td><input v-model.number="item.qty_per_use" class="number" type="number" min="0.01" step="0.01" /></td>
              <td>{{ warehouseQty(item.warehouse_item_id) }}</td>
              <td><input v-model="item.note" /></td>
              <td class="right"><button type="button" @click="hardwareDraft.splice(index, 1)">Удалить</button></td>
            </tr>
            <tr v-if="hardwareDraft.length === 0"><td colspan="5">Нет привязок</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="actions"><button type="button" :disabled="saving" @click="saveHardware">Сохранить фурнитуру</button></footer>
    </section>

    <section class="panel">
      <header class="section-header"><h2>Использование</h2></header>
      <div class="grid">
        <label>Единиц <input v-model.number="useDraft.units" type="number" min="1" /></label>
        <label>Оператор <input v-model="useDraft.operator_name" /></label>
        <label>Заказ <input v-model.number="useDraft.order_id" type="number" min="1" /></label>
        <label class="wide">Заметка <textarea v-model="useDraft.note" rows="2" /></label>
      </div>
      <footer class="actions"><button type="button" :disabled="saving" @click="useMold">Зафиксировать</button></footer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import * as moldsApi from '../api/molds';
import { useWarehouseStore } from '../stores/warehouse';

const route = useRoute();
const warehouse = useWarehouseStore();
const saving = ref(false);
const error = ref('');
const form = reactive({
  id: 0,
  name: '',
  type: '',
  status: 'active',
  usage_count: 0,
  usage_limit: null as number | null,
  photo_url: '',
  note: '',
});
const hardwareDraft = ref<Array<{ warehouse_item_id: number; qty_per_use: number; note: string }>>([]);
const useDraft = reactive({ units: 1, operator_name: '', order_id: null as number | null, note: '' });

onMounted(async () => {
  await Promise.all([warehouse.loadItems(), loadMold()]);
});

async function loadMold() {
  const id = Number(route.params.id);
  const [mold, hardware] = await Promise.all([moldsApi.getMold(id), moldsApi.listHardware(id)]);
  Object.assign(form, {
    id: Number(mold.id),
    name: mold.name,
    type: mold.type || '',
    status: mold.status,
    usage_count: mold.usage_count,
    usage_limit: mold.usage_limit,
    photo_url: mold.photo_url || '',
    note: mold.note || '',
  });
  hardwareDraft.value = hardware.map((item) => ({
    warehouse_item_id: Number(item.warehouse_item_id || 0),
    qty_per_use: Number(item.qty_per_use),
    note: item.note || '',
  }));
}

function addHardware() {
  hardwareDraft.value.push({ warehouse_item_id: 0, qty_per_use: 1, note: '' });
}

function warehouseQty(id: number) {
  const item = warehouse.items.find((entry) => Number(entry.id) === Number(id));
  return item ? item.qty : '—';
}

async function saveMold() {
  saving.value = true;
  error.value = '';
  try {
    const mold = await moldsApi.updateMold(form.id, {
      name: form.name,
      type: form.type || null,
      status: form.status,
      usage_limit: form.usage_limit,
      photo_url: form.photo_url || null,
      note: form.note || null,
    });
    form.usage_count = mold.usage_count;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить молд';
  } finally {
    saving.value = false;
  }
}

async function saveHardware() {
  saving.value = true;
  error.value = '';
  try {
    await moldsApi.replaceHardware(
      form.id,
      hardwareDraft.value.filter((item) => item.warehouse_item_id).map((item) => ({
        warehouse_item_id: item.warehouse_item_id,
        qty_per_use: item.qty_per_use,
        note: item.note || null,
      }))
    );
    await loadMold();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить фурнитуру';
  } finally {
    saving.value = false;
  }
}

async function useMold() {
  if (!window.confirm('Списать фурнитуру по этому молду?')) return;
  saving.value = true;
  error.value = '';
  try {
    const mold = await moldsApi.useMold(form.id, {
      units: useDraft.units,
      operator_name: useDraft.operator_name || null,
      order_id: useDraft.order_id,
      note: useDraft.note || null,
    });
    form.usage_count = mold.usage_count;
    await warehouse.loadItems();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось зафиксировать использование';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .panel { max-width: 78rem; margin: 0 auto 1rem; }
.page-header, .header-actions, .section-header, .actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.header-actions { flex-wrap: wrap; justify-content: flex-start; } h1, h2, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1.1rem; } p { color: #697586; margin-top: .25rem; }
.panel { background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; } .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .8rem; } .wide { grid-column: 1 / -1; }
label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; } input, select, textarea, button, a { box-sizing: border-box; font: inherit; } input, select, textarea { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; }
button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
.photo-preview { width: min(22rem, 100%); aspect-ratio: 4 / 3; margin-bottom: 1rem; border-radius: 8px; overflow: hidden; background: #eef2f6; border: 1px solid #d9e2ec; }
.photo-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
table { width: 100%; border-collapse: collapse; } th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; } th { color: #52606d; font-size: .78rem; text-transform: uppercase; } td input, td select { width: 100%; min-width: 8rem; } .number { max-width: 7rem; } .right { text-align: right; } .actions { justify-content: flex-end; margin-top: 1rem; } .error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
</style>
