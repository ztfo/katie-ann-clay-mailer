# Webflow Integration Implementation Roadmap

## Phase 1: Foundation & Multi-Tenancy (Weeks 1-3)

### Week 1: Database & Authentication Setup

#### 1.1 Database Architecture
```sql
-- Supabase PostgreSQL setup
-- Customer management
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  plan VARCHAR(50) DEFAULT 'free',
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Webflow OAuth tokens
CREATE TABLE webflow_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  site_id VARCHAR(255) NOT NULL,
  site_name VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email configurations per site
CREATE TABLE email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES webflow_connections(id) ON DELETE CASCADE,
  resend_api_key TEXT NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  template_id VARCHAR(255),
  webhook_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE email_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  connection_id UUID REFERENCES webflow_connections(id),
  email_type VARCHAR(100),
  sent_at TIMESTAMP DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);
```

#### 1.2 OAuth 2.0 Implementation
```javascript
// lib/auth/webflow-oauth.js
const crypto = require('crypto');

class WebflowOAuth {
  constructor() {
    this.clientId = process.env.WEBFLOW_CLIENT_ID;
    this.clientSecret = process.env.WEBFLOW_CLIENT_SECRET;
    this.redirectUri = process.env.WEBFLOW_REDIRECT_URI;
  }

  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'sites:read sites:write',
      state: state
    });
    
    return `https://webflow.com/oauth/authorize?${params}`;
  }

  async exchangeCodeForToken(code) {
    // Implementation for token exchange
  }

  async refreshToken(refreshToken) {
    // Implementation for token refresh
  }
}
```

### Week 2: Multi-Tenant API Structure

#### 2.1 Customer Context Middleware
```javascript
// middleware/auth.js
async function authenticateCustomer(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const customer = await verifyCustomerToken(token);
    req.customer = customer;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// middleware/site-access.js
async function validateSiteAccess(req, res, next) {
  const { siteId } = req.params;
  const customerId = req.customer.id;

  const connection = await getWebflowConnection(customerId, siteId);
  if (!connection) {
    return res.status(403).json({ error: 'Site not found or access denied' });
  }

  req.connection = connection;
  next();
}
```

#### 2.2 Multi-Tenant Webhook Routing
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
  await processOrderWebhook(req.body, connection, config);
  
  res.status(200).json({ success: true });
}
```

### Week 3: Configuration Management

#### 3.1 Configuration Service
```javascript
// lib/config/email-config.js
class EmailConfigService {
  async getConfig(connectionId) {
    const config = await db.query(`
      SELECT ec.*, wc.site_id, wc.access_token, c.plan
      FROM email_configs ec
      JOIN webflow_connections wc ON ec.connection_id = wc.id
      JOIN customers c ON wc.customer_id = c.id
      WHERE ec.connection_id = $1 AND ec.is_active = true
    `, [connectionId]);
    
    return config.rows[0];
  }

  async updateConfig(connectionId, updates) {
    // Update configuration with validation
  }

  async validateConfig(config) {
    // Validate Resend API key, email format, etc.
  }
}
```

## Phase 2: User Interface & Onboarding (Weeks 4-6)

### Week 4: Customer Dashboard Foundation

#### 4.1 Vue.js/Nuxt.js Setup
```vue
<!-- pages/dashboard/index.vue -->
<template>
  <div class="dashboard">
    <DashboardHeader :customer="customer" />
    <div class="dashboard-content">
      <SitesList :sites="sites" @connect="handleConnect" />
      <EmailTemplates :templates="templates" />
      <Analytics :stats="analytics" />
    </div>
  </div>
</template>

<script setup>
const { data: customer } = await $fetch('/api/customers/me');
const { data: sites } = await $fetch('/api/customers/me/sites');
const { data: templates } = await $fetch('/api/customers/me/templates');
const { data: analytics } = await $fetch('/api/customers/me/analytics');
</script>
```

#### 4.2 Webflow Connection Flow
```vue
<!-- components/WebflowConnect.vue -->
<template>
  <div class="webflow-connect">
    <h2>Connect Your Webflow Site</h2>
    <p>Connect your Webflow site to start sending automated emails</p>
    
    <button @click="startOAuth" class="btn-primary">
      Connect to Webflow
    </button>
    
    <div v-if="connecting" class="loading">
      Redirecting to Webflow...
    </div>
  </div>
</template>

<script setup>
async function startOAuth() {
  const { data } = await $fetch('/api/auth/webflow/authorize');
  window.location.href = data.authorizationUrl;
}
</script>
```

### Week 5: Configuration Management UI

#### 5.1 Email Template Editor
```vue
<!-- components/EmailTemplateEditor.vue -->
<template>
  <div class="template-editor">
    <div class="template-tabs">
      <button 
        v-for="template in templates" 
        :key="template.id"
        @click="activeTemplate = template"
        :class="{ active: activeTemplate.id === template.id }"
      >
        {{ template.name }}
      </button>
    </div>
    
    <div class="template-content">
      <div class="template-preview">
        <EmailPreview :template="activeTemplate" />
      </div>
      
      <div class="template-editor">
        <MonacoEditor 
          v-model="activeTemplate.html"
          language="html"
          @change="updateTemplate"
        />
      </div>
    </div>
  </div>
</template>
```

#### 5.2 Webhook Configuration
```vue
<!-- components/WebhookConfig.vue -->
<template>
  <div class="webhook-config">
    <h3>Webhook Configuration</h3>
    
    <div class="webhook-url">
      <label>Webhook URL</label>
      <input 
        :value="webhookUrl" 
        readonly 
        @click="copyToClipboard"
      />
      <button @click="copyToClipboard">Copy</button>
    </div>
    
    <div class="webhook-instructions">
      <h4>Setup Instructions:</h4>
      <ol>
        <li>Copy the webhook URL above</li>
        <li>Go to your Webflow site settings</li>
        <li>Navigate to E-commerce → Webhooks</li>
        <li>Add a new webhook with this URL</li>
        <li>Select "Order created" event</li>
      </ol>
    </div>
  </div>
</template>
```

### Week 6: Analytics Dashboard

#### 6.1 Usage Analytics
```vue
<!-- components/Analytics.vue -->
<template>
  <div class="analytics">
    <div class="stats-grid">
      <StatCard 
        title="Emails Sent Today"
        :value="stats.today"
        :change="stats.todayChange"
      />
      <StatCard 
        title="Emails Sent This Month"
        :value="stats.month"
        :change="stats.monthChange"
      />
      <StatCard 
        title="Success Rate"
        :value="`${stats.successRate}%`"
        :change="stats.successRateChange"
      />
    </div>
    
    <div class="charts">
      <EmailVolumeChart :data="chartData" />
      <ErrorRateChart :data="errorData" />
    </div>
  </div>
</template>
```

## Phase 3: Billing & Advanced Features (Weeks 7-9)

### Week 7: Billing Integration

#### 7.1 Stripe Integration
```javascript
// lib/billing/stripe.js
class StripeService {
  async createCustomer(customerData) {
    const customer = await stripe.customers.create({
      email: customerData.email,
      name: customerData.name,
      metadata: {
        customerId: customerData.id
      }
    });
    
    return customer;
  }

  async createSubscription(customerId, planId) {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: planId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });
    
    return subscription;
  }
}
```

#### 7.2 Usage Tracking & Rate Limiting
```javascript
// lib/usage/tracker.js
class UsageTracker {
  async trackEmail(customerId, connectionId, emailType) {
    // Track email usage
    await db.query(`
      INSERT INTO email_usage (customer_id, connection_id, email_type)
      VALUES ($1, $2, $3)
    `, [customerId, connectionId, emailType]);
    
    // Check rate limits
    const canSend = await this.checkRateLimit(customerId);
    return canSend;
  }

  async checkRateLimit(customerId) {
    const plan = await this.getCustomerPlan(customerId);
    const usage = await this.getMonthlyUsage(customerId);
    
    return usage < plan.monthlyLimit;
  }
}
```

### Week 8: Advanced Email Features

#### 8.1 Template Management System
```javascript
// lib/email/template-manager.js
class TemplateManager {
  async createTemplate(customerId, templateData) {
    const template = await db.query(`
      INSERT INTO email_templates (customer_id, name, html_content, variables)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [customerId, templateData.name, templateData.html, templateData.variables]);
    
    return template.rows[0];
  }

  async renderTemplate(templateId, variables) {
    const template = await this.getTemplate(templateId);
    return this.processTemplate(template.html_content, variables);
  }
}
```

#### 8.2 Email Scheduling & Queuing
```javascript
// lib/email/queue.js
class EmailQueue {
  async queueEmail(emailData) {
    const job = await db.query(`
      INSERT INTO email_queue (customer_id, connection_id, email_data, scheduled_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [emailData.customerId, emailData.connectionId, emailData, emailData.scheduledAt]);
    
    return job.rows[0];
  }

  async processQueue() {
    const jobs = await this.getPendingJobs();
    for (const job of jobs) {
      await this.processJob(job);
    }
  }
}
```

### Week 9: Error Handling & Monitoring

#### 9.1 Error Tracking System
```javascript
// lib/monitoring/error-tracker.js
class ErrorTracker {
  async trackError(error, context) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      context: context,
      timestamp: new Date(),
      customerId: context.customerId,
      siteId: context.siteId
    };
    
    await db.query(`
      INSERT INTO error_logs (customer_id, site_id, error_data, context)
      VALUES ($1, $2, $3, $4)
    `, [context.customerId, context.siteId, errorData, context]);
    
    // Send alert if critical
    if (this.isCriticalError(error)) {
      await this.sendAlert(errorData);
    }
  }
}
```

## Phase 4: Marketplace Preparation (Weeks 10-12)

### Week 10: Security & Compliance

#### 10.1 Security Audit
- **OAuth 2.0 security** review
- **Data encryption** validation
- **API security** testing
- **Privacy compliance** check

#### 10.2 Documentation
```markdown
# Webflow Email Automation - User Guide

## Getting Started
1. Connect your Webflow site
2. Configure email templates
3. Set up webhook
4. Test your setup

## Features
- Automated workshop emails
- Custom templates
- Analytics dashboard
- Multi-site support
```

### Week 11: Performance & Testing

#### 11.1 Load Testing
```javascript
// tests/load-test.js
import { check } from 'k6';

export default function() {
  const response = http.post('https://api.yourapp.com/webflow/order', {
    // Test payload
  });
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

#### 11.2 End-to-End Testing
```javascript
// tests/e2e/customer-journey.js
describe('Customer Journey', () => {
  test('Complete onboarding flow', async () => {
    // Test OAuth flow
    // Test site connection
    // Test email configuration
    // Test webhook setup
  });
});
```

### Week 12: Marketplace Submission

#### 12.1 Submission Materials
- **App description** and screenshots
- **Demo video** (2-5 minutes)
- **Privacy policy** and terms
- **Support documentation**

#### 12.2 Final Testing
- **Complete feature** testing
- **Security audit** completion
- **Performance optimization**
- **User experience** review

---

## Technical Architecture Summary

### Backend Services
- **API Gateway** (Vercel Functions)
- **Database** (Supabase PostgreSQL)
- **Authentication** (OAuth 2.0 + JWT)
- **Email Service** (Resend)
- **Billing** (Stripe)
- **Monitoring** (Error tracking + analytics)

### Frontend Application
- **Framework** (Nuxt.js/Vue.js)
- **UI Library** (Tailwind CSS)
- **State Management** (Pinia)
- **Authentication** (OAuth flow)

### Infrastructure
- **Hosting** (Vercel)
- **Database** (Supabase)
- **CDN** (Vercel Edge)
- **Monitoring** (Vercel Analytics + custom)

This roadmap provides a comprehensive plan for transforming your current mailer into a full-featured Webflow Marketplace integration.
