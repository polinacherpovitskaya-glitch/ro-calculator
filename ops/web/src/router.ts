import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import PlaceholderView from './views/PlaceholderView.vue';
import LoginView from './views/LoginView.vue';
import ChangePasswordView from './views/ChangePasswordView.vue';
import WarehouseListView from './views/WarehouseListView.vue';
import WarehouseItemView from './views/WarehouseItemView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: PlaceholderView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/change-password', name: 'change-password', component: ChangePasswordView, meta: { requiresAuth: true } },
    { path: '/warehouse', name: 'warehouse', component: WarehouseListView, meta: { requiresAuth: true } },
    { path: '/warehouse/:id', name: 'warehouse-item', component: WarehouseItemView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.isLoaded) {
    await auth.loadMe();
  }
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  if (auth.user?.mustChangePassword && to.name !== 'change-password') {
    return { name: 'change-password' };
  }
  return undefined;
});

export default router;
