/**
 * Captures and logs an error with optional context
 * @param error Error object
 * @param context Additional context information
 */
export const captureError = (error: Error, context?: any): void => {
  console.error('[Error Tracking] Error captured:', error, context || {});
  
  // Here you would typically send this error to your error tracking system
  // Examples: Sentry, Rollbar, New Relic, etc.
};

/**
 * Captures and logs a message with optional context
 * @param message Message to log
 * @param context Additional context information
 */
export const captureMessage = (message: string, context?: any): void => {
  console.error('[Error Tracking] Message captured:', message, context || {});
  
  // Here you would typically send this message to your error tracking system
  // Examples: Sentry, Rollbar, New Relic, etc.
}; 