# Katie Ann Clay Mailer

A transactional email service that automatically sends workshop orientation emails and gift card delivery emails when customers purchase from a Webflow store. Made this for my wife's business because Webflow doesn't have custom transaction emails or gift card support.

## 🚀 Current Status

**Live & Production Ready** - Successfully processing real orders and sending automated emails for Katie Ann Clay's workshop and gift cards.

**Features**:
- ✅ Workshop orientation emails 
- ✅ Gift card code delivery emails 
- ✅ Automatic code assignment from Supabase
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
- **Frontend/Site**: Webflow (source of truth for workshop and gift card listings)
- **Email**: Resend transactional email API
- **Database**: Supabase PostgreSQL (gift card codes and product mappings)
- **Infrastructure**: Vercel environment variables and logging
- **Security**: Row Level Security (RLS), webhook signature verification, secure logging

## Project Structure

```
├── api/
│   ├── health.js              # Health check endpoint
│   └── webflow/
│       └── order.js           # Webflow order webhook handler (workshops + gift cards)
├── lib/
│   ├── webflow.js             # Webflow API integration (product detection)
│   ├── resend.js              # Resend API integration (workshop + gift card emails)
│   ├── supabase.js            # Supabase client (gift card code management)
│   └── retry.js               # Retry logic with exponential backoff
├── migrations/
│   ├── 001_gift_card_codes.sql         # Gift card codes table
│   ├── 002_gift_card_products.sql      # Product mapping table
│   ├── 003_security_policies.sql       # RLS policies and validation
│   └── 004_populate_gift_card_products.sql  # Product mappings
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
