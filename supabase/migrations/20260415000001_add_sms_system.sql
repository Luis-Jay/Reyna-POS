-- SMS credits balance per business
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sms_credits INTEGER NOT NULL DEFAULT 0;

-- SMS send log
CREATE TABLE IF NOT EXISTS sms_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recipient    TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'failed'
  error        TEXT,
  credits_used INTEGER NOT NULL DEFAULT 1,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_log_business ON sms_log(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_sent_at  ON sms_log(business_id, sent_at DESC);
