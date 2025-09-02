/**
 * Mailchimp Marketing API integration
 * Handles audience management and campaign triggering
 */

import axios from 'axios';

/**
 * Get Mailchimp API client
 */
function getMailchimpClient() {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

  if (!apiKey || !serverPrefix || !audienceId) {
    throw new Error('Mailchimp environment variables are required: MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_AUDIENCE_ID');
  }

  return axios.create({
    baseURL: `https://${serverPrefix}.api.mailchimp.com/3.0`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Normalize tag name for Mailchimp
 * @param {string} name - Tag name
 * @returns {string} Normalized tag name
 */
export function normalizeTag(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Upsert member in Mailchimp audience
 * @param {Object} options - Member options
 * @param {string} options.email - Member email
 * @param {Object} options.mergeFields - Merge field values
 * @param {Array<string>} options.tags - Tags to apply
 * @returns {Promise<Object>} Member data
 */
export async function upsertMember({ email, mergeFields = {}, tags = [] }) {
  const client = getMailchimpClient();
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

  // Create member hash
  const memberHash = require('crypto')
    .createHash('md5')
    .update(email.toLowerCase())
    .digest('hex');

  try {
    // First, get or create the member
    const memberData = {
      email_address: email,
      status: 'subscribed',
      merge_fields: mergeFields,
      tags: tags.map(normalizeTag)
    };

    const response = await client.put(`/lists/${audienceId}/members/${memberHash}`, memberData);
    
    console.log(`Upserted member ${email} with tags: ${tags.join(', ')}`);
    return response.data;

  } catch (error) {
    console.error(`Error upserting member ${email}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Trigger a Mailchimp campaign
 * @param {Object} options - Campaign options
 * @param {string} options.campaignId - Campaign ID
 * @param {string} options.to - Recipient email
 * @param {Object} options.vars - Merge variables
 * @returns {Promise<Object>} Campaign response
 */
export async function triggerCampaign({ campaignId, to, vars = {} }) {
  const client = getMailchimpClient();

  try {
    // Note: Mailchimp Marketing API doesn't have direct campaign triggering
    // This would typically be handled by:
    // 1. Automation triggers based on tags
    // 2. Transactional API (Mandrill) - but we're avoiding that
    // 3. Pre-built campaigns that send when tags are applied
    
    // For now, we'll just log that we would trigger the campaign
    // The actual sending should be handled by Mailchimp automations
    console.log(`Would trigger campaign ${campaignId} for ${to} with vars:`, vars);
    
    return {
      success: true,
      message: 'Campaign trigger logged - actual sending handled by Mailchimp automation',
      campaignId,
      to,
      vars
    };

  } catch (error) {
    console.error(`Error triggering campaign ${campaignId}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get member from audience
 * @param {string} email - Member email
 * @returns {Promise<Object>} Member data
 */
export async function getMember(email) {
  const client = getMailchimpClient();
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

  const memberHash = require('crypto')
    .createHash('md5')
    .update(email.toLowerCase())
    .digest('hex');

  try {
    const response = await client.get(`/lists/${audienceId}/members/${memberHash}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Member not found
    }
    console.error(`Error fetching member ${email}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Update member tags
 * @param {string} email - Member email
 * @param {Array<string>} tags - Tags to add
 * @returns {Promise<Object>} Updated member data
 */
export async function updateMemberTags(email, tags) {
  const client = getMailchimpClient();
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

  const memberHash = require('crypto')
    .createHash('md5')
    .update(email.toLowerCase())
    .digest('hex');

  try {
    const response = await client.post(`/lists/${audienceId}/members/${memberHash}/tags`, {
      tags: tags.map(tag => ({ name: normalizeTag(tag), status: 'active' }))
    });

    console.log(`Updated tags for ${email}: ${tags.join(', ')}`);
    return response.data;

  } catch (error) {
    console.error(`Error updating tags for ${email}:`, error.response?.data || error.message);
    throw error;
  }
}
