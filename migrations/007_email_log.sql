-- Email Log
-- Durable record of every transactional email sent (workshop, retreat, gift card).
-- Powers the internal email dashboard (report + resend). Independent of Resend's
-- limited retention. Accessible only via the service_role/secret key (server-side).

-- ============================================
-- 1. Table
-- ============================================
CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type TEXT NOT NULL,
  to_email TEXT NOT NULL,
  recipient_role TEXT,                 -- 'purchaser' | 'recipient' | null
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent' | 'failed' | 'resent'
  resend_message_id TEXT,
  webflow_order_id TEXT,
  product_id TEXT,
  gift_card_code_id UUID REFERENCES gift_card_codes(id),
  amount_cents INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, -- everything needed to reconstruct/resend
  error TEXT,
  resent_from UUID REFERENCES email_log(id),  -- set on rows created by a resend
  triggered_by TEXT,                          -- dashboard user email that triggered a resend
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. Constraints
-- ============================================
ALTER TABLE email_log
  ADD CONSTRAINT email_log_type_check
  CHECK (email_type IN ('workshop', 'retreat', 'gift_card'));

ALTER TABLE email_log
  ADD CONSTRAINT email_log_status_check
  CHECK (status IN ('sent', 'failed', 'resent'));

ALTER TABLE email_log
  ADD CONSTRAINT email_log_recipient_role_check
  CHECK (recipient_role IS NULL OR recipient_role IN ('purchaser', 'recipient'));

-- ============================================
-- 3. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(email_type);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);
CREATE INDEX IF NOT EXISTS idx_email_log_order_id ON email_log(webflow_order_id) WHERE webflow_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_to_email ON email_log(to_email);

-- ============================================
-- 4. Row Level Security (defense-in-depth)
-- ============================================
-- service_role/secret keys BYPASS RLS entirely, so server-side access still works.
-- This policy only blocks anon key access, matching the gift card tables.
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block anon access to email_log"
  ON email_log
  FOR ALL
  USING (false);

-- ============================================
-- 5. Comments
-- ============================================
COMMENT ON TABLE email_log IS
  'Durable log of every transactional email sent. Accessible only via service_role key (server-side).';
COMMENT ON COLUMN email_log.payload IS
  'JSON snapshot of everything needed to reconstruct and resend this email.';
COMMENT ON COLUMN email_log.resent_from IS
  'For rows created by a dashboard resend: the id of the original email_log row.';
COMMENT ON COLUMN email_log.triggered_by IS
  'For resends: the dashboard user (email) who triggered the resend.';

-- ============================================
-- 6. Backfill historical gift card emails
-- ============================================
-- Past gift card sends are the only historical emails we have a durable record of.
-- Workshop/retreat emails were never stored, so they cannot be backfilled.

-- Purchaser copies (every sent code went to the purchaser)
INSERT INTO email_log (
  email_type, to_email, recipient_role, subject, status,
  webflow_order_id, gift_card_code_id, amount_cents, payload, created_at
)
SELECT
  'gift_card',
  gc.purchaser_email,
  'purchaser',
  'Your $' || to_char(gc.amount_cents / 100.0, 'FM999990.00') || ' Gift Card from Katie Ann Clay',
  'sent',
  gc.webflow_order_id,
  gc.id,
  gc.amount_cents,
  jsonb_build_object(
    'code', gc.code,
    'amountCents', gc.amount_cents,
    'recipientName', gc.recipient_name,
    'message', gc.message,
    'isRecipient', false,
    'backfilled', true
  ),
  gc.sent_at
FROM gift_card_codes gc
WHERE gc.status = 'sent'
  AND gc.sent_at IS NOT NULL
  AND gc.purchaser_email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_log el
    WHERE el.gift_card_code_id = gc.id AND el.recipient_role = 'purchaser'
  );

-- Recipient copies (only when a distinct recipient email was on file)
INSERT INTO email_log (
  email_type, to_email, recipient_role, subject, status,
  webflow_order_id, gift_card_code_id, amount_cents, payload, created_at
)
SELECT
  'gift_card',
  gc.recipient_email,
  'recipient',
  'You''ve received a $' || to_char(gc.amount_cents / 100.0, 'FM999990.00') || ' Gift Card from Katie Ann Clay!',
  'sent',
  gc.webflow_order_id,
  gc.id,
  gc.amount_cents,
  jsonb_build_object(
    'code', gc.code,
    'amountCents', gc.amount_cents,
    'recipientName', gc.recipient_name,
    'message', gc.message,
    'isRecipient', true,
    'backfilled', true
  ),
  gc.sent_at
FROM gift_card_codes gc
WHERE gc.status = 'sent'
  AND gc.sent_at IS NOT NULL
  AND gc.recipient_email IS NOT NULL
  AND gc.recipient_email <> gc.purchaser_email
  AND NOT EXISTS (
    SELECT 1 FROM email_log el
    WHERE el.gift_card_code_id = gc.id AND el.recipient_role = 'recipient'
  );
