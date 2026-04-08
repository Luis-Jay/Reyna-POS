-- Shared catalog sync
CREATE TABLE IF NOT EXISTS catalog_categories (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_business ON catalog_categories(business_id);

CREATE TABLE IF NOT EXISTS catalog_variation_groups (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_variation_groups_business ON catalog_variation_groups(business_id);

CREATE TABLE IF NOT EXISTS catalog_variation_options (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  group_id    TEXT NOT NULL REFERENCES catalog_variation_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price       NUMERIC NOT NULL DEFAULT 0,
  cost        NUMERIC NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_variation_options_business ON catalog_variation_options(business_id);

CREATE TABLE IF NOT EXISTS catalog_products (
  id                  TEXT PRIMARY KEY,
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  image_data          TEXT,
  barcode             TEXT,
  category_id         TEXT REFERENCES catalog_categories(id) ON DELETE SET NULL,
  base_price          NUMERIC NOT NULL DEFAULT 0,
  base_cost           NUMERIC NOT NULL DEFAULT 0,
  markup_pct          NUMERIC,
  has_variations      BOOLEAN NOT NULL DEFAULT false,
  variation_group_id  TEXT REFERENCES catalog_variation_groups(id) ON DELETE SET NULL,
  allow_fractions     BOOLEAN NOT NULL DEFAULT false,
  track_inventory     BOOLEAN NOT NULL DEFAULT true,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  monthly_sold        NUMERIC NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_catalog_products_business ON catalog_products(business_id);

CREATE TABLE IF NOT EXISTS catalog_inventory (
  id            TEXT PRIMARY KEY,
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  quantity      NUMERIC NOT NULL DEFAULT 0,
  low_threshold NUMERIC NOT NULL DEFAULT 5,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_inventory_product ON catalog_inventory(business_id, product_id);

ALTER TABLE catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_variation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_variation_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_inventory ENABLE ROW LEVEL SECURITY;

-- Shared orders / debtors sync
CREATE TABLE IF NOT EXISTS sales_debtors (
  id               TEXT PRIMARY KEY,
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  phone            TEXT,
  balance          NUMERIC NOT NULL DEFAULT 0,
  total_credit     NUMERIC NOT NULL DEFAULT 0,
  total_paid       NUMERIC NOT NULL DEFAULT 0,
  due_date         TEXT,
  follow_up_date   TEXT,
  last_reminder_at TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sales_debtors_business ON sales_debtors(business_id);

CREATE TABLE IF NOT EXISTS sales_debtor_transactions (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  debtor_id   TEXT NOT NULL REFERENCES sales_debtors(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('debt','payment','note')),
  amount      NUMERIC NOT NULL DEFAULT 0,
  profit      NUMERIC NOT NULL DEFAULT 0,
  note        TEXT,
  order_id    TEXT,
  user_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_debtor_transactions_business ON sales_debtor_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_debtor_transactions_debtor ON sales_debtor_transactions(debtor_id);

CREATE TABLE IF NOT EXISTS sales_orders (
  id                TEXT PRIMARY KEY,
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_number      TEXT NOT NULL,
  customer_name     TEXT,
  status            TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','cancelled','void')),
  subtotal          NUMERIC NOT NULL DEFAULT 0,
  discount          NUMERIC NOT NULL DEFAULT 0,
  total             NUMERIC NOT NULL DEFAULT 0,
  payment_amount    NUMERIC,
  change_amount     NUMERIC,
  payment_breakdown JSONB,
  is_credit         BOOLEAN NOT NULL DEFAULT false,
  debtor_id         TEXT REFERENCES sales_debtors(id),
  user_id           TEXT,
  note              TEXT,
  exclude_sales     BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_business_order_number ON sales_orders(business_id, order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_business ON sales_orders(business_id);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id    TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id  TEXT,
  name        TEXT NOT NULL,
  price       NUMERIC NOT NULL,
  cost        NUMERIC NOT NULL DEFAULT 0,
  quantity    NUMERIC NOT NULL,
  subtotal    NUMERIC NOT NULL,
  is_custom   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_business ON sales_order_items(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(order_id);

ALTER TABLE sales_debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_debtor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
