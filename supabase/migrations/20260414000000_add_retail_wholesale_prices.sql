ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS retail_price NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC;

UPDATE catalog_products
SET retail_price = CASE
  WHEN retail_price IS NULL OR retail_price = 0 THEN base_price
  ELSE retail_price
END
WHERE retail_price IS NULL OR retail_price = 0;

UPDATE catalog_products
SET wholesale_price = retail_price
WHERE wholesale_price IS NULL;
