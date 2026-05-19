import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import * as warehouseApi from '../api/warehouse';
import type { WarehouseItem, WarehouseItemInput, WarehouseItemPatch } from '../api/warehouse';

export const useWarehouseStore = defineStore('warehouse', () => {
  const items = ref<WarehouseItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const search = ref('');
  const category = ref('');

  const categories = computed(() => {
    const values = new Set(items.value.map((item) => item.category).filter(Boolean) as string[]);
    return [...values].sort((a, b) => a.localeCompare(b, 'ru'));
  });

  async function loadItems() {
    loading.value = true;
    error.value = '';
    try {
      items.value = await warehouseApi.listItems({
        search: search.value.trim(),
        category: category.value,
      });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить склад';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function createItem(input: WarehouseItemInput) {
    const item = await warehouseApi.createItem(input);
    items.value = [item, ...items.value].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return item;
  }

  async function updateItem(id: number, patch: WarehouseItemPatch) {
    const item = await warehouseApi.updateItem(id, patch);
    items.value = items.value.map((existing) => (existing.id === id ? item : existing));
    return item;
  }

  async function deleteItem(id: number) {
    await warehouseApi.deleteItem(id);
    items.value = items.value.filter((item) => item.id !== id);
  }

  return {
    items,
    loading,
    error,
    search,
    category,
    categories,
    loadItems,
    createItem,
    updateItem,
    deleteItem,
  };
});
