-- ============================================================
-- Add product_id-leading indexes so FK checks/cascades against
-- catalog_products are fast. Without these, every DELETE from
-- catalog_products (a single product, or a full reset) has to scan
-- these tables to verify no child rows reference the deleted
-- product_id — the existing indexes all lead with business_id, which
-- doesn't help a product_id-only lookup.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_catalog_inventory_product_id ON catalog_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_price_tiers_product_id ON price_tiers(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_product_id ON product_orders(product_id);
