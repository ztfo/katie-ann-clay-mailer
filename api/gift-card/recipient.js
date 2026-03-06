/**
 * API endpoint for storing gift card recipient information
 * This endpoint is called from the product page form before checkout
 * Stores recipient info temporarily until order webhook arrives
 */

const { storeGiftCardRecipientInfo } = require('../../lib/supabase.js');

// Simple rate limiting: track requests by IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const limit = rateLimitMap.get(key);
  
  if (now > limit.resetAt) {
    // Reset window
    limit.count = 1;
    limit.resetAt = now + RATE_LIMIT_WINDOW;
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  limit.count++;
  return true;
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         'unknown';
}

module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ 
        error: 'Too many requests. Please try again later.' 
      });
    }

    // Validate request body
    const { sessionId, purchaserEmail, recipientEmail, recipientName, message, productId } = req.body;

    // Required fields
    if (!sessionId || !recipientEmail) {
      return res.status(400).json({ 
        error: 'Missing required fields: sessionId and recipientEmail are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(recipientEmail)) {
      return res.status(400).json({ 
        error: 'Invalid recipient email format' 
      });
    }

    if (purchaserEmail && !emailRegex.test(purchaserEmail)) {
      return res.status(400).json({ 
        error: 'Invalid purchaser email format' 
      });
    }

    // Sanitize inputs (basic sanitization)
    const sanitizedData = {
      sessionId: String(sessionId).trim().substring(0, 255),
      purchaserEmail: purchaserEmail ? String(purchaserEmail).trim().substring(0, 255) : null,
      recipientEmail: String(recipientEmail).trim().substring(0, 255),
      recipientName: recipientName ? String(recipientName).trim().substring(0, 255) : null,
      message: message ? String(message).trim().substring(0, 2000) : null,
      productId: productId ? String(productId).trim().substring(0, 255) : null
    };

    // Store recipient info
    const storedInfo = await storeGiftCardRecipientInfo(sanitizedData);

    return res.status(200).json({
      success: true,
      id: storedInfo.id,
      message: 'Recipient information stored successfully'
    });

  } catch (error) {
    console.error('Error storing recipient info:', error);
    
    // Don't expose internal error details
    return res.status(500).json({ 
      error: 'Failed to store recipient information. Please try again.' 
    });
  }
};




