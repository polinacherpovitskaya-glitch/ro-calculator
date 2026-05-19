<template>
  <main class="placeholder">
    <header>
      <div>
        <h1>RO Ops - staging</h1>
        <p>Привет, {{ auth.user?.email }}</p>
      </div>
      <button type="button" @click="handleLogout">Выйти</button>
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

.placeholder button {
  min-height: 2.25rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  background: white;
  padding: 0 0.8rem;
  font: inherit;
  cursor: pointer;
}
</style>
