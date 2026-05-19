import { ref } from 'vue';
import { defineStore } from 'pinia';
import * as marketplacesApi from '../api/marketplaces';
import type { MarketplaceInput, MarketplacePatch, MarketplaceSet } from '../api/marketplaces';

export const useMarketplacesStore = defineStore('marketplaces', () => {
  const sets = ref<MarketplaceSet[]>([]);
  const loading = ref(false);
  const error = ref('');
  const search = ref('');
  const marketplace = ref('');

  async function loadSets() {
    loading.value = true;
    error.value = '';
    try {
      sets.value = await marketplacesApi.listMarketplaceSets({ search: search.value.trim(), marketplace: marketplace.value });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить наборы';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function createSet(input: MarketplaceInput) {
    const set = await marketplacesApi.createMarketplaceSet(input);
    sets.value = [set, ...sets.value].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return set;
  }

  async function updateSet(id: number, patch: MarketplacePatch) {
    const set = await marketplacesApi.updateMarketplaceSet(id, patch);
    sets.value = sets.value.map((existing) => (Number(existing.id) === Number(id) ? set : existing));
    return set;
  }

  async function deleteSet(id: number) {
    await marketplacesApi.deleteMarketplaceSet(id);
    sets.value = sets.value.filter((set) => Number(set.id) !== Number(id));
  }

  return { sets, loading, error, search, marketplace, loadSets, createSet, updateSet, deleteSet };
});
