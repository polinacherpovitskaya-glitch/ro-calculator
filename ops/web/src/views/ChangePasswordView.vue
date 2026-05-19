<template>
  <main class="auth-page">
    <section class="auth-panel">
      <h1>Смена пароля</h1>
      <form @submit.prevent="handleSubmit">
        <label>
          Старый пароль
          <input v-model="oldPassword" type="password" required autocomplete="current-password" />
        </label>
        <label>
          Новый пароль
          <input v-model="newPassword" type="password" required autocomplete="new-password" minlength="10" />
        </label>
        <label>
          Повторите пароль
          <input v-model="confirmPassword" type="password" required autocomplete="new-password" minlength="10" />
        </label>
        <button :disabled="loading">{{ loading ? 'Сохраняем...' : 'Сохранить' }}</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import type { ApiError } from '../api';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();
const auth = useAuthStore();

async function handleSubmit() {
  error.value = '';
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Пароли не совпадают';
    return;
  }

  loading.value = true;
  try {
    await auth.changePassword(oldPassword.value, newPassword.value);
    await router.push('/');
  } catch (caught) {
    const apiError = caught as Partial<ApiError>;
    error.value = apiError.message || 'Не удалось сменить пароль';
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
