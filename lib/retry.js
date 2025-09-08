/**
 * Retry utility with exponential backoff
 */

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with exponential backoff retry
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
      
      if (attempt === maxRetries) {
        break;
      }
      
      if (!shouldRetry(error)) {
        throw error;
      }
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
 */
function defaultShouldRetry(error) {
  if (error.response?.status === 429) {
    return true;
  }
  
  if (error.response?.status >= 500) {
    return true;
  }
  
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  return false;
}

/**
 * Retry with custom condition
 */
async function withCustomRetry(fn, shouldRetry, options = {}) {
  return withBackoff(fn, { ...options, shouldRetry });
}

/**
 * Retry for specific HTTP status codes
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
