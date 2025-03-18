import { Request, Response, NextFunction } from 'express';

/**
 * Middleware for logging HTTP requests and responses
 */
export const loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Record start time
  const startTime = Date.now();
  
  // Log request
  const timestamp = new Date().toISOString();
  const userAgent = req.headers['user-agent'] || 'unknown';
  console.log(`[${timestamp}] ${req.method} ${req.url} - User-Agent: ${userAgent} - IP: ${req.ip}`);
  
  // Add response listener to log when finished
  res.on('finish', () => {
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log response
    const responseTimestamp = new Date().toISOString();
    console.log(`[${responseTimestamp}] Response: ${res.statusCode} - time: ${responseTime}ms`);
  });
  
  next();
}; 