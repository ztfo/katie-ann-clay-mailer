/**
 * Dashboard auth — Supabase-backed.
 *
 * The browser signs in with Supabase Auth (email/password) and sends the
 * resulting access token as a Bearer token on each API request. Here we verify
 * that token server-side against Supabase and return the user. Access is
 * controlled by which users you provision in the Supabase dashboard — any valid
 * Supabase user is authorized.
 */

const { getSupabaseClient } = require('./supabase.js');

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/**
 * Optional allow-list. If DASHBOARD_ALLOWED_EMAILS is set (comma-separated),
 * only those addresses may access the dashboard — a defense-in-depth layer so a
 * stray Supabase signup can never reach the data even if signups are enabled.
 * When unset, any valid Supabase user is allowed (rely on signups being off).
 */
function isAllowedEmail(email) {
  const raw = process.env.DASHBOARD_ALLOWED_EMAILS;
  if (!raw || !raw.trim()) return true;
  const allowed = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(String(email || '').toLowerCase());
}

/**
 * Return { id, email } if the request carries a valid Supabase access token,
 * else null.
 */
async function getSession(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) return null;
    if (!isAllowedEmail(data.user.email)) return null;
    return { id: data.user.id, email: data.user.email };
  } catch (error) {
    console.warn('Auth verification error:', error?.message);
    return null;
  }
}

/**
 * Guard for protected API endpoints. On failure, writes a 401 and returns null.
 */
async function requireAuth(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session;
}

module.exports = {
  getBearerToken,
  getSession,
  requireAuth,
  isAllowedEmail
};
