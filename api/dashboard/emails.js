/**
 * GET /api/dashboard/emails  (auth required)
 * Returns a filtered, paginated list of logged emails plus summary counts.
 *
 * Query params:
 *   type    - 'workshop' | 'retreat' | 'gift_card'  (optional)
 *   search  - matches to_email or webflow_order_id   (optional)
 *   days    - only include the last N days            (optional)
 *   limit   - page size (default 50, max 200)
 *   offset  - page offset (default 0)
 */

const { getSupabaseClient } = require('../../lib/supabase.js');
const { requireAuth } = require('../../lib/auth.js');

const VALID_TYPES = ['workshop', 'retreat', 'gift_card'];

function sinceIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireAuth(req, res))) return;

  try {
    const supabase = getSupabaseClient();
    const url = new URL(req.url, 'http://localhost');

    const type = url.searchParams.get('type');
    const search = url.searchParams.get('search');
    const days = parseInt(url.searchParams.get('days'), 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 50, 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset'), 10) || 0, 0);

    const columns = 'id, email_type, to_email, recipient_role, subject, status, resend_message_id, webflow_order_id, amount_cents, has_html, last_event, created_at';
    let query = supabase
      .from('email_log')
      .select(columns, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type && VALID_TYPES.includes(type)) {
      query = query.eq('email_type', type);
    }
    if (Number.isFinite(days) && days > 0) {
      query = query.gte('created_at', sinceIso(days));
    }
    if (search && search.trim()) {
      // Strip characters that are significant in PostgREST filter syntax so the
      // search term can't alter the query (only trusted staff reach here, but
      // this keeps it injection-proof regardless).
      const term = search.trim().replace(/[%,()*\\"]/g, '');
      if (term) {
        query = query.or(`to_email.ilike.%${term}%,webflow_order_id.ilike.%${term}%`);
      }
    }

    const { data, count, error } = await query;
    if (error) throw error;

    // Summary counts (small, internal dataset — a few parallel count queries).
    const countFor = (build) => {
      let q = supabase.from('email_log').select('*', { count: 'exact', head: true });
      return build(q).then(({ count: c }) => c || 0);
    };

    const [total, last24h, last7d, last30d, workshop, retreat, giftCard] = await Promise.all([
      countFor((q) => q),
      countFor((q) => q.gte('created_at', sinceIso(1))),
      countFor((q) => q.gte('created_at', sinceIso(7))),
      countFor((q) => q.gte('created_at', sinceIso(30))),
      countFor((q) => q.eq('email_type', 'workshop')),
      countFor((q) => q.eq('email_type', 'retreat')),
      countFor((q) => q.eq('email_type', 'gift_card'))
    ]);

    return res.status(200).json({
      emails: data || [],
      pagination: { total: count || 0, limit, offset },
      summary: {
        total,
        last24h,
        last7d,
        last30d,
        byType: { workshop, retreat, gift_card: giftCard }
      }
    });
  } catch (error) {
    console.error('Error listing emails:', error);
    return res.status(500).json({ error: 'Failed to load emails' });
  }
};
