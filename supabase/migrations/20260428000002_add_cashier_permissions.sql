ALTER TABLE cashiers
ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cashiers_business_name
ON cashiers (business_id, name);
