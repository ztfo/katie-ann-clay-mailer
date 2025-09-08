/**
 * Webflow API integration
 */

const axios = require('axios');

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

/**
 * Get Webflow API client
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
 * Fetch product details from Webflow
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
 */
async function resolveGuidelines(siteId, { productId, cmsItemId }) {
  try {
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

    const productResponse = await getProduct(siteId, productId);
    const product = productResponse.product;
    
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
 * Check if a product is a workshop
 */
function isWorkshopProduct(product) {
  const fieldData = product.fieldData || {};
  
  const isService = fieldData['ec-product-type'] === 'c599e43b1a1c34d5a323aedf75d3adf6';
  
  const hasWorkshopCategory = fieldData.category && 
    fieldData.category.includes('66e8d658ede37e2f7706b996');
  
  return isService || hasWorkshopCategory;
}

/**
 * Get all products from a site
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
