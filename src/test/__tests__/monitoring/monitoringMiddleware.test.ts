import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { MonitoringMiddleware } from '../../../middlewares/monitoring';

// Mock the performance tracking module
jest.mock('../../../utils/performance', () => ({
  startTimer: jest.fn().mockImplementation(() => {
    const start = process.hrtime();
    return () => {
      const [seconds, nanoseconds] = process.hrtime(start);
      return seconds * 1000 + nanoseconds / 1000000;
    };
  }),
  recordResponseTime: jest.fn()
}));

// Mock the error tracking module
jest.mock('../../../utils/errorTracking', () => ({
  captureError: jest.fn(),
  captureMessage: jest.fn()
}));

describe('Monitoring Middleware', () => {
  let app: Express;
  let performanceTracking: any;
  let errorTracking: any;
  
  beforeEach(() => {
    app = express();
    performanceTracking = require('../../../utils/performance');
    errorTracking = require('../../../utils/errorTracking');
    
    // Reset mocks
    jest.clearAllMocks();
  });
  
  describe('Response Time Tracking', () => {
    it('should track response time for successful requests', async () => {
      // Arrange
      const monitoringMiddleware = new MonitoringMiddleware({
        performance: {
          enabled: true,
          responseTime: {
            enabled: true
          }
        },
        errorTracking: {
          enabled: false
        },
        healthCheck: {
          enabled: true,
          path: '/health'
        }
      });
      
      app.use(monitoringMiddleware.responseTimeMiddleware());
      app.get('/test', (req, res) => {
        res.status(200).json({ message: 'Success' });
      });
      
      // Act
      await request(app).get('/test');
      
      // Assert
      expect(performanceTracking.startTimer).toHaveBeenCalled();
      expect(performanceTracking.recordResponseTime).toHaveBeenCalled();
    });
    
    it('should not track response time when disabled', async () => {
      // Arrange
      const monitoringMiddleware = new MonitoringMiddleware({
        performance: {
          enabled: true,
          responseTime: {
            enabled: false
          }
        },
        errorTracking: {
          enabled: false
        },
        healthCheck: {
          enabled: true,
          path: '/health'
        }
      });
      
      app.use(monitoringMiddleware.responseTimeMiddleware());
      app.get('/test', (req, res) => {
        res.status(200).json({ message: 'Success' });
      });
      
      // Act
      await request(app).get('/test');
      
      // Assert
      expect(performanceTracking.startTimer).not.toHaveBeenCalled();
      expect(performanceTracking.recordResponseTime).not.toHaveBeenCalled();
    });
  });
  
  describe('Error Tracking', () => {
    it('should capture errors in request handling', async () => {
      // Arrange
      const monitoringMiddleware = new MonitoringMiddleware({
        performance: {
          enabled: false,
          responseTime: {
            enabled: false
          }
        },
        errorTracking: {
          enabled: true
        },
        healthCheck: {
          enabled: true,
          path: '/health'
        }
      });
      
      const testError = new Error('Test error');
      
      // Use error middleware correctly
      app.get('/error', (req, res, next) => {
        next(testError);
      });
      
      // Error middleware must be registered after routes
      app.use(monitoringMiddleware.errorTrackingMiddleware());
      
      // Final error handler
      app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        res.status(500).json({ error: err.message });
      });
      
      // Act
      await request(app).get('/error');
      
      // Assert
      expect(errorTracking.captureError).toHaveBeenCalledWith(testError, expect.any(Object));
    });
    
    it('should not capture errors when disabled', async () => {
      // Arrange
      const monitoringMiddleware = new MonitoringMiddleware({
        performance: {
          enabled: false,
          responseTime: {
            enabled: false
          }
        },
        errorTracking: {
          enabled: false
        },
        healthCheck: {
          enabled: true,
          path: '/health'
        }
      });
      
      const testError = new Error('Test error');
      
      app.get('/error', (req, res, next) => {
        next(testError);
      });
      
      app.use(monitoringMiddleware.errorTrackingMiddleware());
      
      app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        res.status(500).json({ error: err.message });
      });
      
      // Act
      await request(app).get('/error');
      
      // Assert
      expect(errorTracking.captureError).not.toHaveBeenCalled();
    });
  });
  
  describe('Health Check', () => {
    it('should provide a health check endpoint', async () => {
      // Arrange
      const monitoringMiddleware = new MonitoringMiddleware({
        performance: {
          enabled: false,
          responseTime: {
            enabled: false
          }
        },
        errorTracking: {
          enabled: false
        },
        healthCheck: {
          enabled: true,
          path: '/health'
        }
      });
      
      app.use(monitoringMiddleware.healthCheckMiddleware());
      
      // Act
      const response = await request(app).get('/health');
      
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
    
    it('should not register health check when disabled', async () => {
      // Arrange
      const monitoringMiddleware = new MonitoringMiddleware({
        performance: {
          enabled: false,
          responseTime: {
            enabled: false
          }
        },
        errorTracking: {
          enabled: false
        },
        healthCheck: {
          enabled: false,
          path: '/health'
        }
      });
      
      app.use(monitoringMiddleware.healthCheckMiddleware());
      
      // Act & Assert
      const response = await request(app).get('/health');
      expect(response.status).toBe(404);
    });
  });
}); 