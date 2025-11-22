-- Populate gift_card_products table with Webflow product mappings
-- Run this after creating the gift_card_products table (002_gift_card_products.sql)

-- Insert gift card product mappings
INSERT INTO gift_card_products (webflow_product_id, amount_cents, label, active)
VALUES 
  ('692249f1d31c7799c916ba62', 2500, 'Gift Card – $25', true),
  ('69224a5905f83c411c539e32', 5000, 'Gift Card – $50', true),
  ('69224a9a9ff642a6c601e31f', 7500, 'Gift Card – $75', true),
  ('69224ad55e493982669727ce', 10500, 'Gift Card – $105', true),
  ('69224b080e6c6c565eb4ab7c', 21000, 'Gift Card – $210', true)
ON CONFLICT (webflow_product_id) 
DO UPDATE SET
  amount_cents = EXCLUDED.amount_cents,
  label = EXCLUDED.label,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Verify the insert
SELECT 
  webflow_product_id,
  amount_cents,
  label,
  active,
  created_at
FROM gift_card_products
ORDER BY amount_cents;

