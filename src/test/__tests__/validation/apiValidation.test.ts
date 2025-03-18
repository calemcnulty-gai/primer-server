import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiValidation } from '../../../controllers/middleware/apiValidation';

describe('API Validation Middleware Controller', () => {
  // Sample schemas for API endpoints
  const userSchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    age: z.number().int().positive().optional()
  });

  const createItemSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(10).optional(),
    price: z.number().positive(),
    category: z.enum(['electronics', 'clothing', 'food', 'other'])
  });

  const updateItemSchema = createItemSchema.partial();

  // Test app setup
  const app = express();
  app.use(express.json());
  
  // Create API validation controller
  const apiValidation = new ApiValidation();
  
  // Set up routes with validation
  app.post('/api/v1/users', apiValidation.validate('body', userSchema), (req: Request, res: Response) => {
    res.status(201).json({ success: true, user: req.body });
  });
  
  app.post('/api/v1/items', apiValidation.validate('body', createItemSchema), (req: Request, res: Response) => {
    res.status(201).json({ success: true, item: req.body });
  });
  
  app.patch('/api/v1/items/:id', apiValidation.validate('body', updateItemSchema), (req: Request, res: Response) => {
    res.status(200).json({ success: true, itemId: req.params.id, updates: req.body });
  });
  
  app.get('/api/v1/items', apiValidation.validate('query', z.object({
    page: z.string().transform(Number).pipe(z.number().int().positive()).optional().default('1'),
    limit: z.string().transform(Number).pipe(z.number().int().positive().max(100)).optional().default('20'),
    sort: z.enum(['price_asc', 'price_desc', 'name_asc', 'name_desc']).optional(),
    category: z.enum(['electronics', 'clothing', 'food', 'other']).optional()
  })), (req: Request, res: Response) => {
    res.status(200).json({ success: true, query: req.query });
  });

  describe('Body validation', () => {
    it('should accept valid user data', async () => {
      const validUser = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };
      
      const response = await request(app)
        .post('/api/v1/users')
        .send(validUser)
        .expect(201);
        
      expect(response.body).toEqual({
        success: true,
        user: validUser
      });
    });
    
    it('should reject invalid user data', async () => {
      const invalidUser = {
        name: 'Jo', // too short
        email: 'invalid-email',
        age: -5 // negative
      };
      
      const response = await request(app)
        .post('/api/v1/users')
        .send(invalidUser)
        .expect(400);
        
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Validation failed');
      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });
    
    it('should accept valid item data', async () => {
      const validItem = {
        title: 'Smartphone',
        description: 'The latest smartphone with amazing features',
        price: 799.99,
        category: 'electronics'
      };
      
      const response = await request(app)
        .post('/api/v1/items')
        .send(validItem)
        .expect(201);
        
      expect(response.body).toEqual({
        success: true,
        item: validItem
      });
    });
    
    it('should reject item with invalid category', async () => {
      const invalidItem = {
        title: 'Invalid item',
        description: 'This has an invalid category',
        price: 50,
        category: 'invalid-category' // not in enum
      };
      
      const response = await request(app)
        .post('/api/v1/items')
        .send(invalidItem)
        .expect(400);
        
      expect(response.body).toHaveProperty('error');
      expect(response.body.errors.some((err: any) => 
        err.path.includes('category'))).toBe(true);
    });
  });
  
  describe('Partial updates', () => {
    it('should accept partial item updates', async () => {
      const partialUpdate = {
        price: 899.99
      };
      
      const response = await request(app)
        .patch('/api/v1/items/123')
        .send(partialUpdate)
        .expect(200);
        
      expect(response.body).toEqual({
        success: true,
        itemId: '123',
        updates: partialUpdate
      });
    });
    
    it('should reject invalid partial updates', async () => {
      const invalidUpdate = {
        price: -50 // negative price
      };
      
      const response = await request(app)
        .patch('/api/v1/items/123')
        .send(invalidUpdate)
        .expect(400);
        
      expect(response.body).toHaveProperty('error');
      expect(response.body.errors.some((err: any) => 
        err.path.includes('price'))).toBe(true);
    });
  });
  
  describe('Query parameter validation', () => {
    it('should accept valid query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/items?page=2&limit=10&sort=price_asc&category=electronics')
        .expect(200);
        
      expect(response.body).toEqual({
        success: true,
        query: {
          page: 2,
          limit: 10,
          sort: 'price_asc',
          category: 'electronics'
        }
      });
    });
    
    it('should apply default values for missing query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/items')
        .expect(200);
        
      expect(response.body.query).toHaveProperty('page', 1);
      expect(response.body.query).toHaveProperty('limit', 20);
    });
    
    it('should reject invalid query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/items?limit=1000') // exceeds max
        .expect(400);
        
      expect(response.body).toHaveProperty('error');
      expect(response.body.errors.some((err: any) => 
        err.path.includes('limit'))).toBe(true);
    });
  });
  
  describe('Error formatting', () => {
    it('should return well-structured error responses', async () => {
      const response = await request(app)
        .post('/api/v1/items')
        .send({
          title: '', // empty title
          description: 'too short', // too short
          price: -10, // negative
          category: 'invalid' // not in enum
        })
        .expect(400);
        
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
      
      // Check error structure
      const errorItem = response.body.errors[0];
      expect(errorItem).toHaveProperty('path');
      expect(errorItem).toHaveProperty('message');
    });
  });
}); 