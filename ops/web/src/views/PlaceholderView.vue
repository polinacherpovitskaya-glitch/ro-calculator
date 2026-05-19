<template>
  <main class="placeholder">
    <h1>RO Ops - staging</h1>
    <p>Infrastructure ready. Block 1 complete.</p>
    <p>API health: <code>{{ healthStatus }}</code></p>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const healthStatus = ref('loading...');

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    const body = await res.json();
    healthStatus.value = `${body.status} (db: ${body.db?.ok ? 'ok' : 'down'})`;
  } catch (error) {
    healthStatus.value = `error: ${String(error)}`;
  }
});
</script>

<style scoped>
.placeholder {
  font-family: system-ui, sans-serif;
  max-width: 40rem;
  margin: 4rem auto;
  padding: 2rem;
  line-height: 1.5;
}

.placeholder h1 {
  margin-top: 0;
}

.placeholder code {
  background: #eee;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}
</style>
