CREATE TABLE IF NOT EXISTS catalog_product_price_tiers (
  id          TEXT PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,
  min_qty     NUMERIC NOT NULL DEFAULT 0,
  price       NUMERIC NOT NULL DEFAULT 0,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_product_price_tiers_business
ON catalog_product_price_tiers(business_id);

CREATE INDEX IF NOT EXISTS idx_catalog_product_price_tiers_product
ON catalog_product_price_tiers(product_id);

ALTER TABLE catalog_product_price_tiers ENABLE ROW LEVEL SECURITY;
