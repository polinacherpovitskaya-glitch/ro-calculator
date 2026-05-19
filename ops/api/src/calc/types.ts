export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type Id = number | string;
export type OrderStatus =
  | 'draft'
  | 'sample'
  | 'production_casting'
  | 'production_printing'
  | 'production_hardware'
  | 'production_packaging'
  | 'in_production'
  | 'delivery'
  | 'completed'
  | 'deleted'
  | string;

export interface ProductionSettings {
  workers_count: number;
  hours_per_worker: number;
  work_load_ratio: number;
  plastic_injection_ratio: number;
  packaging_ratio: number;
  indirect_cost_mode?: 'all' | 'production' | string;
  indirect_costs_monthly: number;
  fot_per_hour: number;
  cutting_speed: number;
  plastic_cost_per_kg: number;
  nfc_write_speed: number;
  mold_base_cost: number;
  design_cost: number;
  nfc_tag_cost: number;
  vat_rate: number;
  tax_rate: number;
  charity_rate?: number;
  margin_target: number;
  delivery_cost_moscow: number;
  printing_delivery_cost: number;
  waste_factor?: number;
}

export interface ProductionParams {
  totalHoursAll: number;
  workLoadHours: number;
  plasticHours: number;
  packagingHours: number;
  indirectPerHour: number;
  indirectCostMode: 'all' | 'production' | string;
  fotPerHour: number;
  cuttingSpeed: number;
  plasticCostPerKg: number;
  nfcWriteSpeed: number;
  moldBaseCost: number;
  designCost: number;
  nfcTagCost: number;
  vatRate: number;
  taxRate: number;
  charityRate: number;
  commercialRate?: number;
  marginTarget: number;
  deliveryCostMoscow: number;
  printingDeliveryCost: number;
  wasteFactor: number;
  mp_commission?: number;
  mp_logistics?: number;
  mp_storage_ratio?: number;
  mp_acquiring?: number;
}

export interface PrintingInput {
  name?: string;
  qty: number;
  price: number;
  sell_price: number;
  delivery_total?: number;
}

export interface ProductInput {
  id?: Id;
  item_number?: number;
  item_type: 'product';
  product_name?: string;
  template_id?: Id | null;
  quantity: number;
  pieces_per_hour: number;
  weight_grams: number;
  extra_molds: number;
  base_mold_in_stock?: boolean;
  complex_design?: boolean;
  is_blank_mold?: boolean;
  blank_mold_total_cost?: number;
  is_nfc?: boolean;
  nfc_programming?: boolean;
  nfc_warehouse_item_id?: Id | null;
  delivery_included?: boolean;
  printings?: PrintingInput[];
  printing_qty?: number;
  printing_price_per_unit?: number;
  sell_price_item: number;
  sell_price_printing?: number;
  target_price_item?: number;
  color_id?: Id | null;
  color_name?: string;
  colors?: JsonValue;
  color_solution_attachment?: JsonValue;
  builtin_hw_name?: string;
  builtin_hw_price?: number;
  builtin_hw_delivery_total?: number;
  builtin_hw_speed?: number;
  builtin_assembly_name?: string;
  builtin_assembly_speed?: number;
}

export interface ProductCostOutput {
  costFot: number;
  costIndirect: number;
  costPlastic: number;
  costMoldAmortization: number;
  costDesign: number;
  costCutting: number;
  costCuttingIndirect: number;
  costNfcTag: number;
  costNfcProgramming: number;
  costNfcIndirect: number;
  costPrinting: number;
  costPrintingDetails: number[];
  costDelivery: number;
  costBuiltinHw: number;
  costBuiltinHwIndirect: number;
  costBuiltinAssembly: number;
  costBuiltinAssemblyIndirect: number;
  costTotal: number;
  hoursPlastic: number;
  hoursCutting: number;
  hoursNfc: number;
  hoursBuiltinHw: number;
  hoursBuiltinAssembly: number;
  hoursPlasticZone: number;
  hoursAssemblyZone: number;
  hoursCuttingZone: number;
  hoursTotalPlasticNfc: number;
}

export interface HardwareInput {
  id?: Id;
  item_type: 'hardware';
  source?: 'warehouse' | 'custom' | string;
  name?: string;
  qty: number;
  assembly_speed: number;
  price: number;
  delivery_price: number;
  delivery_total?: number;
  sell_price: number;
  warehouse_item_id?: Id | null;
  warehouse_sku?: string;
}

export interface HardwareCostOutput {
  costPerUnit: number;
  fotPerUnit: number;
  indirectPerUnit: number;
  hoursHardware: number;
  totalCost: number;
}

export interface PackagingInput {
  id?: Id;
  item_type: 'packaging';
  source?: 'warehouse' | 'custom' | string;
  name?: string;
  qty: number;
  assembly_speed: number;
  price: number;
  delivery_price: number;
  delivery_total?: number;
  sell_price: number;
  warehouse_item_id?: Id | null;
  warehouse_sku?: string;
}

export interface PackagingCostOutput {
  costPerUnit: number;
  fotPerUnit: number;
  indirectPerUnit: number;
  hoursPackaging: number;
  totalCost: number;
}

export interface PendantElementInput {
  char: string;
  color?: string;
  has_print?: boolean;
  print_price?: number;
  sell_print?: number;
}

export interface PendantAttachmentInput {
  source?: 'warehouse' | 'custom' | string;
  name?: string;
  warehouse_item_id?: Id | null;
  warehouse_sku?: string;
  unit?: 'шт' | 'м' | 'см' | string;
  allocated_qty?: number;
  qty_per_pendant?: number;
  length_cm?: number;
  price_per_unit: number;
  delivery_price?: number;
  sell_price?: number;
  assembly_speed?: number;
}

export interface PendantPackagingInput {
  source?: 'warehouse' | 'custom' | string;
  name?: string;
  warehouse_item_id?: Id | null;
  price_per_unit: number;
  delivery_price?: number;
  assembly_speed?: number;
}

export interface PendantInput {
  id?: Id;
  item_type: 'pendant';
  name?: string;
  quantity: number;
  elements: PendantElementInput[];
  element_price_per_unit?: number;
  _totalSellPerUnit?: number;
  _elemSellTotal?: number;
  cord?: PendantAttachmentInput;
  carabiner?: PendantAttachmentInput;
  cords?: PendantAttachmentInput[];
  carabiners?: PendantAttachmentInput[];
  packaging?: PendantPackagingInput | null;
  cord_length_cm?: number;
}

export interface ActualMarginOutput {
  earned: number;
  percent: number | null;
}

export interface PendantCostOutput {
  costPerUnit: number;
  sellPerUnit: number;
  totalCost: number;
  totalRevenue: number;
  assemblyHours: number;
  packagingHours: number;
  hoursPlastic: number;
  hoursCutting: number;
  hoursBuiltinHw: number;
  hoursBuiltinAssembly: number;
  hoursPlasticZone: number;
  hoursAssemblyZone: number;
  attachmentAssemblyHours: number;
  letterAssemblyHours: number;
  attachmentPurchaseTotal?: number;
  attachmentDeliveryTotal?: number;
  attachmentAssemblyTotal?: number;
  attachmentIndirectTotal?: number;
  margin?: ActualMarginOutput;
}

export interface ExtraCostInput {
  item_type: 'extra_cost';
  name?: string;
  amount: number;
}

export interface OrderDiscountInput {
  mode?: 'none' | 'amount' | 'percent' | string;
  value?: number;
}

export interface OrderInput {
  id?: Id;
  order_name?: string;
  client_name?: string;
  status?: OrderStatus;
  discount?: OrderDiscountInput;
  products: ProductInput[];
  hardwareItems: HardwareInput[];
  packagingItems: PackagingInput[];
  pendantItems: PendantInput[];
  extraCosts: ExtraCostInput[];
  settings: ProductionSettings;
}

export interface ProductionLoadOutput {
  hoursPlasticTotal: number;
  hoursPackagingTotal: number;
  hoursHardwareTotal: number;
  totalHours: number;
  plasticLoadPercent: number;
  packagingLoadPercent: number;
  days1worker: number;
  days2workers: number;
  days3workers: number;
}

export interface OrderSummaryOutput {
  grossRevenue: number;
  discountAmount: number;
  discountPercent: number;
  totalRevenue: number;
  vatOnRevenue: number;
  totalWithVat: number;
  totalEarned: number;
  marginPercent: number;
}

export interface FinancialDirectorOutput {
  salary: number;
  indirect: number;
  hardwarePurchase: number;
  nfcTotal: number;
  hardwareDelivery: number;
  packagingPurchase: number;
  packagingDelivery: number;
  design: number;
  printing: number;
  plastic: number;
  molds: number;
  delivery: number;
  taxes: number;
  commercial: number;
  charity: number;
  grossRevenue: number;
  discountAmount: number;
  discountPercent: number;
  revenueNet: number;
  revenueWithVat: number;
  revenue: number;
  totalCosts: number;
}

export interface OrderOutput {
  products: Array<ProductInput & { result: ProductCostOutput }>;
  hardwareItems: Array<HardwareInput & { result: HardwareCostOutput }>;
  packagingItems: Array<PackagingInput & { result: PackagingCostOutput }>;
  pendantItems: Array<PendantInput & { result: PendantCostOutput }>;
  extraCosts: ExtraCostInput[];
  load: ProductionLoadOutput;
  summary: OrderSummaryOutput;
  finDirector: FinancialDirectorOutput;
  revenue: number;
  marginPercent: number;
  hours: number;
  total_revenue: number;
  total_cost: number;
  total_margin: number;
  margin_percent: number;
  total_hours_plan: number;
}

export interface CalcOrderResult {
  total_revenue: number;
  total_cost: number;
  total_margin: number;
  margin_percent: number;
  total_hours_plan: number;
  production_hours_plastic: number;
  production_hours_packaging: number;
  production_hours_hardware: number;
}

export interface TpaInput {
  quantity: number;
  cavities: number;
  openingsPerHour: number;
  weight: number;
  wasteFactor: number;
  materialCostPerKg: number;
  operatorRatePerHour: number;
  indirectRatePerHour: number;
  moldCost: number;
  setupCost: number;
  targetMarginPct: number;
}

export interface TpaOutput {
  quantity: number;
  cavities: number;
  openingsPerHour: number;
  weight: number;
  piecesPerHour: number;
  hoursTotal: number;
  plasticPerUnit: number;
  fotPerUnit: number;
  indirectPerUnit: number;
  setupPerUnit: number;
  runtimePerUnit: number;
  moldPerUnit: number;
  totalPerUnit: number;
  runtimeTotal: number;
  totalCost: number;
  sellNoVat: number;
  sellWithVat: number;
  oneShiftMonthly: number;
}

export interface FactualInput {
  order_id: Id;
  fact_hours_production?: number;
  fact_hours_trim?: number;
  fact_hours_assembly?: number;
  fact_hours_packaging?: number;
  fact_salary_production?: number;
  fact_salary_trim?: number;
  fact_salary_assembly?: number;
  fact_salary_packaging?: number;
  fact_indirect_production?: number;
  fact_hardware_total?: number;
  fact_nfc_total?: number;
  fact_packaging_total?: number;
  fact_design_printing?: number;
  fact_plastic?: number;
  fact_molds?: number;
  fact_delivery_client?: number;
  fact_taxes?: number;
  fact_commercial?: number;
  fact_charity?: number;
  fact_other?: number;
  fact_revenue?: number;
  fact_total?: number;
  updated_by?: string;
  metadata?: JsonObject;
}

export interface FactualOutput {
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  hasRevenue: boolean;
  hasCosts: boolean;
}

export interface LegacyOrderRow {
  id: Id;
  order_name?: string;
  client_name?: string;
  status?: OrderStatus;
  total_hours_plan?: number | null;
  production_hours_plastic?: number | null;
  production_hours_packaging?: number | null;
  production_hours_hardware?: number | null;
  total_cost?: number | null;
  total_revenue?: number | null;
  total_margin?: number | null;
  margin_percent?: number | null;
  calculator_data?: JsonValue | string | null;
  items_snapshot?: JsonValue | string | null;
  hardware_snapshot?: JsonValue | string | null;
  packaging_snapshot?: JsonValue | string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface LegacyOrderItemRow {
  id: Id;
  order_id: Id;
  item_number?: number | null;
  template_id?: Id | null;
  product_name?: string;
  quantity?: number | null;
  unit_price?: number | null;
  sell_price_item?: number | null;
  sell_price_printing?: number | null;
  total_price?: number | null;
  cost_total?: number | null;
  item_data?: JsonValue | string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LegacyFactualRow {
  id: Id;
  order_id: Id;
  factual_data?: JsonValue | string | null;
  created_at?: string;
  updated_at?: string;
}

export interface GoldenFixtureExpected {
  total_revenue: number | null;
  total_cost: number | null;
  total_margin: number | null;
  margin_percent: number | null;
  total_hours_plan: number | null;
  production_hours_plastic: number | null;
  production_hours_packaging: number | null;
  production_hours_hardware: number | null;
}

export interface GoldenFixture {
  id: string;
  exportedAt: string;
  source: 'supabase';
  summary: JsonObject;
  expected: GoldenFixtureExpected;
  order: LegacyOrderRow;
  items: LegacyOrderItemRow[];
  factuals: LegacyFactualRow[];
}
