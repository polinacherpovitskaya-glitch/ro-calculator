import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Order } from '../api/orders';
import * as api from '../api/orders';

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref<Order[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function load(params: Parameters<typeof api.listOrders>[0] = {}) {
    loading.value = true;
    error.value = '';
    try {
      orders.value = await api.listOrders(params);
    } catch (caught) {
      error.value = caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Не удалось загрузить заказы';
    } finally {
      loading.value = false;
    }
  }

  return { orders, loading, error, load };
});
