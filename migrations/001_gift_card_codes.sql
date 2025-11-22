-- Create gift_card_codes table
CREATE TABLE IF NOT EXISTS gift_card_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'unused',
  webflow_order_id TEXT,
  purchaser_email TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  message TEXT,
  assigned_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on status for faster queries
CREATE INDEX IF NOT EXISTS idx_gift_card_codes_status ON gift_card_codes(status);

-- Create index on amount_cents and status for faster unused code queries
CREATE INDEX IF NOT EXISTS idx_gift_card_codes_amount_status ON gift_card_codes(amount_cents, status);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_gift_card_codes_updated_at 
  BEFORE UPDATE ON gift_card_codes 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

