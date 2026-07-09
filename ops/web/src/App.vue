<template>
  <router-view v-if="!showShell" />
  <div v-else class="ops-shell">
    <aside class="ops-sidebar">
      <div class="ops-brand">
        <strong>Recycle Object</strong>
        <span>Ops staging</span>
      </div>
      <nav class="ops-nav" aria-label="Основная навигация">
        <div v-for="section in navSections" :key="section.title" class="ops-nav-section">
          <div class="ops-nav-title">{{ section.title }}</div>
          <RouterLink v-for="item in section.items" :key="item.to" :to="item.to">
            <span class="ops-nav-icon" aria-hidden="true">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>
        <div class="ops-nav-section">
          <button type="button" @click="handleLogout">
            <span class="ops-nav-icon" aria-hidden="true">↩</span>
            <span>Выйти</span>
          </button>
        </div>
      </nav>
    </aside>
    <div class="ops-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const showShell = computed(() => auth.isLoggedIn && route.name !== 'login' && route.name !== 'change-password');
const navSections = computed(() => [
  {
    title: 'Каждый день',
    items: [
      { to: '/tasks', label: 'Задачи', icon: '☑' },
      { to: '/orders', label: 'Заказы', icon: '☰' },
      { to: '/analytics', label: 'Аналитика', icon: '◈' },
    ],
  },
  {
    title: 'Производство',
    items: [
      { to: '/production/calendar', label: 'Производственный календарь', icon: '▦' },
      { to: '/production/plan', label: 'План', icon: '▤' },
      { to: '/warehouse', label: 'Склад', icon: '▣' },
      { to: '/shipments', label: 'Приёмки', icon: '⇣' },
      { to: '/china', label: 'Китай', icon: '▥' },
      { to: '/time-tracking', label: 'Часы', icon: '◷' },
    ],
  },
  {
    title: 'Справочники',
    items: [
      { to: '/molds', label: 'Молды', icon: '◆' },
      { to: '/blanks', label: 'Бланки', icon: '◇' },
      { to: '/colors', label: 'Цвета', icon: '●' },
      { to: '/marketplaces', label: 'Маркетплейсы', icon: '◌' },
      { to: '/templates', label: 'Шаблоны', icon: '▧' },
      { to: '/indirect-costs', label: 'Косвенные', icon: '∑' },
    ],
  },
  {
    title: 'Управление',
    items: [
      { to: '/projects', label: 'Проекты', icon: '▨' },
      { to: '/areas', label: 'Области', icon: '□' },
      { to: '/gantt', label: 'Гант', icon: '▭' },
      { to: '/bugs', label: 'Баги', icon: '!' },
      { to: '/vacations', label: 'Отпуска', icon: '◐' },
      { to: '/payroll', label: 'Зарплаты', icon: '₽' },
      ...(auth.user?.role === 'admin' ? [{ to: '/settings', label: 'Настройки', icon: '⚙' }] : []),
    ],
  },
]);

async function handleLogout() {
  await auth.logout();
  await router.push('/login');
}
</script>
