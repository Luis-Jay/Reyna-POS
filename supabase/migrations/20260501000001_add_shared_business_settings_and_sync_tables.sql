CREATE TABLE IF NOT EXISTS business_settings (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, key)
);

CREATE INDEX IF NOT EXISTS idx_business_settings_business
ON business_settings(business_id);

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS stock_batches (
  id                 TEXT PRIMARY KEY,
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id         TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  initial_quantity   NUMERIC NOT NULL DEFAULT 0,
  remaining_quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost          NUMERIC NOT NULL DEFAULT 0,
  retail_price       NUMERIC NOT NULL DEFAULT 0,
  wholesale_price    NUMERIC,
  source_order_id    TEXT REFERENCES product_orders(id) ON DELETE SET NULL,
  note               TEXT,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_business
ON stock_batches(business_id, product_id, received_at);

ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS return_events (
  id            TEXT PRIMARY KEY,
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id      TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  order_item_id TEXT REFERENCES sales_order_items(id) ON DELETE SET NULL,
  product_id    TEXT REFERENCES catalog_products(id) ON DELETE SET NULL,
  item_name     TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('refund','damage')),
  quantity      NUMERIC NOT NULL DEFAULT 0,
  amount        NUMERIC NOT NULL DEFAULT 0,
  cost_amount   NUMERIC NOT NULL DEFAULT 0,
  note          TEXT,
  user_id       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_events_business
ON return_events(business_id, created_at DESC);

ALTER TABLE return_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all" ON business_settings;
CREATE POLICY "owner_all" ON business_settings
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON stock_batches;
CREATE POLICY "owner_all" ON stock_batches
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());

DROP POLICY IF EXISTS "owner_all" ON return_events;
CREATE POLICY "owner_all" ON return_events
  FOR ALL USING (business_id = get_business_id())
  WITH CHECK (business_id = get_business_id());
