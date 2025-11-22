-- Security Policies and Constraints for Gift Card Tables
-- Addresses Supabase security advisors and best practices

-- ============================================
-- 1. Row Level Security (RLS) Policies
-- ============================================
-- Note: service_role/secret keys bypass RLS entirely, but enabling RLS is a best practice
-- for defense-in-depth. These policies protect against accidental anon key usage.

-- Enable RLS on gift_card_codes table
ALTER TABLE gift_card_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Block all access via anon key
-- IMPORTANT: service_role/secret keys BYPASS RLS entirely, so they will work normally
-- This policy only blocks anon key access (defense-in-depth)
-- If anon key is accidentally exposed, gift card data remains protected
CREATE POLICY "Block anon access to gift_card_codes"
  ON gift_card_codes
  FOR ALL
  USING (false);  -- Blocks anon key, but service_role bypasses RLS so it still works

-- Enable RLS on gift_card_products table
ALTER TABLE gift_card_products ENABLE ROW LEVEL SECURITY;

-- Policy: Block all access via anon key
-- IMPORTANT: service_role/secret keys BYPASS RLS entirely, so they will work normally
-- This policy only blocks anon key access (defense-in-depth)
CREATE POLICY "Block anon access to gift_card_products"
  ON gift_card_products
  FOR ALL
  USING (false);  -- Blocks anon key, but service_role bypasses RLS so it still works

-- ============================================
-- 2. Check Constraints for Data Validation
-- ============================================

-- Validate status values for gift_card_codes
ALTER TABLE gift_card_codes
  ADD CONSTRAINT gift_card_codes_status_check
  CHECK (status IN ('unused', 'assigned', 'sent', 'invalid'));

-- Validate amount_cents is positive
ALTER TABLE gift_card_codes
  ADD CONSTRAINT gift_card_codes_amount_positive
  CHECK (amount_cents > 0);

-- Validate currency format (ISO 4217)
ALTER TABLE gift_card_codes
  ADD CONSTRAINT gift_card_codes_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');

-- Validate gift_card_products amount_cents is positive
ALTER TABLE gift_card_products
  ADD CONSTRAINT gift_card_products_amount_positive
  CHECK (amount_cents > 0);

-- ============================================
-- 3. Email Validation (Basic)
-- ============================================
-- Add basic email format validation
-- Note: More comprehensive validation should be done in application code

-- Function to validate email format
CREATE OR REPLACE FUNCTION is_valid_email(email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add email validation constraints (nullable fields)
-- Note: We use a trigger since CHECK constraints don't work well with NULL values

CREATE OR REPLACE FUNCTION validate_gift_card_emails()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.purchaser_email IS NOT NULL AND NOT is_valid_email(NEW.purchaser_email) THEN
    RAISE EXCEPTION 'Invalid purchaser_email format: %', NEW.purchaser_email;
  END IF;
  
  IF NEW.recipient_email IS NOT NULL AND NOT is_valid_email(NEW.recipient_email) THEN
    RAISE EXCEPTION 'Invalid recipient_email format: %', NEW.recipient_email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_gift_card_codes_emails
  BEFORE INSERT OR UPDATE ON gift_card_codes
  FOR EACH ROW
  EXECUTE FUNCTION validate_gift_card_emails();

-- ============================================
-- 4. Code Format Validation
-- ============================================
-- Ensure gift card codes are not empty and have reasonable length

ALTER TABLE gift_card_codes
  ADD CONSTRAINT gift_card_codes_code_length
  CHECK (LENGTH(code) >= 3 AND LENGTH(code) <= 100);

-- ============================================
-- 5. Timestamp Validation
-- ============================================
-- Ensure assigned_at and sent_at are logical

CREATE OR REPLACE FUNCTION validate_gift_card_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- assigned_at should be before or equal to sent_at
  IF NEW.assigned_at IS NOT NULL AND NEW.sent_at IS NOT NULL THEN
    IF NEW.assigned_at > NEW.sent_at THEN
      RAISE EXCEPTION 'assigned_at cannot be after sent_at';
    END IF;
  END IF;
  
  -- sent_at should be after created_at
  IF NEW.sent_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
    IF NEW.sent_at < NEW.created_at THEN
      RAISE EXCEPTION 'sent_at cannot be before created_at';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_gift_card_codes_timestamps
  BEFORE INSERT OR UPDATE ON gift_card_codes
  FOR EACH ROW
  EXECUTE FUNCTION validate_gift_card_timestamps();

-- ============================================
-- 6. Indexes for Security Queries
-- ============================================
-- Add indexes for common security-related queries

-- Index for finding codes by order (audit trail)
CREATE INDEX IF NOT EXISTS idx_gift_card_codes_order_id 
  ON gift_card_codes(webflow_order_id) 
  WHERE webflow_order_id IS NOT NULL;

-- Index for finding codes by purchaser email (audit trail)
CREATE INDEX IF NOT EXISTS idx_gift_card_codes_purchaser_email 
  ON gift_card_codes(purchaser_email) 
  WHERE purchaser_email IS NOT NULL;

-- ============================================
-- 7. Comments for Documentation
-- ============================================

COMMENT ON TABLE gift_card_codes IS 
  'Stores gift card discount codes. Accessible only via service_role key (server-side).';

COMMENT ON TABLE gift_card_products IS 
  'Maps Webflow product IDs to gift card denominations. Accessible only via service_role key (server-side).';

COMMENT ON COLUMN gift_card_codes.code IS 
  'Gift card discount code. Must be unique and between 3-100 characters.';

COMMENT ON COLUMN gift_card_codes.status IS 
  'Code status: unused, assigned, sent, or invalid.';

COMMENT ON COLUMN gift_card_codes.purchaser_email IS 
  'Email of the person who purchased the gift card. Validated format.';

COMMENT ON COLUMN gift_card_codes.recipient_email IS 
  'Email of the gift card recipient (if different from purchaser). Validated format.';

