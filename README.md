# Webflow Email Automation

A transactional email service that automatically sends workshop orientation emails when customers purchase workshops from a Webflow store. Made this for my wife's business because Webflow doesn't have custom transaction emails.

## 🚀 Current Status

**Live** - Successfully processing real orders and sending automated emails for Katie Ann Clay's workshop business.

**Next Phase** - Being developed into a multi-tenant Webflow Marketplace integration for broader distribution.

## Overview

This service bridges Webflow e-commerce and Resend to create a seamless customer experience:

1. **Receives** Webflow order webhooks when customers purchase workshops
2. **Fetches** workshop details from Webflow (product custom fields or CMS collections)
3. **Sends** workshop orientation emails via Resend transactional email API
4. **Logs** all activities for monitoring (no PII stored externally)

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
│   ├── mailer-plans.md        # Original project plan
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

## Configuration

### Resend Setup

1. Create a Resend account at [resend.com](https://resend.com)
2. Verify your sender domain or use a verified email address
3. Get your API key from the Resend dashboard
4. Optionally create email templates in Resend for consistent branding

### Webflow Setup

1. Add workshop content via:
   - **Option A**: Product custom fields (guidelines_richtext, location, etc.)
   - **Option B**: CMS collection with workshop details (recommended)

2. Configure webhook to point to your Vercel API:
   - URL: `https://your-domain.vercel.app/api/webflow/order`
   - Events: Order created/updated

