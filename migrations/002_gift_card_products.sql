-- Create gift_card_products table
CREATE TABLE IF NOT EXISTS gift_card_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webflow_product_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  label TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on webflow_product_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_gift_card_products_webflow_id ON gift_card_products(webflow_product_id);

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_gift_card_products_updated_at 
  BEFORE UPDATE ON gift_card_products 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

