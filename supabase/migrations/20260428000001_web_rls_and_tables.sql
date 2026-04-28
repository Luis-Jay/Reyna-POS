-- ============================================================
-- Reyna POS — Web Version Additional Tables + RLS Policies
-- Run this in Supabase SQL Editor after the base schema.sql
-- ============================================================

-- Helper: get business_id for the authenticated user
CREATE OR REPLACE FUNCTION get_business_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM businesses WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ─── EXPENSES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'Other',
  description TEXT NOT NULL DEFAULT '',
  amount      NUMERIC NOT NULL DEFAULT 0,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(business_id, date);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- ─── CASHIER SHIFTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashier_shifts (
  id               TEXT PRIMARY KEY,
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  time_in          TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_out         TIMESTAMPTZ,
  start_money      NUMERIC NOT NULL DEFAULT 0,
  end_money        NUMERIC,
  petty_cash_total NUMERIC NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_business ON cashier_shifts(business_id);
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;

-- ─── PETTY CASH ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  shift_id    TEXT NOT NULL REFERENCES cashier_shifts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_shift ON petty_cash(shift_id);
ALTER TABLE petty_cash ENABLE ROW LEVEL SECURITY;

-- ─── LOYALTY ACCOUNTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id             TEXT PRIMARY KEY,
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  phone          TEXT,
  points         NUMERIC NOT NULL DEFAULT 0,
  total_earned   NUMERIC NOT NULL DEFAULT 0,
  total_redeemed NUMERIC NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_business ON loyalty_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_phone ON loyalty_accounts(business_id, phone);
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;

-- ─── LOYALTY TRANSACTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('earn','redeem','adjust')),
  points      NUMERIC NOT NULL DEFAULT 0,
  order_id    TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_account ON loyalty_transactions(account_id);
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- ─── PRICE TIERS (Wholesale / Volume) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_tiers (
  id          BIGSERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  min_qty     NUMERIC NOT NULL,
  price       NUMERIC NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_tiers_product ON price_tiers(business_id, product_id);
ALTER TABLE price_tiers ENABLE ROW LEVEL SECURITY;

-- ─── PRODUCT (PURCHASE) ORDERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_orders (
  id               TEXT PRIMARY KEY,
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  vendor_name      TEXT,
  quantity         NUMERIC NOT NULL DEFAULT 0,
  unit_cost        NUMERIC NOT NULL DEFAULT 0,
  retail_price     NUMERIC,
  wholesale_price  NUMERIC,
  expected_at      DATE,
  received_at      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','received','cancelled')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_orders_business ON product_orders(business_id);
ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;

-- ─── SAVED ORDERS (POS hold-order / park sale) ───────────────────────────────
CREATE TABLE IF NOT EXISTS saved_orders (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  items_json  TEXT NOT NULL,
  total       NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_orders_business ON saved_orders(business_id);
ALTER TABLE saved_orders ENABLE ROW LEVEL SECURITY;

-- ─── STOCK MOVEMENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('sale','restock','adjustment','return')),
  quantity    NUMERIC NOT NULL,
  reference_id TEXT,
  note        TEXT,
  user_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(business_id, product_id);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — one helper function, then one policy per table
-- All policies: business owner full access via get_business_id()
-- ============================================================

-- ─── catalog_products ───────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON catalog_products;
CREATE POLICY "owner_all" ON catalog_products
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── catalog_categories ─────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON catalog_categories;
CREATE POLICY "owner_all" ON catalog_categories
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── catalog_variation_groups ───────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON catalog_variation_groups;
CREATE POLICY "owner_all" ON catalog_variation_groups
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── catalog_variation_options ──────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON catalog_variation_options;
CREATE POLICY "owner_all" ON catalog_variation_options
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── catalog_inventory ──────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON catalog_inventory;
CREATE POLICY "owner_all" ON catalog_inventory
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── sales_orders ───────────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON sales_orders;
CREATE POLICY "owner_all" ON sales_orders
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── sales_order_items ──────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON sales_order_items;
CREATE POLICY "owner_all" ON sales_order_items
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── sales_debtors ──────────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON sales_debtors;
CREATE POLICY "owner_all" ON sales_debtors
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── sales_debtor_transactions ──────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON sales_debtor_transactions;
CREATE POLICY "owner_all" ON sales_debtor_transactions
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── businesses (owner reads own row) ───────────────────────
DROP POLICY IF EXISTS "owner_read" ON businesses;
CREATE POLICY "owner_read" ON businesses
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "owner_insert" ON businesses;
CREATE POLICY "owner_insert" ON businesses
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "owner_update" ON businesses;
CREATE POLICY "owner_update" ON businesses
  FOR UPDATE USING (user_id = auth.uid());

-- ─── cashiers ───────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON cashiers;
CREATE POLICY "owner_all" ON cashiers
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── New tables ─────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_all" ON expenses;
CREATE POLICY "owner_all" ON expenses
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON cashier_shifts;
CREATE POLICY "owner_all" ON cashier_shifts
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON petty_cash;
CREATE POLICY "owner_all" ON petty_cash
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON loyalty_accounts;
CREATE POLICY "owner_all" ON loyalty_accounts
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON loyalty_transactions;
CREATE POLICY "owner_all" ON loyalty_transactions
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON price_tiers;
CREATE POLICY "owner_all" ON price_tiers
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON product_orders;
CREATE POLICY "owner_all" ON product_orders
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON saved_orders;
CREATE POLICY "owner_all" ON saved_orders
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON stock_movements;
CREATE POLICY "owner_all" ON stock_movements
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

-- ─── activations (owner reads own row) ──────────────────────
DROP POLICY IF EXISTS "owner_read" ON activations;
CREATE POLICY "owner_read" ON activations
  FOR SELECT USING (user_id = auth.uid());
