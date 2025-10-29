// Cloud utilities for retry logic and error handling (Node.js version)

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

/**
 * Retry a function with exponential backoff
 */
const retryWithBackoff = async (fn, config = {}) => {
  const {
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelay = RETRY_CONFIG.baseDelay,
    maxDelay = RETRY_CONFIG.maxDelay,
    backoffMultiplier = RETRY_CONFIG.backoffMultiplier,
  } = config;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }
      
      // Don't delay on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );
      
      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * Check if an error should not be retried
 */
const isNonRetryableError = (error) => {
  if (error.name === 'UnauthorizedOperation' || 
      error.name === 'InvalidUserID.NotFound' ||
      error.message?.includes('Unauthorized')) {
    return true;
  }
  
  if (error.name === 'ValidationException' ||
      error.message?.includes('InvalidParameterValue')) {
    return true;
  }
  
  if (error.name === 'ResourceNotFoundException' ||
      error.message?.includes('does not exist')) {
    return true;
  }
  
  return false;
};

/**
 * Handle cloud operation errors with user-friendly messages
 */
const handleCloudError = (error, operation = 'operation') => {
  console.error(`Cloud ${operation} error:`, error);
  
  let userMessage = 'An unexpected error occurred';
  
  if (error.name === 'NetworkError' || error.message?.includes('network')) {
    userMessage = 'Network connection error. Please check your internet connection.';
  } else if (error.name === 'UnauthorizedOperation') {
    userMessage = 'Authentication error. Please log in again.';
  } else if (error.name === 'ValidationException') {
    userMessage = 'Invalid data provided. Please check your input.';
  } else if (error.name === 'ResourceNotFoundException') {
    userMessage = 'Resource not found. It may have been deleted.';
  } else if (error.name === 'ConditionalCheckFailedException') {
    userMessage = 'Operation failed due to a conflict. Please try again.';
  } else if (error.message?.includes('timeout')) {
    userMessage = 'Request timed out. Please try again.';
  }
  
  return {
    success: false,
    error: userMessage,
    originalError: error.message,
  };
};

/**
 * Execute a cloud operation with retry logic and error handling
 */
const executeCloudOperation = async (operation, operationName, retryConfig = {}) => {
  try {
    const result = await retryWithBackoff(operation, retryConfig);
    return { success: true, ...result };
  } catch (error) {
    return handleCloudError(error, operationName);
  }
};

module.exports = { executeCloudOperation, RETRY_CONFIG };

