ALTER TABLE products ADD COLUMN retail_price REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN wholesale_price REAL;

UPDATE products
SET retail_price = CASE
  WHEN retail_price IS NULL OR retail_price = 0 THEN base_price
  ELSE retail_price
END
WHERE retail_price IS NULL OR retail_price = 0;

UPDATE products
SET wholesale_price = retail_price
WHERE wholesale_price IS NULL;
