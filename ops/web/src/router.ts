import { createRouter, createWebHistory } from 'vue-router';
import PlaceholderView from './views/PlaceholderView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: PlaceholderView },
  ],
});

export default router;
