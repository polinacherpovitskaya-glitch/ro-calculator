import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import * as colorsApi from '../api/colors';
import type { AppColor, ColorInput, ColorPatch } from '../api/colors';

export const useColorsStore = defineStore('colors', () => {
  const colors = ref<AppColor[]>([]);
  const loading = ref(false);
  const error = ref('');
  const search = ref('');
  const category = ref('');

  const categories = computed(() => [...new Set(colors.value.map((color) => color.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'ru')));

  async function loadColors() {
    loading.value = true;
    error.value = '';
    try {
      colors.value = await colorsApi.listColors({ search: search.value.trim(), category: category.value });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить цвета';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function createColor(input: ColorInput) {
    const color = await colorsApi.createColor(input);
    colors.value = [color, ...colors.value].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return color;
  }

  async function updateColor(id: number, patch: ColorPatch) {
    const color = await colorsApi.updateColor(id, patch);
    colors.value = colors.value.map((existing) => (Number(existing.id) === Number(id) ? color : existing));
    return color;
  }

  async function deleteColor(id: number) {
    await colorsApi.deleteColor(id);
    colors.value = colors.value.filter((color) => Number(color.id) !== Number(id));
  }

  return { colors, loading, error, search, category, categories, loadColors, createColor, updateColor, deleteColor };
});
