import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import * as blanksApi from '../api/blanks';
import type { Blank, BlankInput, BlankKind, BlankPatch } from '../api/blanks';

export const useBlanksStore = defineStore('blanks', () => {
  const kind = ref<BlankKind>('hardware');
  const blanks = ref<Blank[]>([]);
  const loading = ref(false);
  const error = ref('');
  const search = ref('');
  const category = ref('');

  const categories = computed(() => [...new Set(blanks.value.map((blank) => blank.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'ru')));

  async function loadBlanks() {
    loading.value = true;
    error.value = '';
    try {
      blanks.value = await blanksApi.listBlanks(kind.value, { search: search.value.trim(), category: category.value });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить бланки';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function createBlank(input: BlankInput) {
    const blank = await blanksApi.createBlank(kind.value, input);
    blanks.value = [blank, ...blanks.value].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return blank;
  }

  async function updateBlank(id: number, patch: BlankPatch) {
    const blank = await blanksApi.updateBlank(kind.value, id, patch);
    blanks.value = blanks.value.map((existing) => (Number(existing.id) === Number(id) ? blank : existing));
    return blank;
  }

  async function deleteBlank(id: number) {
    await blanksApi.deleteBlank(kind.value, id);
    blanks.value = blanks.value.filter((blank) => Number(blank.id) !== Number(id));
  }

  return { kind, blanks, loading, error, search, category, categories, loadBlanks, createBlank, updateBlank, deleteBlank };
});
