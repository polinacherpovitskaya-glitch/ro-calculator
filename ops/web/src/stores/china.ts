import { ref } from 'vue';
import { defineStore } from 'pinia';
import * as chinaApi from '../api/china';
import type { ChinaCatalogItem, ChinaPurchase, ChinaPurchaseInput } from '../api/china';

export const useChinaStore = defineStore('china', () => {
  const purchases = ref<ChinaPurchase[]>([]);
  const catalog = ref<ChinaCatalogItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const status = ref('');
  const catalogSearch = ref('');

  async function loadPurchases() {
    loading.value = true;
    error.value = '';
    try {
      purchases.value = await chinaApi.listPurchases({ status: status.value });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить закупки';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function createPurchase(input: ChinaPurchaseInput) {
    const purchase = await chinaApi.createPurchase(input);
    purchases.value = [purchase, ...purchases.value];
    return purchase;
  }

  async function loadCatalog() {
    catalog.value = await chinaApi.listCatalog({ search: catalogSearch.value.trim() });
  }

  return { purchases, catalog, loading, error, status, catalogSearch, loadPurchases, createPurchase, loadCatalog };
});
