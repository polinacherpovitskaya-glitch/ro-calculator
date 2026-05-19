import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import * as moldsApi from '../api/molds';
import type { Mold, MoldInput, MoldPatch } from '../api/molds';

export const useMoldsStore = defineStore('molds', () => {
  const molds = ref<Mold[]>([]);
  const loading = ref(false);
  const error = ref('');
  const search = ref('');
  const status = ref('');

  const activeCount = computed(() => molds.value.filter((mold) => mold.status === 'active').length);

  async function loadMolds() {
    loading.value = true;
    error.value = '';
    try {
      molds.value = await moldsApi.listMolds({ search: search.value.trim(), status: status.value });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить молды';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function createMold(input: MoldInput) {
    const mold = await moldsApi.createMold(input);
    molds.value = [mold, ...molds.value].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return mold;
  }

  async function updateMold(id: number, patch: MoldPatch) {
    const mold = await moldsApi.updateMold(id, patch);
    molds.value = molds.value.map((existing) => (Number(existing.id) === Number(id) ? mold : existing));
    return mold;
  }

  async function deleteMold(id: number) {
    await moldsApi.deleteMold(id);
    molds.value = molds.value.filter((mold) => Number(mold.id) !== Number(id));
  }

  return { molds, loading, error, search, status, activeCount, loadMolds, createMold, updateMold, deleteMold };
});
