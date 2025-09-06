#!/bin/bash

# Test Webhook with Curl - Simulates a Webflow Order
# This simulates a customer purchasing a workshop

echo "🧪 Testing Webflow Order Webhook with Curl..."
echo ""

# Your production webhook URL
WEBHOOK_URL="https://katie-ann-clay-mailer-iipqcek2r-ztfo-projects.vercel.app/api/webflow/order"

# Sample order payload (simulating Webflow's webhook format)
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Webflow-Webhooks/1.0" \
  -d '{
    "orderId": "test-order-' $(date +%s) '",
    "customer": {
      "email": "test@example.com",
      "name": "Jane Smith",
      "firstName": "Jane",
      "lastName": "Smith"
    },
    "lineItems": [
      {
        "productId": "68b9ff6a8b58a455d7dc60b8",
        "name": "Red Mica Altars at Cosmic Plant Co.",
        "quantity": 1,
        "price": {
          "value": 10500,
          "unit": "USD"
        }
      }
    ],
    "orderTotal": {
      "value": 10500,
      "unit": "USD"
    },
    "orderDate": "' $(date -u +%Y-%m-%dT%H:%M:%S.000Z) '",
    "orderStatus": "paid"
  }' \
  -w "\n\n📊 Response Details:\nHTTP Status: %{http_code}\nTotal Time: %{time_total}s\n" \
  -v

echo ""
echo "✅ Webhook test completed!"
echo "📧 Check your email (test@example.com) for the workshop orientation email"
