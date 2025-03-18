import { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import { startTimer, recordResponseTime } from '../utils/performance';
import { captureError } from '../utils/errorTracking';
import { MonitoringConfig } from '../config/monitoring';

/**
 * Middleware for application monitoring and observability
 */
export class MonitoringMiddleware {
  private config: MonitoringConfig;
  
  constructor(config: MonitoringConfig) {
    this.config = config;
  }
  
  /**
   * Middleware to track response time for requests
   */
  public responseTimeMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.performance.enabled || !this.config.performance.responseTime.enabled) {
        return next();
      }
      
      // Start timing the request
      const endTimer = startTimer();
      
      // Capture response time on response finish
      res.on('finish', () => {
        const timeMs = endTimer();
        recordResponseTime(req.path, req.method, timeMs);
      });
      
      next();
    };
  }
  
  /**
   * Middleware to track and capture errors
   */
  public errorTrackingMiddleware(): ErrorRequestHandler {
    return (err: Error, req: Request, res: Response, next: NextFunction) => {
      if (this.config.errorTracking.enabled && err) {
        captureError(err, {
          path: req.path,
          method: req.method,
          query: req.query,
          // Add other relevant context, but avoid sensitive information
        });
      }
      
      // Pass the error to the next error handler
      next(err);
    };
  }
  
  /**
   * Middleware to set up health check endpoint
   */
  public healthCheckMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.healthCheck.enabled || req.path !== this.config.healthCheck.path) {
        return next();
      }
      
      // Simple health check response
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    };
  }
  
  /**
   * Apply all monitoring middleware to an app
   * @param app Express app
   */
  public applyMiddleware(app: any): void {
    if (this.config.healthCheck.enabled) {
      app.use(this.healthCheckMiddleware());
    }
    
    if (this.config.performance.enabled && this.config.performance.responseTime.enabled) {
      app.use(this.responseTimeMiddleware());
    }
    
    if (this.config.errorTracking.enabled) {
      // Error tracking middleware should be after other middleware
      // but before the final error handler
      app.use(this.errorTrackingMiddleware());
    }
  }
} 