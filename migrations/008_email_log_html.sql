-- Store the rendered HTML (and delivery status) of each email so the dashboard
-- can display a full preview permanently — independent of Resend's ~30-day
-- retention. Populated at send time going forward, and by the Resend backfill
-- for historical emails.

ALTER TABLE email_log ADD COLUMN IF NOT EXISTS html TEXT;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS last_event TEXT;

-- Lightweight flag so the list endpoint can tell which rows are previewable
-- without selecting the (large) html payload.
ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS has_html BOOLEAN
  GENERATED ALWAYS AS (html IS NOT NULL) STORED;

COMMENT ON COLUMN email_log.html IS
  'Rendered HTML body of the email, for permanent in-dashboard preview.';
COMMENT ON COLUMN email_log.last_event IS
  'Latest Resend delivery event (delivered, bounced, etc.) when known.';
