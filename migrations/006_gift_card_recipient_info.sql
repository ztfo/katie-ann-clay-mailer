-- Create gift_card_recipient_info table for temporarily storing recipient information
-- before order completion (since Webflow checkout doesn't support custom fields)
CREATE TABLE IF NOT EXISTS gift_card_recipient_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL, -- Temporary identifier (cart token, session, etc.)
  purchaser_email TEXT, -- Purchaser email (for matching to order)
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  message TEXT,
  product_id TEXT, -- Webflow product ID (optional, for validation)
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours', -- Auto-cleanup
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_gift_card_recipient_info_session ON gift_card_recipient_info(session_id);
CREATE INDEX IF NOT EXISTS idx_gift_card_recipient_info_purchaser ON gift_card_recipient_info(purchaser_email);
CREATE INDEX IF NOT EXISTS idx_gift_card_recipient_info_expires ON gift_card_recipient_info(expires_at);

-- Create index for composite lookup (purchaser_email + product_id)
CREATE INDEX IF NOT EXISTS idx_gift_card_recipient_info_purchaser_product ON gift_card_recipient_info(purchaser_email, product_id);

-- Add RLS policies (block anon access, allow service role)
ALTER TABLE gift_card_recipient_info ENABLE ROW LEVEL SECURITY;

-- Policy: Block all anon access (service role key bypasses RLS)
CREATE POLICY "Block anon access to gift_card_recipient_info"
  ON gift_card_recipient_info
  FOR ALL
  TO anon
  USING (false);

-- Add email validation constraint
ALTER TABLE gift_card_recipient_info
  ADD CONSTRAINT check_recipient_email_format 
  CHECK (recipient_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Optional: Add constraint for purchaser_email if provided
ALTER TABLE gift_card_recipient_info
  ADD CONSTRAINT check_purchaser_email_format 
  CHECK (purchaser_email IS NULL OR purchaser_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Function to automatically clean up expired records (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_recipient_info()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM gift_card_recipient_info
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;




