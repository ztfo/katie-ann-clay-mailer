# Katie Ann Clay Mailer

A transactional email service that automatically sends workshop orientation emails and gift card delivery emails when customers purchase from a Webflow store. Made this for my wife's business because Webflow doesn't have custom transaction emails.

## 🚀 Current Status

**Live & Production Ready** - Successfully processing real orders and sending automated emails for Katie Ann Clay's workshop and gift card business.

**Features**:
- ✅ Workshop orientation emails (existing)
- ✅ Gift card code delivery emails (new)
- ✅ Automatic code assignment from Supabase
- ✅ CSV bulk import for gift card codes
- ✅ Multi-denomination gift card support ($25, $50, $75, $105, $210)

**Next Phase** - Being developed into a multi-tenant Webflow Marketplace integration for broader distribution.

## Overview

This service bridges Webflow e-commerce, Supabase, and Resend to create a seamless customer experience:

### Workshop Orders
1. **Receives** Webflow order webhooks when customers purchase workshops
2. **Fetches** workshop details from Webflow (product custom fields or CMS collections)
3. **Sends** workshop orientation emails via Resend transactional email API

### Gift Card Orders
1. **Detects** gift card purchases via product category (gift-cards)
2. **Retrieves** unused discount codes from Supabase by denomination
3. **Assigns** codes to orders and tracks lifecycle (unused → assigned → sent)
4. **Sends** gift card delivery emails with unique discount codes via Resend
5. **Logs** all activities for monitoring (codes logged with last 4 chars only)

## Tech Stack

- **Service**: Vercel Serverless Functions (Node.js)
- **Frontend/Site**: Webflow (source of truth for workshop listings)
- **Email**: Resend transactional email API
- **Infrastructure**: Vercel environment variables and logging
- **Database**: Currently single-tenant (being migrated to multi-tenant)

## Project Structure

```
├── api/
│   ├── health.js              # Health check endpoint
│   └── webflow/
│       └── order.js           # Webflow order webhook handler
├── lib/
│   ├── webflow.js             # Webflow API integration
│   ├── resend.js              # Resend API integration
│   └── retry.js               # Retry logic with exponential backoff
├── docs/
│   ├── webflow-integration-gaps.md    # Integration analysis
│   ├── implementation-roadmap.md      # Development roadmap
│   └── immediate-technical-changes.md # Specific changes needed
├── assets/
│   └── katie-logo-square-white.jpg    # Email template assets
├── package.json
├── vercel.json
└── env.example                # Environment variables template
```

## Setup

### 1. Environment Variables

Copy `env.example` to `.env` and fill in your credentials:

```bash
cp env.example .env
```

Required variables:
- `WEBFLOW_SITE_ID` - Your Webflow site ID
- `WEBFLOW_API_TOKEN` - Webflow API token
- `WEBFLOW_WEBHOOK_SECRET` - Secret for webhook signature verification
- `RESEND_API_KEY` - Resend API key
- `RESEND_FROM_EMAIL` - Verified sender email address

### 2. Install Dependencies

```bash
npm install
```

### 3. Local Development

```bash
npm run dev
```

This starts the Vercel development server at `http://localhost:3000`

### 4. Deploy to Vercel

```bash
npm run deploy
```

## API Endpoints

### Health Check
- **GET** `/api/health`
- Returns service status and timestamp

### Webflow Webhook
- **POST** `/api/webflow/order`
- Receives order webhooks from Webflow e-commerce
- Processes workshop purchases and sends orientation emails via Resend
