/**
 * Retry utility with exponential backoff
 * Handles API rate limiting and temporary failures
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with exponential backoff retry
 * @param {Function} fn - Function to execute
 * @param {Object} options - Retry options
 * @param {number} [options.maxRetries=3] - Maximum number of retries
 * @param {number} [options.baseDelay=1000] - Base delay in milliseconds
 * @param {number} [options.maxDelay=10000] - Maximum delay in milliseconds
 * @param {Function} [options.shouldRetry] - Function to determine if error should be retried
 * @returns {Promise} Function result
 */
async function withBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = defaultShouldRetry
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Check if error should be retried
      if (!shouldRetry(error)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );
      
      console.log(`Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms:`, error.message);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Default retry condition
 * Retry on rate limiting (429) and server errors (5xx)
 * @param {Error} error - Error to check
 * @returns {boolean} Whether to retry
 */
function defaultShouldRetry(error) {
  // Check for rate limiting
  if (error.response?.status === 429) {
    return true;
  }
  
  // Check for server errors
  if (error.response?.status >= 500) {
    return true;
  }
  
  // Check for network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  return false;
}

/**
 * Retry with custom condition
 * @param {Function} fn - Function to execute
 * @param {Function} shouldRetry - Custom retry condition
 * @param {Object} options - Retry options
 * @returns {Promise} Function result
 */
async function withCustomRetry(fn, shouldRetry, options = {}) {
  return withBackoff(fn, { ...options, shouldRetry });
}

/**
 * Retry for specific HTTP status codes
 * @param {Function} fn - Function to execute
 * @param {Array<number>} statusCodes - HTTP status codes to retry on
 * @param {Object} options - Retry options
 * @returns {Promise} Function result
 */
async function withStatusRetry(fn, statusCodes, options = {}) {
  const shouldRetry = (error) => {
    return statusCodes.includes(error.response?.status) || defaultShouldRetry(error);
  };
  
  return withBackoff(fn, { ...options, shouldRetry });
}

module.exports = {
  withBackoff,
  withCustomRetry,
  withStatusRetry
};
