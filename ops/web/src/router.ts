import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import PlaceholderView from './views/PlaceholderView.vue';
import LoginView from './views/LoginView.vue';
import ChangePasswordView from './views/ChangePasswordView.vue';
import WarehouseListView from './views/WarehouseListView.vue';
import WarehouseItemView from './views/WarehouseItemView.vue';
import InventoryAuditView from './views/InventoryAuditView.vue';
import WarehouseHistoryView from './views/WarehouseHistoryView.vue';
import ShipmentsListView from './views/ShipmentsListView.vue';
import ShipmentView from './views/ShipmentView.vue';
import ChinaPurchasesView from './views/ChinaPurchasesView.vue';
import ChinaPurchaseView from './views/ChinaPurchaseView.vue';
import ChinaCatalogView from './views/ChinaCatalogView.vue';
import MoldsListView from './views/MoldsListView.vue';
import MoldView from './views/MoldView.vue';
import BlanksView from './views/BlanksView.vue';
import ColorsView from './views/ColorsView.vue';
import MarketplacesView from './views/MarketplacesView.vue';
import BugsView from './views/BugsView.vue';
import TemplatesView from './views/TemplatesView.vue';
import ProductionCalendarView from './views/ProductionCalendarView.vue';
import ProductionPlanView from './views/ProductionPlanView.vue';
import IndirectCostsView from './views/IndirectCostsView.vue';
import OrdersListView from './views/OrdersListView.vue';
import OrderEditorView from './views/OrderEditorView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: PlaceholderView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/change-password', name: 'change-password', component: ChangePasswordView, meta: { requiresAuth: true } },
    { path: '/warehouse', name: 'warehouse', component: WarehouseListView, meta: { requiresAuth: true } },
    { path: '/warehouse/inventory', name: 'warehouse-inventory', component: InventoryAuditView, meta: { requiresAuth: true } },
    { path: '/warehouse/history', name: 'warehouse-history', component: WarehouseHistoryView, meta: { requiresAuth: true } },
    { path: '/warehouse/:id', name: 'warehouse-item', component: WarehouseItemView, meta: { requiresAuth: true } },
    { path: '/shipments', name: 'shipments', component: ShipmentsListView, meta: { requiresAuth: true } },
    { path: '/shipments/:id', name: 'shipment', component: ShipmentView, meta: { requiresAuth: true } },
    { path: '/china', name: 'china', component: ChinaPurchasesView, meta: { requiresAuth: true } },
    { path: '/china/catalog', name: 'china-catalog', component: ChinaCatalogView, meta: { requiresAuth: true } },
    { path: '/china/:id', name: 'china-purchase', component: ChinaPurchaseView, meta: { requiresAuth: true } },
    { path: '/molds', name: 'molds', component: MoldsListView, meta: { requiresAuth: true } },
    { path: '/molds/:id', name: 'mold', component: MoldView, meta: { requiresAuth: true } },
    { path: '/blanks', name: 'blanks', component: BlanksView, meta: { requiresAuth: true } },
    { path: '/colors', name: 'colors', component: ColorsView, meta: { requiresAuth: true } },
    { path: '/marketplaces', name: 'marketplaces', component: MarketplacesView, meta: { requiresAuth: true } },
    { path: '/bugs', name: 'bugs', component: BugsView, meta: { requiresAuth: true } },
    { path: '/templates', name: 'templates', component: TemplatesView, meta: { requiresAuth: true } },
    { path: '/production/calendar', name: 'production-calendar', component: ProductionCalendarView, meta: { requiresAuth: true } },
    { path: '/production/plan', name: 'production-plan', component: ProductionPlanView, meta: { requiresAuth: true } },
    { path: '/indirect-costs', name: 'indirect-costs', component: IndirectCostsView, meta: { requiresAuth: true } },
    { path: '/orders', name: 'orders', component: OrdersListView, meta: { requiresAuth: true } },
    { path: '/orders/:id', name: 'order-editor', component: OrderEditorView, meta: { requiresAuth: true } },
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
