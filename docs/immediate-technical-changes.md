# Immediate Technical Changes Required

## Current Code Analysis

### Files That Need Major Refactoring

#### 1. `lib/resend.js` - Email Service
**Current Issues:**
- Hardcoded environment variables
- Single-tenant configuration
- No customer context

**Required Changes:**
```javascript
// BEFORE (Current)
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  return new Resend(apiKey);
}

// AFTER (Multi-tenant)
function getResendClient(customerConfig) {
  const apiKey = customerConfig.resendApiKey;
  const fromEmail = customerConfig.fromEmail;
  return new Resend(apiKey);
}
```

#### 2. `lib/webflow.js` - Webflow API
**Current Issues:**
- Single site configuration
- No OAuth token management
- Hardcoded site ID

**Required Changes:**
```javascript
// BEFORE (Current)
function getWebflowClient() {
  const token = process.env.WEBFLOW_API_TOKEN;
  return axios.create({
    baseURL: WEBFLOW_API_BASE,
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

// AFTER (Multi-tenant)
function getWebflowClient(connection) {
  const token = connection.accessToken;
  return axios.create({
    baseURL: WEBFLOW_API_BASE,
    headers: { 'Authorization': `Bearer ${token}` }
  });
}
```

#### 3. `api/webflow/order.js` - Webhook Handler
**Current Issues:**
- No customer identification
- Global configuration
- No multi-tenant routing

**Required Changes:**
```javascript
// BEFORE (Current)
module.exports = async function handler(req, res) {
  const order = req.body;
  const siteId = process.env.WEBFLOW_SITE_ID;
  // Process with global config
}

// AFTER (Multi-tenant)
module.exports = async function handler(req, res) {
  const { webhookId } = req.query;
  const connection = await getConnectionByWebhookId(webhookId);
  const config = await getEmailConfig(connection.id);
  // Process with customer-specific config
}
```

---

## Database Schema Implementation

### Supabase Setup Required

```sql
-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  plan VARCHAR(50) DEFAULT 'free',
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create webflow_connections table
CREATE TABLE webflow_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  site_id VARCHAR(255) NOT NULL,
  site_name VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  webhook_id VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create email_configs table
CREATE TABLE email_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID REFERENCES webflow_connections(id) ON DELETE CASCADE,
  resend_api_key TEXT NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  template_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create email_usage table
CREATE TABLE email_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  connection_id UUID REFERENCES webflow_connections(id),
  email_type VARCHAR(100),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- 6. Create indexes for performance
CREATE INDEX idx_webflow_connections_customer_id ON webflow_connections(customer_id);
CREATE INDEX idx_webflow_connections_webhook_id ON webflow_connections(webhook_id);
CREATE INDEX idx_email_configs_connection_id ON email_configs(connection_id);
CREATE INDEX idx_email_usage_customer_id ON email_usage(customer_id);
CREATE INDEX idx_email_usage_sent_at ON email_usage(sent_at);
```

---

## OAuth 2.0 Implementation

### Webflow OAuth Setup

#### 1. Environment Variables Needed
```bash
# Add to .env
WEBFLOW_CLIENT_ID=your_client_id
WEBFLOW_CLIENT_SECRET=your_client_secret
WEBFLOW_REDIRECT_URI=https://yourapp.com/auth/webflow/callback
JWT_SECRET=your_jwt_secret
DATABASE_URL=your_supabase_url
```

#### 2. OAuth Service Implementation
```javascript
// lib/auth/webflow-oauth.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class WebflowOAuth {
  constructor() {
    this.clientId = process.env.WEBFLOW_CLIENT_ID;
    this.clientSecret = process.env.WEBFLOW_CLIENT_SECRET;
    this.redirectUri = process.env.WEBFLOW_REDIRECT_URI;
    this.jwtSecret = process.env.JWT_SECRET;
  }

  getAuthorizationUrl(customerId) {
    const state = crypto.randomBytes(32).toString('hex');
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'sites:read sites:write',
      state: `${customerId}:${state}`
    });
    
    return {
      url: `https://webflow.com/oauth/authorize?${params}`,
      state: `${customerId}:${state}`
    };
  }

  async exchangeCodeForToken(code, state) {
    const [customerId] = state.split(':');
    
    const response = await fetch('https://api.webflow.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await response.json();
    
    // Store tokens in database
    await this.storeTokens(customerId, tokens);
    
    return tokens;
  }

  async storeTokens(customerId, tokens) {
    const { access_token, refresh_token, expires_in } = tokens;
    const expiresAt = new Date(Date.now() + expires_in * 1000);
    
    // Store in database
    await db.query(`
      INSERT INTO webflow_connections (customer_id, access_token, refresh_token, token_expires_at, webhook_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [customerId, access_token, refresh_token, expiresAt, crypto.randomUUID()]);
  }
}
```

---

## API Endpoints Required

### New API Structure

#### 1. Authentication Endpoints
```javascript
// api/auth/webflow/authorize.js
export default async function handler(req, res) {
  const { customerId } = req.query;
  const oauth = new WebflowOAuth();
  const { url, state } = oauth.getAuthorizationUrl(customerId);
  
  // Store state for verification
  await storeOAuthState(state);
  
  res.redirect(url);
}

// api/auth/webflow/callback.js
export default async function handler(req, res) {
  const { code, state } = req.query;
  const oauth = new WebflowOAuth();
  
  try {
    await oauth.exchangeCodeForToken(code, state);
    res.redirect('/dashboard?connected=true');
  } catch (error) {
    res.redirect('/dashboard?error=connection_failed');
  }
}
```

#### 2. Customer Management Endpoints
```javascript
// api/customers/[id]/sites.js
export default async function handler(req, res) {
  const { id } = req.query;
  
  if (req.method === 'GET') {
    const sites = await getCustomerSites(id);
    res.json(sites);
  }
  
  if (req.method === 'POST') {
    const site = await createSiteConnection(id, req.body);
    res.json(site);
  }
}

// api/customers/[id]/config.js
export default async function handler(req, res) {
  const { id } = req.query;
  
  if (req.method === 'GET') {
    const config = await getCustomerConfig(id);
    res.json(config);
  }
  
  if (req.method === 'PUT') {
    const config = await updateCustomerConfig(id, req.body);
    res.json(config);
  }
}
```

#### 3. Multi-Tenant Webhook Endpoint
```javascript
// api/webflow/order/[webhookId].js
export default async function handler(req, res) {
  const { webhookId } = req.query;
  
  // Get connection by webhook ID
  const connection = await getConnectionByWebhookId(webhookId);
  if (!connection) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  // Get customer configuration
  const config = await getEmailConfig(connection.id);
  
  // Process with customer-specific config
  try {
    const result = await processOrderWebhook(req.body, connection, config);
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(200).json({ success: false, error: error.message });
  }
}
```

---

## Configuration Management

### Customer Configuration Service

```javascript
// lib/config/customer-config.js
class CustomerConfigService {
  async getConfig(customerId) {
    const config = await db.query(`
      SELECT 
        c.*,
        wc.site_id,
        wc.site_name,
        wc.access_token,
        ec.resend_api_key,
        ec.from_email,
        ec.template_id
      FROM customers c
      LEFT JOIN webflow_connections wc ON c.id = wc.customer_id
      LEFT JOIN email_configs ec ON wc.id = ec.connection_id
      WHERE c.id = $1
    `, [customerId]);
    
    return config.rows[0];
  }

  async updateEmailConfig(connectionId, updates) {
    const { resendApiKey, fromEmail, templateId } = updates;
    
    await db.query(`
      UPDATE email_configs 
      SET resend_api_key = $1, from_email = $2, template_id = $3, updated_at = NOW()
      WHERE connection_id = $4
    `, [resendApiKey, fromEmail, templateId, connectionId]);
  }

  async validateConfig(config) {
    const errors = [];
    
    if (!config.resendApiKey) {
      errors.push('Resend API key is required');
    }
    
    if (!config.fromEmail || !this.isValidEmail(config.fromEmail)) {
      errors.push('Valid from email is required');
    }
    
    return errors;
  }
}
```

---

## Migration Strategy

### Phase 1: Database Setup (Week 1)
1. **Set up Supabase** project
2. **Create database schema** as shown above
3. **Set up environment variables** for database connection
4. **Create database connection** utility

### Phase 2: OAuth Implementation (Week 2)
1. **Register Webflow app** for OAuth
2. **Implement OAuth flow** as shown above
3. **Create authentication** middleware
4. **Test OAuth flow** end-to-end

### Phase 3: Multi-Tenant Refactoring (Week 3)
1. **Refactor existing services** to accept customer context
2. **Update webhook handler** for multi-tenant routing
3. **Create configuration** management system
4. **Test with multiple** customer configurations

### Phase 4: API Endpoints (Week 4)
1. **Create customer management** endpoints
2. **Create configuration** endpoints
3. **Create analytics** endpoints
4. **Test all endpoints** thoroughly

---

## Testing Strategy

### Unit Tests
```javascript
// tests/lib/resend.test.js
describe('Resend Service', () => {
  test('should create client with customer config', () => {
    const config = { resendApiKey: 'test-key', fromEmail: 'test@example.com' };
    const client = getResendClient(config);
    expect(client).toBeDefined();
  });
});
```

### Integration Tests
```javascript
// tests/api/webhook.test.js
describe('Webhook Handler', () => {
  test('should process order with customer config', async () => {
    const webhookId = 'test-webhook-id';
    const order = { /* test order data */ };
    
    const response = await request(app)
      .post(`/api/webflow/order/${webhookId}`)
      .send(order);
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

This document provides the specific technical changes needed to transform your current single-tenant mailer into a multi-tenant Webflow integration ready for the marketplace.
