-- Atomic Gift Card Assignment Function
-- Prevents race conditions by using SELECT FOR UPDATE SKIP LOCKED
-- This ensures only one request can assign a specific code at a time

CREATE OR REPLACE FUNCTION assign_unused_gift_card_code(
  p_amount_cents INTEGER,
  p_webflow_order_id TEXT,
  p_purchaser_email TEXT,
  p_recipient_email TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  amount_cents INTEGER,
  currency TEXT,
  status TEXT,
  webflow_order_id TEXT,
  purchaser_email TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  message TEXT,
  assigned_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_code_id UUID;
  v_assigned_at TIMESTAMPTZ;
BEGIN
  -- Get current timestamp
  v_assigned_at := NOW();

  -- Find and lock an unused code atomically
  -- SELECT FOR UPDATE SKIP LOCKED ensures:
  -- 1. Only one transaction can lock a row at a time
  -- 2. If a row is locked, skip it and try the next one
  -- 3. This prevents race conditions completely
  SELECT gcc.id INTO v_code_id
  FROM gift_card_codes gcc
  WHERE gcc.status = 'unused'
    AND gcc.amount_cents = p_amount_cents
  ORDER BY gcc.created_at ASC  -- FIFO: assign oldest codes first
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no code found, raise exception
  IF v_code_id IS NULL THEN
    RAISE EXCEPTION 'No unused gift card codes available for amount: % cents', p_amount_cents;
  END IF;

  -- Update the code atomically
  UPDATE gift_card_codes
  SET
    status = 'assigned',
    webflow_order_id = p_webflow_order_id,
    purchaser_email = p_purchaser_email,
    recipient_email = p_recipient_email,
    recipient_name = p_recipient_name,
    message = p_message,
    assigned_at = v_assigned_at,
    updated_at = NOW()
  WHERE id = v_code_id;

  -- Return the assigned code
  RETURN QUERY
  SELECT
    gcc.id,
    gcc.code,
    gcc.amount_cents,
    gcc.currency,
    gcc.status,
    gcc.webflow_order_id,
    gcc.purchaser_email,
    gcc.recipient_email,
    gcc.recipient_name,
    gcc.message,
    gcc.assigned_at,
    gcc.sent_at,
    gcc.created_at,
    gcc.updated_at
  FROM gift_card_codes gcc
  WHERE gcc.id = v_code_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to service_role (Supabase handles this automatically, but explicit is better)
-- Note: service_role bypasses RLS, so this function will work with SUPABASE_SECRET_KEY

-- Add comment for documentation
COMMENT ON FUNCTION assign_unused_gift_card_code IS 
  'Atomically assigns an unused gift card code to an order. Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions. Returns the assigned code or raises an exception if no codes are available.';

