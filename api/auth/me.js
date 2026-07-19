/**
 * GET /api/auth/me
 * Verifies the Bearer token and returns the current dashboard user, or 401.
 */

const { getSession } = require('../../lib/auth.js');

module.exports = async function handler(req, res) {
  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.status(200).json({ email: session.email, id: session.id });
};
