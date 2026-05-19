import { ref } from 'vue';
import { defineStore } from 'pinia';
import * as shipmentsApi from '../api/shipments';
import type { Shipment, ShipmentInput } from '../api/shipments';

export const useShipmentsStore = defineStore('shipments', () => {
  const shipments = ref<Shipment[]>([]);
  const loading = ref(false);
  const error = ref('');
  const status = ref('');

  async function loadShipments() {
    loading.value = true;
    error.value = '';
    try {
      shipments.value = await shipmentsApi.listShipments({ status: status.value });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Не удалось загрузить приёмки';
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  async function createShipment(input: ShipmentInput) {
    const shipment = await shipmentsApi.createShipment(input);
    shipments.value = [shipment, ...shipments.value];
    return shipment;
  }

  async function receiveShipment(id: number) {
    const shipment = await shipmentsApi.receiveShipment(id);
    shipments.value = shipments.value.map((existing) => (Number(existing.id) === Number(id) ? shipment : existing));
    return shipment;
  }

  return { shipments, loading, error, status, loadShipments, createShipment, receiveShipment };
});
