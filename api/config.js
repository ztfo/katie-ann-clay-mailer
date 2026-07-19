/**
 * GET /api/config
 * Public, non-sensitive config for the dashboard's browser-side Supabase client.
 * The publishable/anon key is safe to expose; it is only used for auth sign-in.
 */

module.exports = async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase public config is not set' });
  }

  return res.status(200).json({ supabaseUrl, supabaseAnonKey });
};
