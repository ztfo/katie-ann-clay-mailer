/**
 * Small shared helpers used by the dashboard API endpoints.
 */

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function isValidEmail(email) {
  return EMAIL_RE.test(String(email || ''));
}

/**
 * Format an integer amount of cents as a display string, e.g. 10500 -> "$105.00".
 * Returns '' for null/undefined.
 */
function amountDisplayFromCents(cents) {
  if (cents === null || cents === undefined) return '';
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

/**
 * Read and JSON-parse a request body. Handles the object/string that the
 * platform usually pre-parses, and falls back to reading the raw stream.
 */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

module.exports = {
  EMAIL_RE,
  isValidEmail,
  amountDisplayFromCents,
  readBody
};
