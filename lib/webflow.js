/**
 * Webflow API integration
 * Handles fetching product and CMS data
 */

const axios = require('axios');

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

/**
 * Get Webflow API client with authentication
 */
function getWebflowClient() {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    throw new Error('WEBFLOW_API_TOKEN environment variable is required');
  }

  return axios.create({
    baseURL: WEBFLOW_API_BASE,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Fetch product details from Webflow e-commerce
 * @param {string} siteId - Webflow site ID
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} Product data
 */
async function getProduct(siteId, productId) {
  const client = getWebflowClient();
  
  try {
    const response = await client.get(`/sites/${siteId}/products/${productId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching product ${productId}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Fetch CMS collection item
 * @param {string} siteId - Webflow site ID
 * @param {string} collectionId - CMS collection ID
 * @param {string} itemId - Item ID
 * @returns {Promise<Object>} CMS item data
 */
async function getWorkshopCmsItem(siteId, collectionId, itemId) {
  const client = getWebflowClient();
  
  try {
    const response = await client.get(`/sites/${siteId}/collections/${collectionId}/items/${itemId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching CMS item ${itemId}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Resolve workshop guidelines from product or CMS
 * @param {string} siteId - Webflow site ID
 * @param {Object} options - Resolution options
 * @param {string} options.productId - Product ID
 * @param {string} [options.cmsItemId] - Optional CMS item ID
 * @returns {Promise<Object>} Guidelines and metadata
 */
async function resolveGuidelines(siteId, { productId, cmsItemId }) {
  try {
    // If CMS item ID is provided, fetch from CMS first
    if (cmsItemId && process.env.WEBFLOW_WORKSHOPS_COLLECTION_ID) {
      const cmsItem = await getWorkshopCmsItem(siteId, process.env.WEBFLOW_WORKSHOPS_COLLECTION_ID, cmsItemId);
      
      return {
        name: cmsItem.fieldData?.name || cmsItem.name,
        slug: cmsItem.fieldData?.slug || cmsItem.slug,
        guidelinesHtml: cmsItem.fieldData?.guidelines_richtext || cmsItem.fieldData?.guidelines,
        location: cmsItem.fieldData?.location,
        date: cmsItem.fieldData?.date,
        duration: cmsItem.fieldData?.duration,
        parking: cmsItem.fieldData?.parking,
        whatToBring: cmsItem.fieldData?.what_to_bring,
        reschedulePolicy: cmsItem.fieldData?.reschedule_policy,
        faq: cmsItem.fieldData?.faq,
        source: 'cms'
      };
    }

    // Otherwise, fetch from product custom fields
    const productResponse = await getProduct(siteId, productId);
    const product = productResponse.product; // Webflow API returns nested structure
    
    return {
      name: product.fieldData?.name || product.name,
      slug: product.fieldData?.slug || product.slug,
      guidelinesHtml: product.fieldData?.['workshop-email-content'] || product.fieldData?.['long-description'] || product.customFields?.guidelines_richtext || product.customFields?.guidelines,
      source: 'product'
    };

  } catch (error) {
    console.error('Error resolving guidelines:', error);
    throw error;
  }
}

/**
 * Check if a product is a workshop based on product type and category
 * @param {Object} product - Product object from Webflow
 * @returns {boolean} True if product is a workshop
 */
function isWorkshopProduct(product) {
  const fieldData = product.fieldData || {};
  
  // Check if product type is "Service" (workshops are services)
  const isService = fieldData['ec-product-type'] === 'c599e43b1a1c34d5a323aedf75d3adf6';
  
  // Check if product has "Workshop" category
  const hasWorkshopCategory = fieldData.category && 
    fieldData.category.includes('66e8d658ede37e2f7706b996');
  
  return isService || hasWorkshopCategory;
}

/**
 * Get all products from a site (for debugging/testing)
 * @param {string} siteId - Webflow site ID
 * @returns {Promise<Array>} Array of products
 */
async function getAllProducts(siteId) {
  const client = getWebflowClient();
  
  try {
    const response = await client.get(`/sites/${siteId}/products`);
    return response.data.items;
  } catch (error) {
    console.error('Error fetching products:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  getProduct,
  getWorkshopCmsItem,
  resolveGuidelines,
  isWorkshopProduct,
  getAllProducts
};
