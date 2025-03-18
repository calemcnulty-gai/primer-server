import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validation';
import { z } from 'zod';

describe('Validation Middleware', () => {
  // Create schemas for testing
  const userSchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    age: z.number().int().positive().optional()
  });

  const querySchema = z.object({
    limit: z.string().transform(Number).pipe(z.number().int().positive()),
    offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional()
  });

  // Create test express apps
  const bodyValidationApp = express();
  bodyValidationApp.use(express.json());
  bodyValidationApp.post('/users', validate({ body: userSchema }), (req, res) => {
    res.status(200).json({ success: true, data: req.body });
  });

  const queryValidationApp = express();
  queryValidationApp.get('/items', validate({ query: querySchema }), (req, res) => {
    res.status(200).json({ success: true, query: req.query });
  });

  // Mixed validation app
  const mixedValidationApp = express();
  mixedValidationApp.use(express.json());
  mixedValidationApp.post('/search', validate({ 
    body: userSchema,
    query: querySchema
  }), (req, res) => {
    res.status(200).json({ success: true, body: req.body, query: req.query });
  });

  describe('Body validation', () => {
    it('should allow valid request body', async () => {
      const validUser = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25
      };

      const response = await request(bodyValidationApp)
        .post('/users')
        .send(validUser)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: validUser
      });
    });

    it('should reject invalid request body', async () => {
      const invalidUser = {
        name: 'Jo', // too short
        email: 'not-an-email',
        age: -5 // negative
      };

      const response = await request(bodyValidationApp)
        .post('/users')
        .send(invalidUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Validation error');
      expect(response.body).toHaveProperty('details');
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('Query validation', () => {
    it('should allow valid query parameters', async () => {
      const response = await request(queryValidationApp)
        .get('/items?limit=10&offset=0')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        query: { limit: 10, offset: 0 } // Values transformed to numbers
      });
    });

    it('should reject invalid query parameters', async () => {
      const response = await request(queryValidationApp)
        .get('/items?limit=-5')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Validation error');
    });
  });

  describe('Mixed validation', () => {
    it('should validate both body and query parameters', async () => {
      const validUser = {
        name: 'John Doe',
        email: 'john@example.com'
      };

      const response = await request(mixedValidationApp)
        .post('/search?limit=20')
        .send(validUser)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        body: validUser,
        query: { limit: 20 } // Value transformed to number
      });
    });

    it('should reject when body is valid but query is invalid', async () => {
      const validUser = {
        name: 'John Doe',
        email: 'john@example.com'
      };

      const response = await request(mixedValidationApp)
        .post('/search?limit=invalid')
        .send(validUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Validation error');
    });

    it('should reject when query is valid but body is invalid', async () => {
      const invalidUser = {
        name: 'Jo',
        email: 'not-an-email'
      };

      const response = await request(mixedValidationApp)
        .post('/search?limit=20')
        .send(invalidUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Validation error');
    });
  });
}); 