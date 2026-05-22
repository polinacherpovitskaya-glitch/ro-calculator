<template>
  <main class="home-page">
    <header>
      <div>
        <h1>Главная</h1>
        <p>Привет, {{ auth.user?.email }}</p>
      </div>
    </header>
    <section class="home-card">
      <h2>Staging</h2>
      <p>{{ healthStatus }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '../stores/auth';

const healthStatus = ref('Проверяем состояние системы...');
const auth = useAuthStore();

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    const body = await res.json();
    healthStatus.value = body.status === 'ok' && body.db?.ok ? 'API и база данных работают' : 'Есть проблема с API или базой данных';
  } catch (error) {
    healthStatus.value = `Не удалось проверить состояние: ${String(error)}`;
  }
});
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  padding: 32px 24px;
  line-height: 1.5;
}

.home-page header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 72rem;
  margin: 0 auto 18px;
  gap: 1rem;
}

.home-page h1,
.home-page h2,
.home-page p {
  margin: 0;
}

.home-page h1 {
  font-size: 28px;
  line-height: 1.15;
}

.home-page header p {
  margin-top: 6px;
  color: #4f5b67;
}

.home-card {
  max-width: 72rem;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 18px 20px;
}

.home-card p {
  margin-top: 8px;
  color: #4f5b67;
}

</style>
