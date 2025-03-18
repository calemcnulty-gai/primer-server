import { describe, expect, it } from '@jest/globals';
import { Request } from 'express';
import supertest from 'supertest';
import { 
  mockRequest, 
  mockResponse, 
  createTestData, 
  apiTestAgent 
} from '../../fixtures/api.fixtures';

describe('API Test Fixtures', () => {
  describe('mockRequest', () => {
    it('should create a mock request with default values', () => {
      const mockReq = mockRequest();
      
      expect(mockReq).toBeDefined();
      expect(mockReq.headers).toEqual({});
      expect(mockReq.body).toEqual({});
      expect(mockReq.params).toEqual({});
      expect(mockReq.query).toEqual({});
    });

    it('should create a mock request with provided values', () => {
      const mockReq = mockRequest({
        headers: { 'content-type': 'application/json' },
        body: { test: 'value' },
        params: { id: '123' },
        query: { sort: 'asc' }
      });
      
      expect(mockReq.headers).toEqual({ 'content-type': 'application/json' });
      expect(mockReq.body).toEqual({ test: 'value' });
      expect(mockReq.params).toEqual({ id: '123' });
      expect(mockReq.query).toEqual({ sort: 'asc' });
    });
  });

  describe('mockResponse', () => {
    it('should create a mock response with working methods', () => {
      const mockRes = mockResponse();
      
      expect(mockRes).toBeDefined();
      expect(typeof mockRes.status).toBe('function');
      expect(typeof mockRes.json).toBe('function');
      expect(typeof mockRes.send).toBe('function');
      expect(typeof mockRes.end).toBe('function');
    });

    it('should allow chaining of response methods', () => {
      const mockRes = mockResponse();
      
      expect(mockRes.status(200)).toBe(mockRes);
      expect(mockRes.json({ test: true })).toBe(mockRes);
    });

    it('should track calls to response methods', () => {
      const mockRes = mockResponse();
      
      mockRes.status(201).json({ created: true });
      
      expect(mockRes.statusCode).toBe(201);
      expect(mockRes.body).toEqual({ created: true });
    });
  });

  describe('createTestData', () => {
    it('should create user test data', () => {
      const userData = createTestData('user');
      
      expect(userData).toBeDefined();
      expect(userData.id).toBeDefined();
      expect(userData.email).toBeDefined();
      expect(userData.name).toBeDefined();
    });

    it('should create post test data', () => {
      const postData = createTestData('post');
      
      expect(postData).toBeDefined();
      expect(postData.id).toBeDefined();
      expect(postData.title).toBeDefined();
      expect(postData.content).toBeDefined();
    });

    it('should throw error for unknown data type', () => {
      expect(() => createTestData('unknown')).toThrow();
    });
  });

  describe('apiTestAgent', () => {
    it('should create a supertest agent with preset headers', () => {
      const agent = apiTestAgent();
      
      expect(agent).toBeDefined();
      expect(typeof agent.get).toBe('function');
      expect(typeof agent.post).toBe('function');
      expect(typeof agent.put).toBe('function');
      expect(typeof agent.patch).toBe('function');
      expect(typeof agent.delete).toBe('function');
    });

    it('should allow custom headers in agent', () => {
      const customHeader = 'x-custom-header';
      const customValue = 'test-value';
      
      const agent = apiTestAgent({
        [customHeader]: customValue
      });
      
      expect(agent).toBeDefined();
      expect(typeof agent.get).toBe('function');
    });
  });
}); 