/**
 * Supabase integration for gift card management
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Get Supabase client with secret key (server-side only)
 * Uses the new API key format: sb_secret_...
 * 
 * See: https://github.com/orgs/supabase/discussions/29260
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      'Supabase environment variables are required: SUPABASE_URL, SUPABASE_SECRET_KEY\n' +
      'Get your secret key from Supabase Dashboard: Settings → API Keys\n' +
      'Format: sb_secret_...\n' +
      'See: https://github.com/orgs/supabase/discussions/29260'
    );
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Get unused gift card codes by denomination
 * @param {Object} params
 * @param {number} params.amountCents - Gift card amount in cents (e.g., 2500 for $25)
 * @param {number} params.limit - Maximum number of codes to retrieve
 * @returns {Promise<Array>} Array of unused gift card codes
 */
async function getUnusedGiftCardCodes({ amountCents, limit = 1 }) {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('gift_card_codes')
      .select('*')
      .eq('status', 'unused')
      .eq('amount_cents', amountCents)
      .limit(limit);

    if (error) {
      console.error('Error fetching unused gift card codes:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUnusedGiftCardCodes:', error);
    throw error;
  }
}

/**
 * Assign a gift card code to an order
 * @param {Object} params
 * @param {string} params.codeId - Gift card code UUID
 * @param {Object} params.order - Order details
 * @param {Object} params.purchaser - Purchaser information
 * @param {Object} params.recipient - Recipient information (optional)
 * @returns {Promise<Object>} Updated gift card code
 */
async function assignGiftCardCode({ codeId, order, purchaser, recipient = null }) {
  const supabase = getSupabaseClient();

  try {
    const updateData = {
      status: 'assigned',
      webflow_order_id: order.orderId || order.id,
      purchaser_email: purchaser.email,
      assigned_at: new Date().toISOString()
    };

    // Add recipient info if provided
    if (recipient) {
      if (recipient.email) updateData.recipient_email = recipient.email;
      if (recipient.name) updateData.recipient_name = recipient.name;
      if (recipient.message) updateData.message = recipient.message;
    }

    const { data, error } = await supabase
      .from('gift_card_codes')
      .update(updateData)
      .eq('id', codeId)
      .select()
      .single();

    if (error) {
      console.error('Error assigning gift card code:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in assignGiftCardCode:', error);
    throw error;
  }
}

/**
 * Mark a gift card code as sent
 * @param {string} codeId - Gift card code UUID
 * @returns {Promise<Object>} Updated gift card code
 */
async function markGiftCardSent({ codeId }) {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('gift_card_codes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', codeId)
      .select()
      .single();

    if (error) {
      console.error('Error marking gift card as sent:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in markGiftCardSent:', error);
    throw error;
  }
}

/**
 * Get gift card product mapping by Webflow product ID
 * @param {string} webflowProductId - Webflow product ID
 * @returns {Promise<Object>} Gift card product details
 */
async function getGiftCardProduct(webflowProductId) {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('gift_card_products')
      .select('*')
      .eq('webflow_product_id', webflowProductId)
      .eq('active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      console.error('Error fetching gift card product:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getGiftCardProduct:', error);
    throw error;
  }
}

/**
 * Atomically assign an unused gift card code to an order
 * This prevents race conditions by using a database function with SELECT FOR UPDATE SKIP LOCKED
 * @param {Object} params
 * @param {number} params.amountCents - Gift card amount in cents
 * @param {Object} params.order - Order details
 * @param {Object} params.purchaser - Purchaser information
 * @param {Object} params.recipient - Recipient information (optional)
 * @returns {Promise<Object>} Assigned gift card code
 */
async function assignUnusedGiftCardCodeAtomically({ amountCents, order, purchaser, recipient = null }) {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.rpc('assign_unused_gift_card_code', {
      p_amount_cents: amountCents,
      p_webflow_order_id: order.orderId || order.id,
      p_purchaser_email: purchaser.email,
      p_recipient_email: recipient?.email || null,
      p_recipient_name: recipient?.name || null,
      p_message: recipient?.message || null
    });

    if (error) {
      // Check if error is because no codes are available
      if (error.message && error.message.includes('No unused gift card codes available')) {
        throw new Error(`No unused gift card codes available for $${(amountCents / 100).toFixed(2)}`);
      }
      console.error('Error atomically assigning gift card code:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error(`No unused gift card codes available for $${(amountCents / 100).toFixed(2)}`);
    }

    // RPC returns array, get first element
    // Note: RPC functions return column names as-is (snake_case), but we only access
    // 'code' and 'id' which are the same in both formats, so no conversion needed
    const assignedCode = data[0];
    
    // Ensure we have the required fields (defensive check)
    if (!assignedCode || !assignedCode.code || !assignedCode.id) {
      throw new Error('Invalid response from atomic gift card assignment function');
    }
    
    return assignedCode;
  } catch (error) {
    console.error('Error in assignUnusedGiftCardCodeAtomically:', error);
    throw error;
  }
}

/**
 * Import gift card codes in batch (used by CSV importer)
 * @param {Array} codes - Array of gift card code objects
 * @returns {Promise<Object>} Import results
 */
async function importGiftCardCodes(codes) {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('gift_card_codes')
      .insert(codes)
      .select();

    if (error) {
      console.error('Error importing gift card codes:', error);
      throw error;
    }

    return {
      success: true,
      imported: data ? data.length : 0,
      codes: data
    };
  } catch (error) {
    console.error('Error in importGiftCardCodes:', error);
    throw error;
  }
}

module.exports = {
  getSupabaseClient,
  getUnusedGiftCardCodes,
  assignGiftCardCode,
  assignUnusedGiftCardCodeAtomically,
  markGiftCardSent,
  getGiftCardProduct,
  importGiftCardCodes
};

