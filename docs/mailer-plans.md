Goal

Stand up a tiny, reliable service that:
	1.	Receives Webflow e‑commerce order webhooks
	2.	Fetches workshop guidelines/details from Webflow (Product custom fields or linked CMS)
	3.	Sends workshop‑specific orientation emails via Resend transactional email API
	4.	Logs outcomes in Vercel logs only (no PII stored externally)

⸻

Tech Stack
	•	Frontend / Site: Webflow (storefront) — source of truth for listings
	•	Service: Vercel Serverless Functions (Node.js)
	•	Mail: Resend transactional email API
	•	Infra: Vercel env vars; logs for observability

⸻

High-Level Flow

Webflow (Order Webhook)
   → Vercel /api/webflow/order
      → Fetch Product (and/or linked CMS Item) via Webflow Data API
      → Compose orientation payload (guidelines, date/time, location, etc.)
      → Resend: Send workshop orientation email with dynamic content
      → Log outcome to Vercel console


⸻

Data Model / Content Source of Truth

Choose exactly one for guidelines; keep it consistent.

Option A — Product custom fields (E‑comm)
	•	Product fields: title, slug, sku, guidelines_richtext, location, duration, prep_list, etc.

Option B — CMS collection (recommended if content is long/reused)
	•	CMS: Workshops collection with fields: name, slug, guidelines_richtext, location, duration, parking, what_to_bring, reschedule_policy, faq (rich text), product_ref (Reference to E‑comm product)

CMS takes precedence if product_ref is set.

⸻

API Routes (Vercel Serverless Functions)
	•	POST /api/webflow/order — Webflow e‑comm Order Webhook receiver
	•	Validates signature (if configured) or shared secret
	•	Parses line items (loop if multiple)
	•	For each item → fetchGuidelines(productId) → returns {guidelinesHtml, meta}
	•	Calls resendSendEmail(email, workshopData, templateId)
	•	Logs outcome to console
	•	GET /api/health — returns {ok:true}

⸻

Core Modules
	•	lib/webflow.ts
	•	getProduct(siteId, productId)
	•	getWorkshopCmsItem(siteId, collectionId, itemId)
	•	resolveGuidelines(siteId, { productId, cmsItemId? })
	•	lib/resend.ts
	•	sendWorkshopEmail({ email, workshopData, templateId })
	•	createEmailTemplate(workshopData) — HTML template generation
	•	lib/retry.ts — withBackoff(fn) for 429/5xx

⸻

Environment Variables

WEBFLOW_SITE_ID=...
WEBFLOW_API_TOKEN=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...          # verified sender email
RESEND_TEMPLATE_ID=...         # optional: prebuilt email template ID
WEBFLOW_WEBHOOK_SECRET=...     # optional signature verification


⸻

Mapping: Webflow → Resend

From Order payload:
	•	customer.email
	•	line_items[].productId

Guidelines resolution:
	1.	Try product's workshop_ref → fetch CMS item → use guidelines_richtext and metadata
	2.	Else use product's own custom fields

Resend Email:
	•	Dynamic HTML template with workshop data:
	•	Workshop name, date, location
	•	Guidelines content (HTML)
	•	Customer name and order details
	•	Direct transactional email sending (no audience management needed)

⸻

Idempotency & Repeats
	•	Compute idempotencyKey = hash(orderId + email + productId)
	•	If sent, skip; else process
	•	Resend handles duplicate prevention with built-in idempotency

⸻

Error Handling & Reliability
	•	Wrap Webflow + Resend calls with withBackoff
	•	On failure:
	•	Log error to Vercel console (redact PII)
	•	Return 200 to Webflow to avoid retry storms
	•	Optionally retry internally or alert via Slack (no customer PII)

⸻

Security
	•	Tokens only in Vercel env vars
	•	Verify Webflow webhook with secret/signature
	•	Sanitize guidelines_richtext before injecting into emails

⸻

Local Dev / Tasks
	•	Scaffold Vercel serverless functions
	•	Test with Webflow order payload → assert Resend emails send successfully

⸻

Implementation Checklist
	1.	Resend
	•	Create Resend account and verify sender domain
	•	Create email template (HTML) for workshop orientation
	•	Test email sending with sample data
	2.	Webflow
	•	Add custom fields or CMS collection with guidelines
	•	Add Webhook → Vercel API
	3.	Service
	•	Implement /api/webflow/order
	•	Implement helpers for Webflow + Resend
	•	Add retry + sanitization
	4.	QA
	•	Place test orders; confirm emails send
	•	Confirm workshop guidelines appear in emails
	5.	Deploy
	•	Push to Vercel prod
	•	Rotate API keys

⸻

Future Enhancements
	•	iCal attachment generation
	•	Multi-language campaigns
	•	Per-workshop campaigns (campaign naming convention: orientation__{slug})
	•	Admin UI to browse/retrigger