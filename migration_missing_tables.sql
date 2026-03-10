-- =============================================
-- Recycle Object — Migration: Create Missing Tables
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- =============================================

-- =============================================
-- JSON-BLOB TABLES (single row, id=1)
-- =============================================

CREATE TABLE IF NOT EXISTS app_tasks (
    id BIGINT PRIMARY KEY,
    tasks_data TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS china_orders (
    id BIGINT PRIMARY KEY,
    orders_data TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_vacations (
    id BIGINT PRIMARY KEY,
    vacations_data TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_reservations (
    id BIGINT PRIMARY KEY,
    reservations_data TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_history (
    id BIGINT PRIMARY KEY,
    history_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ready_goods (
    id BIGINT PRIMARY KEY,
    goods_data TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ready_goods_history (
    id BIGINT PRIMARY KEY,
    history_data TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_records (
    id BIGINT PRIMARY KEY,
    records_data TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDIVIDUAL-RECORD TABLES (one row per entity)
-- =============================================

CREATE TABLE IF NOT EXISTS molds (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    mold_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_items (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    sku TEXT DEFAULT '',
    category TEXT DEFAULT '',
    item_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
    id BIGINT PRIMARY KEY,
    shipment_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS china_purchases (
    id BIGINT PRIMARY KEY,
    status TEXT DEFAULT 'draft',
    purchase_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_colors (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    color_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hw_blanks (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    blank_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pkg_blanks (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    blank_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_sets (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    set_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY — allow anon access
-- =============================================

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

-- Anon access policies
DO $$ BEGIN
CREATE POLICY "anon_all_app_tasks" ON app_tasks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_china_orders" ON china_orders FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_app_vacations" ON app_vacations FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_warehouse_reservations" ON warehouse_reservations FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_warehouse_history" ON warehouse_history FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_ready_goods" ON ready_goods FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_ready_goods_history" ON ready_goods_history FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_sales_records" ON sales_records FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_molds" ON molds FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_warehouse_items" ON warehouse_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_shipments" ON shipments FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_china_purchases" ON china_purchases FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_app_colors" ON app_colors FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_hw_blanks" ON hw_blanks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_pkg_blanks" ON pkg_blanks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_marketplace_sets" ON marketplace_sets FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
