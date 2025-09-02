Goal

Stand up a tiny, reliable service that:
	1.	Receives Webflow e‑commerce order webhooks
	2.	Fetches workshop guidelines/details from Webflow (Product custom fields or linked CMS)
	3.	Upserts buyer in Mailchimp Marketing (tags + merge fields)
	4.	Sends a workshop‑specific orientation email via a Mailchimp Campaign/Automation template (no Mandrill)
	5.	Logs outcomes in Vercel logs only (no PII stored externally)

⸻

Tech Stack
	•	Frontend / Site: Webflow (storefront) — source of truth for listings
	•	Service: Vercel Serverless Functions (Node.js)
	•	Mail: Mailchimp Marketing API only (audience, tags, merge fields, campaign trigger)
	•	Infra: Vercel env vars; logs for observability

⸻

High-Level Flow

Webflow (Order Webhook)
   → Vercel /api/webflow/order
      → Fetch Product (and/or linked CMS Item) via Webflow Data API
      → Compose orientation payload (guidelines, date/time, location, etc.)
      → Mailchimp Marketing: upsert member + apply timestamped workshop tag + set merge fields
      → Mailchimp Campaign/Automation: trigger “Workshop Campaign” template, pulling merge vars
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
	•	Calls mailchimpUpsert(email, mergeFields, tags[])
	•	Optionally calls mailchimpTriggerCampaign(templateId, email, mergeVars)
	•	Logs outcome to console
	•	GET /api/health — returns {ok:true}

⸻

Core Modules
	•	lib/webflow.ts
	•	getProduct(siteId, productId)
	•	getWorkshopCmsItem(siteId, collectionId, itemId)
	•	resolveGuidelines(siteId, { productId, cmsItemId? })
	•	lib/mailchimp.ts
	•	upsertMember({ email, mergeFields, tags })
	•	triggerCampaign({ campaignId, to, vars })
	•	normalizeTag(name) — e.g., Wheel-101–2025-11-15
	•	lib/retry.ts — withBackoff(fn) for 429/5xx

⸻

Environment Variables

WEBFLOW_SITE_ID=...
WEBFLOW_API_TOKEN=...
MAILCHIMP_API_KEY=...
MAILCHIMP_SERVER_PREFIX=usX   # from API key
MAILCHIMP_AUDIENCE_ID=...
MC_CAMPAIGN_ID=...             # prebuilt Workshop Campaign/Automation ID
WEBFLOW_WEBHOOK_SECRET=...     # optional signature verification


⸻

Mapping: Webflow → Mailchimp

From Order payload:
	•	customer.email
	•	line_items[].productId

Guidelines resolution:
	1.	Try product’s workshop_ref → fetch CMS item → use guidelines_richtext and metadata
	2.	Else use product’s own custom fields

Mailchimp Marketing (Audience):
	•	Merge fields:
	•	WS_NAME (Text)
	•	WS_DATE (Text)
	•	WS_LOC  (Text)
	•	WORK_GUIDE (Text/HTML)
	•	Tags:
	•	Persistent: Buyer-Workshops
	•	Trigger tag (timestamped per purchase): Wheel-101–2025-11-15

Mailchimp Campaign:
	•	Prebuild a “Workshop Orientation” campaign or automation in Mailchimp with merge vars: *|WS_NAME|*, *|WORK_GUIDE|*, etc.
	•	Our service simply updates merge fields + applies trigger tag; Mailchimp sends automatically.

⸻

Idempotency & Repeats
	•	Compute idempotencyKey = hash(orderId + email + productId)
	•	If sent, skip; else process
	•	Use new timestamped tag per purchase to re-trigger orientation campaigns cleanly

⸻

Error Handling & Reliability
	•	Wrap Webflow + Mailchimp calls with withBackoff
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
	•	Test with Webflow order payload → assert Mailchimp audience updated + campaign sends

⸻

Implementation Checklist
	1.	Mailchimp
	•	Create Audience merge fields: WS_NAME, WS_DATE, WS_LOC, WORK_GUIDE
	•	Build a reusable Workshop Campaign/Automation that sends when a tag is applied, pulling merge fields into the template
	2.	Webflow
	•	Add custom fields or CMS collection with guidelines
	•	Add Webhook → Vercel API
	3.	Service
	•	Implement /api/webflow/order
	•	Implement helpers for Webflow + Mailchimp
	•	Add retry + sanitization
	4.	QA
	•	Place test orders; confirm campaign triggers
	•	Confirm updated guidelines appear in emails
	5.	Deploy
	•	Push to Vercel prod
	•	Rotate API keys

⸻

Future Enhancements
	•	iCal attachment generation
	•	Multi-language campaigns
	•	Per-workshop campaigns (campaign naming convention: orientation__{slug})
	•	Admin UI to browse/retrigger