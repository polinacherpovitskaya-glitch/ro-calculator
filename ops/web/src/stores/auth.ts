import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import * as authApi from '../api/auth';
import type { User } from '../api/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const isLoaded = ref(false);
  const isLoggedIn = computed(() => user.value !== null);

  async function loadMe() {
    user.value = await authApi.me();
    isLoaded.value = true;
  }

  async function login(email: string, password: string) {
    user.value = await authApi.login(email, password);
    isLoaded.value = true;
  }

  async function logout() {
    await authApi.logout();
    user.value = null;
    isLoaded.value = true;
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    await authApi.changePassword(oldPassword, newPassword);
    if (user.value) {
      user.value.mustChangePassword = false;
    }
  }

  return { user, isLoaded, isLoggedIn, loadMe, login, logout, changePassword };
});
