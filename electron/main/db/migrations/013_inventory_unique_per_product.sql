DELETE FROM inventory
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id
        ORDER BY datetime(updated_at) DESC, rowid DESC
      ) AS row_num
    FROM inventory
  )
  WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_unique ON inventory(product_id);
