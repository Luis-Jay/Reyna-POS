CREATE TABLE IF NOT EXISTS print_queue (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','printed','failed')),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_queue_business ON print_queue(business_id, status, created_at DESC);

ALTER TABLE print_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_print_queue_all" ON print_queue;
CREATE POLICY "business_print_queue_all"
  ON print_queue
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
