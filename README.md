# Katie Ann Clay Mailer

A transactional email service that automatically sends workshop orientation emails and gift card delivery emails when customers purchase from a Webflow store. Made this for my wife's business because Webflow doesn't have custom transaction emails or gift card support.

## 🚀 Current Status

**Live & Production Ready** - Successfully processing real orders and sending automated emails for Katie Ann Clay's workshop and gift cards.

**Features**:
- ✅ Workshop orientation emails 
- ✅ Retreat pass & accommodation emails
- ✅ Gift card code delivery emails 
- ✅ Automatic code assignment from Supabase
- ✅ Multi-denomination gift card support ($25, $50, $75, $105, $210)
- ✅ Internal email dashboard: view, preview, resend & send test emails (Supabase Auth)
- ✅ Permanent email archive, independent of Resend's retention window

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

### Email Dashboard
An internal, password-protected dashboard (served from the same Vercel deployment) so my wife can see every email the service has sent, without logging into Resend or losing older emails to its retention limit.
1. **Records** every sent email (workshop, retreat, gift card) with its rendered HTML in Supabase
2. **Displays** a searchable, filterable report with at-a-glance counts (24h / 7d / 30d / total)
3. **Previews** the actual rendered email in-app, **resends** any email, and **sends test** samples
4. **Protects** access with Supabase Auth (email/password) plus an optional email allow-list

## Tech Stack

- **Service**: Vercel Serverless Functions (Node.js)
- **Frontend/Site**: Webflow (source of truth for workshop and gift card listings)
- **Dashboard**: Static page + Supabase Auth (email/password), served on the same Vercel deployment
- **Email**: Resend transactional email API
- **Database**: Supabase PostgreSQL (gift card codes, product mappings, email archive)
- **Infrastructure**: Vercel environment variables and logging
- **Security**: Row Level Security (RLS), webhook signature verification, secure logging

## Project Structure

```
├── api/
│   ├── health.js              # Health check endpoint
│   ├── config.js              # Public config for the dashboard (Supabase URL + publishable key)
│   ├── auth/
│   │   └── me.js              # Returns the signed-in dashboard user
│   ├── dashboard/
│   │   ├── emails.js          # Sent-email report + summary counts (auth)
│   │   ├── email-html.js      # Rendered HTML preview of an email (auth)
│   │   ├── resend.js          # Resend a logged email (auth)
│   │   └── test-email.js      # Send a [TEST] sample email (auth)
│   └── webflow/
│       └── order.js           # Webflow order webhook handler (workshops, retreats, gift cards)
├── lib/
│   ├── webflow.js             # Webflow API integration (product detection)
│   ├── resend.js              # Resend API integration (workshop, retreat, gift card emails)
│   ├── supabase.js            # Supabase client (gift card code management)
│   ├── emailLog.js            # Failure-safe logging of every sent email
│   ├── auth.js                # Dashboard auth (Supabase token verification + allow-list)
│   ├── util.js                # Shared helpers (body parsing, formatting, validation)
│   └── retry.js               # Retry logic with exponential backoff
├── migrations/
│   ├── 001_gift_card_codes.sql              # Gift card codes table
│   ├── 002_gift_card_products.sql           # Product mapping table
│   ├── 003_security_policies.sql            # RLS policies and validation
│   ├── 004_populate_gift_card_products.sql  # Product mappings
│   ├── 005_atomic_gift_card_assignment_fix.sql
│   ├── 006_gift_card_recipient_info.sql
│   ├── 007_email_log.sql                    # Email archive table
│   └── 008_email_log_html.sql               # Stored HTML + preview flags
├── public/
│   └── dashboard.html         # Internal email dashboard (static page)
├── scripts/
│   └── backfill-resend.js     # Backfill historical emails from the Resend API
├── assets/
│   └── katie-logo-square-white.jpg    # Email template assets
├── package.json
├── vercel.json
└── env.example                # Environment variables template
```

## API Endpoints

### Health Check
- **GET** `/api/health`
- Returns service status and timestamp

### Webflow Webhook
- **POST** `/api/webflow/order`
- Receives order webhooks from Webflow e-commerce
- **Workshop Orders**: Fetches workshop details and sends orientation emails via Resend
- **Gift Card Orders**: Retrieves unused codes from Supabase, assigns to order, and sends gift card delivery emails via Resend
- Handles both product types in a single order gracefully
- Includes webhook signature verification for security

### Dashboard (authenticated)
All require a valid Supabase session (Bearer token); access is limited to provisioned users.
- **GET** `/api/config`: public Supabase URL + publishable key for the browser client
- **GET** `/api/auth/me`: current signed-in user
- **GET** `/api/dashboard/emails`: filterable, paginated report of sent emails + summary counts
- **GET** `/api/dashboard/email-html`: rendered HTML of a single email (for preview)
- **POST** `/api/dashboard/resend`: resend a previously sent email
- **POST** `/api/dashboard/test-email`: send a `[TEST]` sample of any email type

## Features

### Workshop Emails
- Automatic detection of workshop products (by category or product type)
- Fetches workshop guidelines from Webflow CMS or product custom fields
- Sends branded orientation emails with workshop details
- Includes order information and customer details

### Gift Card System
- **Automatic Detection**: Detects gift card products by category ID
- **Code Management**: Retrieves unused discount codes from Supabase by denomination
- **Lifecycle Tracking**: Tracks code status (unused → assigned → sent)
- **Multi-Denomination**: Supports $25, $50, $75, $105, $210 gift cards
- **Branded Emails**: Beautiful gift card delivery emails with redemption instructions
- **Security**: Row Level Security (RLS), secure logging, webhook verification

### Email Dashboard
- **Access**: Password-protected via Supabase Auth (email/password); users provisioned manually, with an optional `DASHBOARD_ALLOWED_EMAILS` allow-list
- **Report**: Searchable, filterable list of every sent email with 24h / 7d / 30d / total counts
- **Preview**: View the exact rendered email in-app (gift cards re-render from stored data; others from stored HTML)
- **Resend**: Re-send any email straight from the dashboard
- **Test Emails**: Send yourself a `[TEST]` sample of any email type
- **Permanent Archive**: Every send is logged with its HTML, so history survives Resend's retention window
- **Backfill**: `scripts/backfill-resend.js` imports historical emails from the Resend API
