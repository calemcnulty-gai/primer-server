import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { responseFormatter, ResponseFormatter } from '../../middleware/responseFormatter';

// Extend Express Response for TypeScript
interface ExtendedResponse extends Response {
  formatter: ResponseFormatter;
}

describe('Response Formatter Middleware', () => {
  // Test app setup
  const createApp = (options = {}) => {
    const app = express();
    app.use(express.json());
    
    // Apply the response formatter middleware with options
    app.use(responseFormatter(options));
    
    // Success route
    app.get('/success', (req, res) => {
      res.formatter.success({ data: { message: 'Success' } });
    });
    
    // Custom status route
    app.get('/custom-status', (req, res) => {
      res.formatter.success({ data: { message: 'Created' } }, 201);
    });
    
    // Error route
    app.get('/error', (req, res, next) => {
      const error = new Error('Test error');
      (error as any).code = 'TEST_ERROR';
      next(error);
    });
    
    // Route with custom response
    app.get('/custom', (req: Request, res: Response) => {
      res.formatter.success({ 
        data: { id: 1, name: 'Test' },
        message: 'Custom success'
      });
    });
    
    // Pagination example
    app.get('/paginated', (req: Request, res: Response) => {
      res.formatter.paginated({
        data: [{ id: 1 }, { id: 2 }],
        pagination: {
          page: 1,
          limit: 2,
          total: 10,
          totalPages: 5
        }
      });
    });
    
    // Error handler
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      if (res.formatter) {
        res.formatter.error({
          message: err.message,
          code: (err as any).code || 'TEST_ERROR'
        });
      } else {
        res.status(500).json({ error: err.message });
      }
    });
    
    return app;
  };
  
  describe('Standard Response Format', () => {
    it('should format successful responses', async () => {
      const app = createApp();
      
      const response = await request(app)
        .get('/success')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data.message', 'Success');
      expect(response.body).toHaveProperty('timestamp');
    });
    
    it('should preserve status codes', async () => {
      const app = createApp();
      
      const response = await request(app)
        .get('/custom-status')
        .expect(201);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data.message', 'Created');
    });
    
    it('should format error responses', async () => {
      const app = createApp();
      
      const response = await request(app)
        .get('/error')
        .expect(500);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error.message', 'Test error');
      expect(response.body).toHaveProperty('error.code', 'TEST_ERROR');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
  
  describe('Custom Formatting', () => {
    it('should allow custom success responses', async () => {
      const app = createApp();
      
      const response = await request(app)
        .get('/custom')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data.id', 1);
      expect(response.body).toHaveProperty('data.name', 'Test');
      expect(response.body).toHaveProperty('message', 'Custom success');
      expect(response.body).toHaveProperty('timestamp');
    });
    
    it('should support pagination responses', async () => {
      const app = createApp();
      
      const response = await request(app)
        .get('/paginated')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(2);
      expect(response.body).toHaveProperty('pagination.page', 1);
      expect(response.body).toHaveProperty('pagination.limit', 2);
      expect(response.body).toHaveProperty('pagination.total', 10);
      expect(response.body).toHaveProperty('pagination.totalPages', 5);
    });
  });
  
  describe('Configuration Options', () => {
    it('should allow custom success key', async () => {
      const app = createApp({ successKey: 'ok' });
      
      const response = await request(app)
        .get('/success')
        .expect(200);
      
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).not.toHaveProperty('success');
    });
    
    it('should allow excluding timestamp', async () => {
      const app = createApp({ includeTimestamp: false });
      
      const response = await request(app)
        .get('/success')
        .expect(200);
      
      expect(response.body).not.toHaveProperty('timestamp');
    });
    
    it('should allow custom error format', async () => {
      const app = createApp({ errorKey: 'fault' });
      
      const response = await request(app)
        .get('/error')
        .expect(500);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('fault.message', 'Test error');
      expect(response.body).not.toHaveProperty('error');
    });
  });
}); 