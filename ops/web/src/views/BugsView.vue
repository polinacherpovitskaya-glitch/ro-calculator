<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>Баги</h1>
        <p>{{ bugs.bugs.length }} записей</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/">Главная</RouterLink>
        <RouterLink to="/warehouse">Склад</RouterLink>
          <button type="button" @click="startCreate()">Новый баг</button>
      </div>
    </header>

    <section class="toolbar">
      <label>Поиск <input v-model="bugs.search" type="search" @keydown.enter="reload" /></label>
      <label>Статус
        <select v-model="bugs.status" @change="reload">
          <option value="">Все</option>
          <option value="open">Открыт</option>
          <option value="in_progress">В работе</option>
          <option value="fixed">Исправлен</option>
          <option value="wontfix">Не исправлять</option>
          <option value="duplicate">Дубль</option>
        </select>
      </label>
      <label>Важность
        <select v-model="bugs.severity" @change="reload">
          <option value="">Все</option>
          <option value="low">{{ severityLabel('low') }}</option>
          <option value="medium">{{ severityLabel('medium') }}</option>
          <option value="high">{{ severityLabel('high') }}</option>
          <option value="critical">{{ severityLabel('critical') }}</option>
        </select>
      </label>
      <label>Страница <input v-model="bugs.page" @keydown.enter="reload" /></label>
      <button type="button" :disabled="bugs.loading" @click="reload">Обновить</button>
    </section>

    <p v-if="bugs.error || error" class="error">{{ bugs.error || error }}</p>

    <section class="layout">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Баг</th><th>Страница</th><th>Статус</th><th>Важность</th><th>Файлы</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-if="bugs.loading"><td colspan="6">Загрузка...</td></tr>
            <tr v-for="bug in bugs.bugs" :key="bug.id" :class="{ selected: bugs.selected?.id === bug.id }">
              <td>
                <strong>{{ bug.title }}</strong>
                <span>{{ formatDate(bug.created_at) }}</span>
              </td>
              <td>{{ bug.page || '—' }}</td>
              <td><span class="pill" :class="bug.status">{{ statusLabel(bug.status) }}</span></td>
              <td><span class="severity" :class="bug.severity">{{ severityLabel(bug.severity) }}</span></td>
              <td>{{ bug.attachment_count || 0 }}</td>
              <td class="right"><button type="button" @click="openBug(bug.id)">Открыть</button></td>
            </tr>
            <tr v-if="!bugs.loading && bugs.bugs.length === 0"><td colspan="6">Пусто</td></tr>
          </tbody>
        </table>
      </div>

      <aside class="editor" v-if="isEditing">
        <header>
          <h2>{{ form.id ? 'Карточка бага' : 'Новый баг' }}</h2>
          <button type="button" @click="closeEditor">×</button>
        </header>

        <label>Заголовок <input v-model="form.title" /></label>
        <label>Описание <textarea v-model="form.description" rows="6" /></label>
        <div class="grid">
          <label>Статус
            <select v-model="form.status">
              <option value="open">Открыт</option>
              <option value="in_progress">В работе</option>
              <option value="fixed">Исправлен</option>
              <option value="wontfix">Не исправлять</option>
              <option value="duplicate">Дубль</option>
            </select>
          </label>
          <label>Важность
            <select v-model="form.severity">
              <option value="low">{{ severityLabel('low') }}</option>
              <option value="medium">{{ severityLabel('medium') }}</option>
              <option value="high">{{ severityLabel('high') }}</option>
              <option value="critical">{{ severityLabel('critical') }}</option>
            </select>
          </label>
        </div>
        <label>Страница <input v-model="form.page" /></label>
        <label>Автор <input v-model="form.reporter_name" /></label>

        <section v-if="form.id" class="attachments">
          <header>
            <h3>Вложения</h3>
            <label class="file-button">
              Добавить
              <input type="file" @change="uploadAttachment" />
            </label>
          </header>
          <div v-if="bugs.detailLoading">Загрузка...</div>
          <div v-for="attachment in bugs.selected?.attachments || []" :key="attachment.id" class="attachment-row">
            <a v-if="attachment.url" :href="attachment.url" target="_blank" rel="noreferrer">{{ attachment.filename }}</a>
            <span v-else>{{ attachment.filename }}</span>
            <button type="button" @click="removeAttachment(attachment.id)">Удалить</button>
          </div>
          <p v-if="!(bugs.selected?.attachments || []).length">Файлов нет</p>
        </section>

        <footer class="actions">
          <button v-if="form.id" type="button" @click="deleteBug">Удалить</button>
          <button type="button" :disabled="saving || !form.title.trim()" @click="saveBug">Сохранить</button>
        </footer>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { BugReport } from '../api/bugs';
import * as bugsApi from '../api/bugs';
import { useBugsStore } from '../stores/bugs';

const bugs = useBugsStore();
const route = useRoute();
const router = useRouter();
const error = ref('');
const saving = ref(false);
const isEditing = ref(false);
const form = reactive({
  id: 0,
  title: '',
  description: '',
  status: 'open' as BugReport['status'],
  severity: 'medium' as BugReport['severity'],
  page: '',
  reporter_name: '',
});
let searchTimer: number | undefined;

onMounted(async () => {
  await bugs.loadBugs();
  if (route.name === 'bug-new') startCreate(false);
});
watch(() => bugs.search, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void reload(), 250); });

async function reload() { await bugs.loadBugs(); }
function statusLabel(value: string) {
  return { open: 'Открыт', in_progress: 'В работе', fixed: 'Исправлен', wontfix: 'Не исправлять', duplicate: 'Дубль' }[value] || value;
}
function severityLabel(value: string) {
  return { low: 'Низкая', medium: 'Средняя', high: 'Высокая', critical: 'Критическая' }[value] || value;
}
function formatDate(value: string) { return value ? new Date(value).toLocaleDateString('ru-RU') : ''; }
function fillForm(bug: BugReport | null) {
  Object.assign(form, {
    id: bug ? Number(bug.id) : 0,
    title: bug?.title || '',
    description: bug?.description || '',
    status: bug?.status || 'open',
    severity: bug?.severity || 'medium',
    page: bug?.page || '',
    reporter_name: bug?.reporter_name || '',
  });
}
async function openBug(id: number) {
  const bug = await bugs.loadBug(Number(id));
  fillForm(bug);
  isEditing.value = true;
}
function startCreate(updateRoute = true) {
  bugs.selected = null;
  fillForm(null);
  isEditing.value = true;
  if (updateRoute && route.name !== 'bug-new') void router.push('/bugs/new');
}
function closeEditor() {
  isEditing.value = false;
  bugs.selected = null;
  if (route.name === 'bug-new') void router.push('/bugs');
}
async function saveBug() {
  if (!form.title.trim()) return;
  saving.value = true; error.value = '';
  const wasNew = !form.id;
  const payload = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    status: form.status,
    severity: form.severity,
    page: form.page.trim() || null,
    reporter_name: form.reporter_name.trim() || null,
  };
  try {
    const saved = form.id ? await bugs.updateBug(form.id, payload) : await bugs.createBug(payload);
    if (wasNew && route.name === 'bug-new') await router.replace('/bugs');
    await openBug(Number(saved.id));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось сохранить баг';
  } finally {
    saving.value = false;
  }
}
async function deleteBug() {
  if (!form.id || !window.confirm('Удалить баг?')) return;
  try {
    await bugs.deleteBug(form.id);
    closeEditor();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось удалить баг';
  }
}
async function uploadAttachment(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !form.id) return;
  try {
    await bugsApi.uploadBugAttachment(form.id, file);
    await openBug(form.id);
    await reload();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить файл';
  }
}
async function removeAttachment(id: number) {
  if (!form.id) return;
  await bugsApi.deleteBugAttachment(form.id, id);
  await openBug(form.id);
  await reload();
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 1.5rem; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
.page-header, .toolbar, .layout { max-width: 78rem; margin: 0 auto 1rem; }
.page-header, .header-actions, .toolbar { display: flex; align-items: end; justify-content: space-between; gap: .75rem; }
.header-actions, .toolbar { justify-content: flex-start; flex-wrap: wrap; }
h1, h2, h3, p { margin: 0; } h1 { font-size: 1.7rem; } h2 { font-size: 1.1rem; } h3 { font-size: .95rem; } p, td span { color: #697586; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 26rem; gap: 1rem; align-items: start; }
label { display: grid; gap: .3rem; color: #52606d; font-size: .85rem; }
input, select, textarea, button, a { box-sizing: border-box; font: inherit; }
input, select, textarea { min-height: 2.25rem; border: 1px solid #cbd5df; border-radius: 6px; padding: .35rem .55rem; background: white; }
textarea { resize: vertical; }
button, a, .file-button { display: inline-flex; align-items: center; min-height: 2.25rem; border: 1px solid #b8c2cc; border-radius: 6px; background: white; padding: 0 .75rem; color: #1f2933; text-decoration: none; cursor: pointer; }
table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9e2ec; }
th, td { padding: .65rem; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: top; }
th { color: #52606d; font-size: .78rem; text-transform: uppercase; }
td strong, td span { display: block; }
tr.selected { background: #eef2ff; }
.right { text-align: right; }
.editor { display: grid; gap: .75rem; background: white; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; }
.editor header, .attachments header, .actions, .attachment-row { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.pill, .severity { display: inline-flex; min-height: 1.5rem; align-items: center; border-radius: 999px; padding: 0 .5rem; font-size: .78rem; color: #243b53; background: #eef2f6; }
.fixed { background: #dff7e7; } .in_progress { background: #fff3c4; } .critical { background: #ffd6d6; } .high { background: #ffe8cc; }
.attachments { display: grid; gap: .5rem; border-top: 1px solid #eef2f6; padding-top: .75rem; }
.file-button input { display: none; }
.actions { justify-content: flex-end; flex-wrap: wrap; }
.error { max-width: 78rem; margin: 0 auto 1rem; color: #b42318; }
@media (max-width: 900px) { .layout, .grid { grid-template-columns: 1fr; } }
</style>
