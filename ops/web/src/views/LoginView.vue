<template>
  <main class="auth-page">
    <section class="auth-panel">
      <h1>Вход</h1>
      <form @submit.prevent="handleSubmit">
        <label>
          Email
          <input v-model="email" type="email" required autocomplete="email" autofocus />
        </label>
        <label>
          Пароль
          <input v-model="password" type="password" required autocomplete="current-password" />
        </label>
        <button :disabled="loading">{{ loading ? 'Входим...' : 'Войти' }}</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import type { ApiError } from '../api';

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

async function handleSubmit() {
  loading.value = true;
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    const next = typeof route.query.next === 'string' ? route.query.next : '/';
    await router.push(auth.user?.mustChangePassword ? '/change-password' : next);
  } catch (caught) {
    const apiError = caught as Partial<ApiError>;
    error.value = apiError.message || 'Ошибка входа';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  font-family: system-ui, sans-serif;
  max-width: 26rem;
  margin: 4rem auto;
  padding: 0 1rem;
}

.auth-panel {
  display: grid;
  gap: 1.25rem;
}

h1 {
  margin: 0;
  font-size: 1.75rem;
}

form {
  display: grid;
  gap: 1rem;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.95rem;
}

input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.65rem 0.7rem;
  border: 1px solid #c7cbd1;
  border-radius: 6px;
  font: inherit;
}

button {
  min-height: 2.6rem;
  border: 0;
  border-radius: 6px;
  background: #1d4f91;
  color: white;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.error {
  margin: 0;
  color: #b42318;
}
</style>
