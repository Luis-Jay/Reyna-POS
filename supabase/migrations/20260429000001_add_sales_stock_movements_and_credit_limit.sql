ALTER TABLE sales_debtors
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sales_stock_movements (
  id           TEXT PRIMARY KEY,
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL,
  type         TEXT NOT NULL CHECK(type IN ('sale','restock','adjustment','return')),
  quantity     NUMERIC NOT NULL DEFAULT 0,
  note         TEXT,
  reference_id TEXT,
  user_id      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_stock_movements_business
ON sales_stock_movements(business_id);

CREATE INDEX IF NOT EXISTS idx_sales_stock_movements_product
ON sales_stock_movements(product_id);

ALTER TABLE sales_stock_movements ENABLE ROW LEVEL SECURITY;
