/**
 * Starts a timer and returns a function to get the elapsed time in milliseconds
 * @returns Function that returns elapsed time in milliseconds when called
 */
export const startTimer = (): (() => number) => {
  const start = process.hrtime();
  
  return () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    return seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds
  };
};

/**
 * Records the response time for a request
 * @param path Request path
 * @param method HTTP method
 * @param timeMs Time in milliseconds
 */
export const recordResponseTime = (path: string, method: string, timeMs: number): void => {
  console.log(`[Performance] ${method} ${path} completed in ${timeMs.toFixed(2)}ms`);
  
  // Here you would typically send this metric to your monitoring system
  // Examples: Prometheus, Datadog, New Relic, etc.
}; 