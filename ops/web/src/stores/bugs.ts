import { ref } from 'vue';
import { defineStore } from 'pinia';
import * as bugsApi from '../api/bugs';
import type { BugInput, BugPatch, BugReport } from '../api/bugs';

export const useBugsStore = defineStore('bugs', () => {
  const bugs = ref<BugReport[]>([]);
  const selected = ref<BugReport | null>(null);
  const loading = ref(false);
  const detailLoading = ref(false);
  const error = ref('');
  const search = ref('');
  const status = ref('open');
  const severity = ref('');
  const page = ref('');

  async function loadBugs() {
    loading.value = true;
    error.value = '';
    try {
      bugs.value = await bugsApi.listBugs({
        search: search.value.trim(),
        status: status.value,
        severity: severity.value,
        page: page.value.trim(),
      });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить баги';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function loadBug(id: number) {
    detailLoading.value = true;
    error.value = '';
    try {
      selected.value = await bugsApi.getBug(id);
      return selected.value;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить баг';
      throw caught;
    } finally {
      detailLoading.value = false;
    }
  }

  async function createBug(input: BugInput) {
    const bug = await bugsApi.createBug(input);
    bugs.value = [bug, ...bugs.value];
    selected.value = bug;
    return bug;
  }

  async function updateBug(id: number, patch: BugPatch) {
    const bug = await bugsApi.updateBug(id, patch);
    bugs.value = bugs.value.map((existing) => (Number(existing.id) === Number(id) ? { ...existing, ...bug } : existing));
    selected.value = selected.value && Number(selected.value.id) === Number(id) ? { ...selected.value, ...bug } : selected.value;
    return bug;
  }

  async function deleteBug(id: number) {
    await bugsApi.deleteBug(id);
    bugs.value = bugs.value.filter((bug) => Number(bug.id) !== Number(id));
    if (selected.value && Number(selected.value.id) === Number(id)) selected.value = null;
  }

  return {
    bugs,
    selected,
    loading,
    detailLoading,
    error,
    search,
    status,
    severity,
    page,
    loadBugs,
    loadBug,
    createBug,
    updateBug,
    deleteBug,
  };
});
