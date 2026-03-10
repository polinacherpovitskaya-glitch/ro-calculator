-- =============================================
-- Recycle Object — Supabase Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- =============================================

-- 1. SETTINGS (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ORDERS (wide table — all order fields as columns)
CREATE TABLE IF NOT EXISTS orders (
    id BIGINT PRIMARY KEY,
    order_name TEXT,
    client_name TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    -- Dates
    deadline TEXT,
    deadline_start TEXT,
    deadline_end TEXT,
    -- Contacts
    delivery_address TEXT,
    telegram TEXT,
    crm_link TEXT,
    fintablo_link TEXT,
    -- Client legal details
    client_legal_name TEXT,
    client_inn TEXT,
    client_legal_address TEXT,
    client_bank_name TEXT,
    client_bank_account TEXT,
    client_bank_bik TEXT,
    -- Production
    payment_status TEXT DEFAULT 'not_sent',
    total_hours_plan NUMERIC DEFAULT 0,
    production_hours_plastic NUMERIC DEFAULT 0,
    production_hours_packaging NUMERIC DEFAULT 0,
    production_hours_hardware NUMERIC DEFAULT 0,
    -- Costs & revenue
    total_cost NUMERIC DEFAULT 0,
    total_revenue NUMERIC DEFAULT 0,
    total_margin NUMERIC DEFAULT 0,
    margin_percent NUMERIC DEFAULT 0,
    -- Calculator snapshot (JSON string)
    calculator_data TEXT,
    items_snapshot TEXT,
    hardware_snapshot TEXT,
    packaging_snapshot TEXT,
    -- Manager
    manager_name TEXT,
    owner_name TEXT,
    notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- 3. ORDER_ITEMS (line items per order)
CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_number INTEGER,
    template_id BIGINT,
    product_name TEXT,
    quantity INTEGER,
    unit_price NUMERIC,
    sell_price_item NUMERIC,
    sell_price_printing NUMERIC,
    total_price NUMERIC,
    cost_total NUMERIC,
    item_data TEXT, -- JSON snapshot of calculator item
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 4. PRODUCT_TEMPLATES (molds/blanks reference)
CREATE TABLE IF NOT EXISTS product_templates (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'blank',
    collection TEXT,
    photo_url TEXT,
    pph_min INTEGER DEFAULT 0,
    pph_max INTEGER DEFAULT 0,
    pph_actual INTEGER,
    weight_grams NUMERIC DEFAULT 0,
    mold_count INTEGER DEFAULT 1,
    hw_name TEXT,
    hw_price_per_unit NUMERIC DEFAULT 0,
    hw_delivery_total NUMERIC DEFAULT 0,
    hw_speed INTEGER,
    hw_source TEXT DEFAULT 'custom',
    hw_warehouse_item_id BIGINT,
    hw_warehouse_sku TEXT,
    custom_margins JSONB DEFAULT '{}',
    custom_prices JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'production',
    daily_hours NUMERIC DEFAULT 8,
    telegram_id BIGINT,
    telegram_username TEXT,
    reminder_hour INTEGER DEFAULT 17,
    reminder_minute INTEGER DEFAULT 30,
    timezone_offset INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT true,
    tasks_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TIME_ENTRIES
CREATE TABLE IF NOT EXISTS time_entries (
    id BIGINT PRIMARY KEY,
    employee_id BIGINT,
    employee_name TEXT,
    date DATE,
    hours NUMERIC,
    task_description TEXT,
    order_id BIGINT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);

-- 7. FINTABLO_IMPORTS
CREATE TABLE IF NOT EXISTS fintablo_imports (
    id BIGINT PRIMARY KEY,
    order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
    import_data JSONB,
    period_from TEXT,
    period_to TEXT,
    import_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fintablo_order ON fintablo_imports(order_id);

-- 8. ORDER_FACTUALS (plan vs fact)
CREATE TABLE IF NOT EXISTS order_factuals (
    id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    factual_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factuals_order ON order_factuals(order_id);


-- =============================================
-- ROW LEVEL SECURITY — allow anon access (app uses password auth, not Supabase auth)
-- =============================================

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fintablo_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_factuals ENABLE ROW LEVEL SECURITY;

-- Allow anon role full access to all tables
CREATE POLICY "anon_all_settings" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_templates" ON product_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_employees" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_time_entries" ON time_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_fintablo" ON fintablo_imports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_factuals" ON order_factuals FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- ADDITIONAL TABLES (added for full sync support)
-- =============================================

-- JSON-blob tables (single row id=1)
CREATE TABLE IF NOT EXISTS app_tasks (
    id BIGINT PRIMARY KEY, tasks_data TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS china_orders (
    id BIGINT PRIMARY KEY, orders_data TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS app_vacations (
    id BIGINT PRIMARY KEY, vacations_data TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS warehouse_reservations (
    id BIGINT PRIMARY KEY, reservations_data TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS warehouse_history (
    id BIGINT PRIMARY KEY, history_data TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ready_goods (
    id BIGINT PRIMARY KEY, goods_data TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ready_goods_history (
    id BIGINT PRIMARY KEY, history_data TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales_records (
    id BIGINT PRIMARY KEY, records_data TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual-record tables
CREATE TABLE IF NOT EXISTS molds (
    id BIGINT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', mold_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS warehouse_items (
    id BIGINT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', sku TEXT DEFAULT '', category TEXT DEFAULT '',
    item_data TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shipments (
    id BIGINT PRIMARY KEY, shipment_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS china_purchases (
    id BIGINT PRIMARY KEY, status TEXT DEFAULT 'draft', purchase_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS app_colors (
    id BIGINT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', color_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hw_blanks (
    id BIGINT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', blank_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pkg_blanks (
    id BIGINT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', blank_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketplace_sets (
    id BIGINT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', set_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS + anon access for new tables
ALTER TABLE app_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE china_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ready_goods ENABLE ROW LEVEL SECURITY;
ALTER TABLE ready_goods_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE molds ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE china_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE hw_blanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pkg_blanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_app_tasks" ON app_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_china_orders" ON china_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_app_vacations" ON app_vacations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_warehouse_reservations" ON warehouse_reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_warehouse_history" ON warehouse_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ready_goods" ON ready_goods FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ready_goods_history" ON ready_goods_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_sales_records" ON sales_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_molds" ON molds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_warehouse_items" ON warehouse_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_shipments" ON shipments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_china_purchases" ON china_purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_app_colors" ON app_colors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_hw_blanks" ON hw_blanks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_pkg_blanks" ON pkg_blanks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_marketplace_sets" ON marketplace_sets FOR ALL USING (true) WITH CHECK (true);
