# Katie Ann Clay Mailer

A transactional email service that automatically sends workshop orientation emails when customers purchase workshops from a Webflow store.

## Overview

This service bridges Webflow e-commerce and Mailchimp to create a seamless customer experience:

1. **Receives** Webflow order webhooks when customers purchase workshops
2. **Fetches** workshop details from Webflow (product custom fields or CMS collections)
3. **Updates** Mailchimp audience with customer info and workshop-specific tags
4. **Triggers** automated emails using pre-built Mailchimp campaigns
5. **Logs** all activities for monitoring (no PII stored externally)

## Tech Stack

- **Service**: Vercel Serverless Functions (Node.js)
- **Frontend/Site**: Webflow (source of truth for workshop listings)
- **Email**: Mailchimp Marketing API
- **Infrastructure**: Vercel environment variables and logging

## Project Structure

```
├── api/
│   ├── health.js              # Health check endpoint
│   └── webflow/
│       └── order.js           # Webflow order webhook handler
├── lib/
│   ├── webflow.js             # Webflow API integration
│   ├── mailchimp.js           # Mailchimp API integration
│   └── retry.js               # Retry logic with exponential backoff
├── docs/
│   └── mailer-plans.md        # Detailed project plan
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
- `MAILCHIMP_API_KEY` - Mailchimp API key
- `MAILCHIMP_SERVER_PREFIX` - Mailchimp server prefix (e.g., us1)
- `MAILCHIMP_AUDIENCE_ID` - Mailchimp audience/list ID

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
- Processes workshop purchases and triggers Mailchimp campaigns

## Configuration

### Mailchimp Setup

1. Create merge fields in your audience:
   - `WS_NAME` (Text) - Workshop name
   - `WS_DATE` (Text) - Workshop date
   - `WS_LOC` (Text) - Workshop location
   - `WORK_GUIDE` (Text/HTML) - Workshop guidelines

2. Create a "Workshop Orientation" campaign/automation that:
   - Triggers when specific tags are applied
   - Uses merge fields: `*|WS_NAME|*`, `*|WORK_GUIDE|*`, etc.

### Webflow Setup

1. Add workshop content via:
   - **Option A**: Product custom fields (guidelines_richtext, location, etc.)
   - **Option B**: CMS collection with workshop details (recommended)

2. Configure webhook to point to your Vercel API:
   - URL: `https://your-domain.vercel.app/api/webflow/order`
   - Events: Order created/updated

## Development

### Testing

Test the webhook locally using a tool like ngrok or by deploying to a staging environment.

### Logs

All processing is logged to Vercel console. No PII is stored externally.

### Error Handling

- Retry logic with exponential backoff for API failures
- Always returns 200 to Webflow to prevent retry storms
- Comprehensive error logging

## Security

- All tokens stored in Vercel environment variables
- Webhook signature verification (when configured)
- Content sanitization before email injection
- No PII stored in external systems

## Future Enhancements

- iCal attachment generation
- Multi-language campaigns
- Per-workshop campaign templates
- Admin UI for managing and retriggering emails