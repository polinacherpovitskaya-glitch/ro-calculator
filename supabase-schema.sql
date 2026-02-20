-- =============================================
-- Recycle Object — Calculator Database Schema
-- Supabase PostgreSQL
-- =============================================

-- Глобальные настройки производства
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value NUMERIC,
  unit TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Начальные данные настроек
INSERT INTO settings (key, value, unit, description) VALUES
  ('fot_per_hour', 550, 'р', 'ФОТ производственного персонала в час'),
  ('indirect_costs_monthly', 1913265, 'р', 'Косвенные расходы в месяц'),
  ('cutting_speed', 180, 'шт/ч', 'Скорость срезания лейников'),
  ('plastic_cost_per_kg', 250, 'р', 'Стоимость пластика за кг'),
  ('nfc_write_speed', 350, 'шт/ч', 'Скорость записи NFC метки'),
  ('workers_count', 3.5, 'чел', 'Количество сотрудников на производстве'),
  ('hours_per_worker', 189, 'ч', 'Количество часов работы 1 сотрудника (9*21)'),
  ('work_load_ratio', 0.8, '', 'Коэффициент загрузки (80%)'),
  ('plastic_injection_ratio', 0.7, '', 'Доля времени на литьё пластика (70%)'),
  ('packaging_ratio', 0.3, '', 'Доля времени на упаковку/фурнитуру (30%)'),
  ('mold_base_cost', 20000, 'р', 'Базовая стоимость амортизации молда'),
  ('design_cost', 8500, 'р', 'Стоимость проектирования формы (Игорь)'),
  ('nfc_tag_cost', 10, 'р', 'Стоимость NFC метки'),
  ('vat_rate', 0.05, '', 'Ставка НДС (5%)'),
  ('tax_rate', 0.06, '', 'Ставка налога (6%)'),
  ('margin_target', 0.40, '', 'Целевая маржа (40%)'),
  ('delivery_cost_moscow', 2000, 'р', 'Стоимость доставки по МСК'),
  ('printing_delivery_cost', 1500, 'р', 'Стоимость доставки с печати'),
  ('mp_commission', 0.05, '', 'Комиссия маркетплейса'),
  ('mp_logistics', 0.06, '', 'Логистика маркетплейса'),
  ('mp_storage_ratio', 0.32, '', 'Хранение маркетплейса'),
  ('mp_acquiring', 0.065, '', 'Эквайринг маркетплейса'),
  ('waste_factor', 1.1, '', 'Коэффициент потерь/брака (10%)');

-- Справочник форм/бланков
CREATE TABLE product_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'blank', -- 'blank' | 'custom_old'
  pieces_per_hour_display TEXT, -- "45-60" или "25"
  pieces_per_hour_min NUMERIC,
  pieces_per_hour_max NUMERIC,
  weight_grams NUMERIC,
  has_mold BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Начальные данные бланков (из листа "Кол-во изделий в час")
INSERT INTO product_templates (name, category, pieces_per_hour_display, pieces_per_hour_min, pieces_per_hour_max, weight_grams) VALUES
  ('Прямоугольник-бланк', 'blank', '60', 60, 60, 20),
  ('Кружок-бланк', 'blank', '45-60', 45, 60, 20),
  ('Сердце-бланк', 'blank', '45-60', 45, 60, 20),
  ('Отельный ромбик', 'blank', '40', 40, 40, 30),
  ('Карабин', 'blank', '40-45', 40, 45, 20),
  ('Гребень', 'blank', '15-20', 15, 20, 25),
  ('Картхолдер', 'blank', '20', 20, 20, 30),
  ('Зеркало-клякса', 'blank', '15', 15, 15, 30),
  ('Смайл', 'blank', '15', 15, 15, 30),
  ('Наш тег с лого', 'blank', '200', 200, 200, 5),
  ('Открывашка', 'blank', '20-25', 20, 25, 25),
  ('Зажигалка', 'blank', '25', 25, 25, 20),
  ('Тюльпан (бутон)', 'blank', '25', 25, 25, 20),
  ('Тюльпан (стебель)', 'blank', '30', 30, 30, 15),
  ('НФС-звезда', 'blank', '25', 25, 25, 30),
  ('НФС-сердце', 'blank', '13', 13, 13, 30),
  ('Подставка для телефона', 'blank', '15-20', 15, 20, 40),
  ('Мыльница-органайзер', 'blank', '15-20', 15, 20, 40),
  ('Новогодний шар', 'blank', '8-7', 7, 8, 40),
  ('Волчок', 'blank', '25', 25, 25, 15),
  ('Маленький цветочек', 'blank', '30', 30, 30, 10),
  ('Дракон', 'blank', '15', 15, 15, 40),
  ('Бусины большие', 'blank', '100', 100, 100, 10),
  ('Бусины маленькие', 'blank', '80', 80, 80, 5),
  ('Ключ', 'blank', '80', 80, 80, 10),
  ('Зеркало-сердце', 'blank', '20-25', 20, 25, 30),
  ('Адресник', 'blank', '30', 30, 30, 15),
  ('Буквы', 'blank', '100', 100, 100, 10),
  ('Смотка', 'blank', '25-30', 25, 30, 20),
  ('Ракетка теннис/падел', 'blank', '30', 30, 30, 25),
  ('Велосипед', 'blank', '30', 30, 30, 25),
  ('НФС камень', 'blank', '25', 25, 25, 30),
  ('НФС квадрат', 'blank', '25', 25, 25, 30),
  ('Ласты', 'blank', '25-30', 25, 30, 25),
  ('Кроссовок', 'blank', '30', 30, 30, 25),
  ('Новый кардхолдер', 'blank', '20', 20, 20, 30),
  -- Старые/кастомные формы
  ('Цветок Studio 29', 'custom_old', '25', 25, 25, NULL),
  ('Буквы ASK', 'custom_old', '75', 75, 75, NULL),
  ('Заколки Кальзедония', 'custom_old', '63', 63, 63, NULL),
  ('Мыльница patissoncha', 'custom_old', '8-7', 7, 8, NULL),
  ('Афропик Так и ходи', 'custom_old', '20', 20, 20, NULL),
  ('Расчески Birdie', 'custom_old', '20', 20, 20, NULL);

-- Заказы
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_name TEXT NOT NULL,
  client_name TEXT,
  manager_name TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deadline DATE,
  notes TEXT,

  -- Расчетные итоги (план)
  total_revenue_plan NUMERIC DEFAULT 0,
  total_cost_plan NUMERIC DEFAULT 0,
  total_margin_plan NUMERIC DEFAULT 0,
  margin_percent_plan NUMERIC DEFAULT 0,
  total_hours_plan NUMERIC DEFAULT 0,

  -- Фактические итоги
  total_revenue_fact NUMERIC,
  total_cost_fact NUMERIC,
  total_margin_fact NUMERIC,
  total_hours_fact NUMERIC,

  -- Загрузка производства
  production_hours_plastic NUMERIC DEFAULT 0,
  production_hours_packaging NUMERIC DEFAULT 0,
  production_hours_hardware NUMERIC DEFAULT 0,
  production_load_percent NUMERIC DEFAULT 0
);

-- Позиции заказа (до 6 изделий)
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL,

  -- Входные данные
  product_name TEXT,
  quantity INTEGER DEFAULT 0,
  pieces_per_hour NUMERIC DEFAULT 0,
  weight_grams NUMERIC DEFAULT 0,
  extra_molds INTEGER DEFAULT 0,
  complex_design BOOLEAN DEFAULT false,
  is_nfc BOOLEAN DEFAULT false,
  nfc_programming BOOLEAN DEFAULT false,

  -- Фурнитура
  hardware_qty INTEGER DEFAULT 0,
  hardware_assembly_speed NUMERIC DEFAULT 0,
  hardware_price_per_unit NUMERIC DEFAULT 0,
  hardware_delivery_per_unit NUMERIC DEFAULT 0,

  -- Упаковка
  packaging_qty INTEGER DEFAULT 0,
  packaging_assembly_speed NUMERIC DEFAULT 0,
  packaging_price_per_unit NUMERIC DEFAULT 0,
  packaging_delivery_per_unit NUMERIC DEFAULT 0,

  -- Нанесение
  printing_qty INTEGER DEFAULT 0,
  printing_price_per_unit NUMERIC DEFAULT 0,

  -- Доставка
  delivery_included BOOLEAN DEFAULT false,

  -- Рассчитанная себестоимость (план) — за штуку
  cost_fot NUMERIC DEFAULT 0,
  cost_indirect NUMERIC DEFAULT 0,
  cost_plastic NUMERIC DEFAULT 0,
  cost_mold_amortization NUMERIC DEFAULT 0,
  cost_design NUMERIC DEFAULT 0,
  cost_cutting NUMERIC DEFAULT 0,
  cost_cutting_indirect NUMERIC DEFAULT 0,
  cost_nfc_tag NUMERIC DEFAULT 0,
  cost_nfc_programming NUMERIC DEFAULT 0,
  cost_nfc_indirect NUMERIC DEFAULT 0,
  cost_printing NUMERIC DEFAULT 0,
  cost_delivery NUMERIC DEFAULT 0,
  cost_total NUMERIC DEFAULT 0,

  -- Фурнитура/упаковка себестоимость
  cost_hardware NUMERIC DEFAULT 0,
  cost_packaging NUMERIC DEFAULT 0,

  -- Цена продажи
  sell_price_item NUMERIC DEFAULT 0,
  sell_price_hardware NUMERIC DEFAULT 0,
  sell_price_packaging NUMERIC DEFAULT 0,

  -- Таргет цены
  target_price_item NUMERIC DEFAULT 0,
  target_price_hardware NUMERIC DEFAULT 0,
  target_price_packaging NUMERIC DEFAULT 0,

  -- Часы производства
  hours_plastic NUMERIC DEFAULT 0,
  hours_cutting NUMERIC DEFAULT 0,
  hours_nfc NUMERIC DEFAULT 0,
  hours_hardware NUMERIC DEFAULT 0,
  hours_packaging NUMERIC DEFAULT 0,

  -- Факт
  cost_total_fact NUMERIC,
  hours_total_fact NUMERIC,

  template_id INTEGER REFERENCES product_templates(id)
);

-- Импорт фактических данных из FinTablo
CREATE TABLE fintablo_imports (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  import_date TIMESTAMPTZ DEFAULT now(),
  period_start DATE,
  period_end DATE,

  fact_salary NUMERIC DEFAULT 0,
  fact_materials NUMERIC DEFAULT 0,
  fact_hardware NUMERIC DEFAULT 0,
  fact_delivery NUMERIC DEFAULT 0,
  fact_printing NUMERIC DEFAULT 0,
  fact_molds NUMERIC DEFAULT 0,
  fact_taxes NUMERIC DEFAULT 0,
  fact_other NUMERIC DEFAULT 0,
  fact_total NUMERIC DEFAULT 0,
  fact_revenue NUMERIC DEFAULT 0,

  raw_data JSONB,
  source TEXT DEFAULT 'csv_upload'
);

-- Учет рабочего времени сотрудников
CREATE TABLE time_entries (
  id SERIAL PRIMARY KEY,
  worker_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  hours NUMERIC NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  source TEXT DEFAULT 'manual', -- 'manual' | 'telegram'
  telegram_id BIGINT, -- Telegram user ID (for bot entries)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Обновленная структура order_items: поддержка item_type и printings[]
-- item_type: 'product' | 'hardware' | 'packaging'
-- printings: JSON массив [{name, qty, price}] для продуктов
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'product';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS printings JSONB;

-- Пароль доступа (хешированный)
CREATE TABLE app_config (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL
);

-- Начальный пароль: "recycle2026" (SHA-256 хеш)
INSERT INTO app_config (key, value) VALUES
  ('access_password_hash', 'placeholder_will_be_set_on_first_use');

-- Индексы
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_fintablo_order ON fintablo_imports(order_id);
CREATE INDEX idx_time_entries_date ON time_entries(date DESC);
CREATE INDEX idx_time_entries_worker ON time_entries(worker_name);
CREATE INDEX idx_time_entries_order ON time_entries(order_id);
