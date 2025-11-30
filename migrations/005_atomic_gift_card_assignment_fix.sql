-- Fix for ambiguous column reference in assign_unused_gift_card_code function
-- Run this if you get "column reference 'id' is ambiguous" error

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
  SELECT gift_card_codes.id INTO v_code_id
  FROM gift_card_codes
  WHERE gift_card_codes.status = 'unused'
    AND gift_card_codes.amount_cents = p_amount_cents
  ORDER BY gift_card_codes.created_at ASC  -- FIFO: assign oldest codes first
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
  WHERE gift_card_codes.id = v_code_id;

  -- Return the assigned code (using table name to avoid ambiguity)
  RETURN QUERY
  SELECT
    gift_card_codes.id,
    gift_card_codes.code,
    gift_card_codes.amount_cents,
    gift_card_codes.currency,
    gift_card_codes.status,
    gift_card_codes.webflow_order_id,
    gift_card_codes.purchaser_email,
    gift_card_codes.recipient_email,
    gift_card_codes.recipient_name,
    gift_card_codes.message,
    gift_card_codes.assigned_at,
    gift_card_codes.sent_at,
    gift_card_codes.created_at,
    gift_card_codes.updated_at
  FROM gift_card_codes
  WHERE gift_card_codes.id = v_code_id;
END;
$$ LANGUAGE plpgsql;

