import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcOrder } from '../../src/calc/index.js';
import { calcHardware } from '../../src/calc/hardware.js';
import { calcPackaging } from '../../src/calc/packaging.js';
import { getProductionParams } from '../../src/calc/params.js';
import { calcProduct } from '../../src/calc/product.js';
import type { OrderInput, ProductInput, ProductionSettings } from '../../src/calc/types.js';

const settings: ProductionSettings = {
  workers_count: 10,
  hours_per_worker: 100,
  work_load_ratio: 1,
  plastic_injection_ratio: 0.5,
  packaging_ratio: 0.5,
  indirect_cost_mode: 'all',
  indirect_costs_monthly: 10000,
  fot_per_hour: 100,
  cutting_speed: 100,
  plastic_cost_per_kg: 1000,
  nfc_write_speed: 50,
  mold_base_cost: 4500,
  design_cost: 1000,
  nfc_tag_cost: 10,
  vat_rate: 0.05,
  tax_rate: 0.07,
  charity_rate: 0.01,
  margin_target: 0.55,
  delivery_cost_moscow: 500,
  printing_delivery_cost: 100,
  waste_factor: 1.1,
};

const params = getProductionParams(settings);

const product: ProductInput = {
  item_type: 'product',
  quantity: 100,
  pieces_per_hour: 50,
  weight_grams: 10,
  extra_molds: 0,
  base_mold_in_stock: false,
  complex_design: false,
  is_blank_mold: false,
  is_nfc: false,
  nfc_programming: false,
  delivery_included: false,
  sell_price_item: 100,
};

test('getProductionParams derives indirect rate from all workload hours', () => {
  assert.equal(params.totalHoursAll, 1000);
  assert.equal(params.workLoadHours, 1000);
  assert.equal(params.plasticHours, 500);
  assert.equal(params.packagingHours, 500);
  assert.equal(params.indirectPerHour, 10);
});

test('calcProduct ports base product cost and hours', () => {
  assert.deepEqual(calcProduct(product, params), {
    costFot: 2.2,
    costIndirect: 0.22,
    costPlastic: 11,
    costMoldAmortization: 45,
    costDesign: 0,
    costCutting: 1.1,
    costCuttingIndirect: 0.11,
    costNfcTag: 0,
    costNfcProgramming: 0,
    costNfcIndirect: 0,
    costPrinting: 0,
    costPrintingDetails: [],
    costDelivery: 0,
    costBuiltinHw: 0,
    costBuiltinHwIndirect: 0,
    costBuiltinAssembly: 0,
    costBuiltinAssemblyIndirect: 0,
    costTotal: 59.63,
    hoursPlastic: 2.2,
    hoursCutting: 1.1,
    hoursNfc: 0,
    hoursBuiltinHw: 0,
    hoursBuiltinAssembly: 0,
    hoursPlasticZone: 3.3,
    hoursAssemblyZone: 0,
    hoursCuttingZone: 0,
    hoursTotalPlasticNfc: 3.3,
  });
});

test('calcHardware ports assembly salary and indirect', () => {
  assert.deepEqual(calcHardware({
    item_type: 'hardware',
    qty: 100,
    assembly_speed: 50,
    price: 5,
    delivery_price: 1,
    sell_price: 20,
  }, params), {
    costPerUnit: 8.42,
    fotPerUnit: 2.2,
    indirectPerUnit: 0.22,
    hoursHardware: 2.2,
    totalCost: 842,
  });
});

test('calcPackaging ports packaging salary and indirect', () => {
  assert.deepEqual(calcPackaging({
    item_type: 'packaging',
    qty: 100,
    assembly_speed: 100,
    price: 2,
    delivery_price: 0.5,
    sell_price: 10,
  }, params), {
    costPerUnit: 3.71,
    fotPerUnit: 1.1,
    indirectPerUnit: 0.11,
    hoursPackaging: 1.1,
    totalCost: 371,
  });
});

test('calcOrder live path supports products, hardware, packaging, fees, and hours', () => {
  const order: OrderInput = {
    settings,
    products: [product],
    hardwareItems: [{
      item_type: 'hardware',
      qty: 100,
      assembly_speed: 50,
      price: 5,
      delivery_price: 1,
      sell_price: 20,
    }],
    packagingItems: [{
      item_type: 'packaging',
      qty: 100,
      assembly_speed: 100,
      price: 2,
      delivery_price: 0.5,
      sell_price: 10,
    }],
    pendantItems: [],
    extraCosts: [],
  };

  assert.deepEqual(calcOrder(order), {
    total_revenue: 13000,
    total_cost: 9061,
    total_margin: 3939,
    margin_percent: 30.3,
    total_hours_plan: 6.6,
    production_hours_plastic: 3.3,
    production_hours_packaging: 1.1,
    production_hours_hardware: 2.2,
  });
});
