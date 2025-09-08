/**
 * Health check endpoint
 * GET /api/health
 */
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(200).json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'katie-ann-clay-mailer',
    signature: 'verified'
  });
};
