<template>
  <main class="placeholder">
    <header>
      <div>
        <h1>RO Ops - staging</h1>
        <p>Привет, {{ auth.user?.email }}</p>
      </div>
      <nav>
        <RouterLink to="/warehouse">Склад</RouterLink>
        <RouterLink to="/shipments">Приёмки</RouterLink>
        <RouterLink to="/china">Китай</RouterLink>
        <RouterLink to="/molds">Молды</RouterLink>
        <RouterLink to="/blanks">Бланки</RouterLink>
        <RouterLink to="/colors">Цвета</RouterLink>
        <RouterLink to="/marketplaces">Маркетплейсы</RouterLink>
        <RouterLink to="/bugs">Баги</RouterLink>
        <RouterLink to="/orders">Заказы</RouterLink>
        <RouterLink to="/tasks">Задачи</RouterLink>
        <RouterLink to="/projects">Проекты</RouterLink>
        <RouterLink to="/areas">Области</RouterLink>
        <RouterLink to="/gantt">Гант</RouterLink>
        <RouterLink to="/time-tracking">Часы</RouterLink>
        <RouterLink to="/vacations">Отпуска</RouterLink>
        <RouterLink to="/payroll">Зарплаты</RouterLink>
        <RouterLink to="/analytics">Аналитика</RouterLink>
        <RouterLink to="/templates">Шаблоны</RouterLink>
        <RouterLink to="/production/calendar">Календарь</RouterLink>
        <RouterLink to="/production/plan">План</RouterLink>
        <RouterLink to="/indirect-costs">Косвенные</RouterLink>
        <button type="button" @click="handleLogout">Выйти</button>
      </nav>
    </header>
    <p>Infrastructure ready. Auth enabled.</p>
    <p>API health: <code>{{ healthStatus }}</code></p>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const healthStatus = ref('loading...');
const auth = useAuthStore();
const router = useRouter();

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    const body = await res.json();
    healthStatus.value = `${body.status} (db: ${body.db?.ok ? 'ok' : 'down'})`;
  } catch (error) {
    healthStatus.value = `error: ${String(error)}`;
  }
});

async function handleLogout() {
  await auth.logout();
  await router.push('/login');
}
</script>

<style scoped>
.placeholder {
  font-family: system-ui, sans-serif;
  max-width: 40rem;
  margin: 4rem auto;
  padding: 2rem;
  line-height: 1.5;
}

.placeholder header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.placeholder h1 {
  margin-top: 0;
  margin-bottom: 0.35rem;
}

.placeholder header p {
  margin: 0;
  color: #4f5b67;
}

.placeholder code {
  background: #eee;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.placeholder nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.placeholder button,
.placeholder a {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  background: white;
  padding: 0 0.8rem;
  color: #1f2933;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
}
</style>
