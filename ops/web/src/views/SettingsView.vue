<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>Настройки</h1>
        <p>Служебные параметры staging-системы</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/">Главная</RouterLink>
        <button type="button" :disabled="loading || !isAdmin" @click="load">Обновить</button>
      </div>
    </header>

    <p v-if="!isAdmin" class="error">Доступ только для admin.</p>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="isAdmin" class="layout">
      <aside class="keys">
        <button v-for="row in settingRows" :key="row.key" type="button" :class="{ active: row.key === selectedKey }" @click="select(row.key)">
          <span>{{ row.key }}</span>
          <small>{{ String(row.updated_at || '').slice(0, 10) }}</small>
        </button>
        <p v-if="loading" class="keys-empty">Загрузка...</p>
        <p v-else-if="settingRows.length === 0" class="keys-empty">Ключи не найдены</p>
      </aside>

      <section class="editor">
        <div class="editor-head">
          <label>Ключ <input v-model="selectedKey" placeholder="app_config" /></label>
          <button type="button" :disabled="saving || !selectedKey" @click="save">{{ saving ? 'Сохраняем...' : 'Сохранить' }}</button>
        </div>
        <textarea v-model="draft" spellcheck="false"></textarea>
        <p v-if="parseError" class="error">{{ parseError }}</p>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ApiError } from '../api';
import type { SettingRow } from '../api/settings';
import { listSettings, putSetting } from '../api/settings';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const isAdmin = computed(() => auth.user?.role === 'admin');
const settings = ref<SettingRow[]>([]);
const settingRows = computed(() => (Array.isArray(settings.value) ? settings.value : []));
const selectedKey = ref('');
const draft = ref('{}');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const parseError = ref('');

onMounted(() => {
  if (isAdmin.value) void load();
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    settings.value = await listSettings();
    if (!Array.isArray(settings.value)) settings.value = [];
    if (!selectedKey.value && settingRows.value[0]) select(settingRows.value[0].key);
  } catch (caught) {
    const apiError = caught as Partial<ApiError>;
    error.value = apiError.message || 'Не удалось загрузить настройки';
  } finally {
    loading.value = false;
  }
}

function select(key: string) {
  selectedKey.value = key;
  const row = settingRows.value.find((item) => item.key === key);
  draft.value = JSON.stringify(row?.value ?? {}, null, 2);
  parseError.value = '';
}

async function save() {
  parseError.value = '';
  let value: unknown;
  try {
    value = JSON.parse(draft.value);
  } catch (caught) {
    parseError.value = caught instanceof Error ? caught.message : 'Некорректный JSON';
    return;
  }

  saving.value = true;
  error.value = '';
  try {
    const saved = await putSetting(selectedKey.value, value);
    const index = settingRows.value.findIndex((row) => row.key === saved.key);
    if (!Array.isArray(settings.value)) settings.value = [];
    if (index >= 0) settings.value.splice(index, 1, saved);
    else settings.value.push(saved);
    settings.value.sort((a, b) => a.key.localeCompare(b.key));
    select(saved.key);
  } catch (caught) {
    const apiError = caught as Partial<ApiError>;
    error.value = apiError.message || 'Не удалось сохранить настройку';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .layout, .error { max-width: 88rem; margin-left: auto; margin-right: auto; }
.page-header, .header-actions, .editor-head { display: flex; align-items: end; justify-content: space-between; gap: .75rem; }
.header-actions { justify-content: flex-start; flex-wrap: wrap; }
.page-header { margin-bottom: 1rem; }
h1, p { margin: 0; }
h1 { font-size: 1.7rem; }
p { color: #697586; margin-top: .25rem; }
button, a, input, textarea { box-sizing: border-box; font: inherit; }
button, a { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
button:disabled { cursor: wait; opacity: .6; }
.layout { display: grid; grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr); gap: 1rem; }
.keys, .editor { border: 1px solid #d9e2ec; border-radius: 8px; background: white; padding: 1rem; }
.keys { display: grid; align-content: start; gap: .45rem; }
.keys button { justify-content: space-between; gap: .75rem; min-height: 2.6rem; }
.keys button.active { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
.keys span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.keys small { color: #697586; }
.keys-empty { margin: 0; color: #697586; font-size: .9rem; }
.editor { display: grid; gap: .8rem; }
.editor-head { align-items: end; }
label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; flex: 1; }
input { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; }
textarea { width: 100%; min-height: 32rem; resize: vertical; border: 1px solid #cbd5df; border-radius: 6px; padding: .8rem; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .86rem; line-height: 1.5; }
.error { margin-bottom: 1rem; color: #b42318; }
@media (max-width: 840px) { .layout { grid-template-columns: 1fr; } }
</style>
