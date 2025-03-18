import { Request, Response } from 'express';
import supertest from 'supertest';
import app from '../../app';
import { v4 as uuidv4 } from 'uuid';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

/**
 * Creates a mock Express request object
 */
export interface MockRequestParams {
  headers?: Record<string, string>;
  body?: Record<string, any>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  [key: string]: any;
}

export function mockRequest(overrides: Partial<Request> = {}): Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>> {
  const req = {
    body: {},
    cookies: {},
    query: {},
    params: {},
    headers: {},
    get: (name: string) => {
      if (name === 'set-cookie') {
        return undefined;
      }
      return undefined;
    },
    header: (name: string) => {
      return undefined;
    },
    accepts: () => true,
    acceptsCharsets: () => true,
    acceptsEncodings: () => true,
    acceptsLanguages: () => true,
    param: () => '',
    is: () => false,
    ...overrides
  };

  // Ensure get method is always defined
  if (!req.get || typeof req.get !== 'function') {
    req.get = function get(name: string) {
      if (name === 'set-cookie') {
        return undefined;
      }
      return undefined;
    };
  }

  return req as Request;
}

/**
 * Creates a mock Express response object
 */
interface MockResponse extends Partial<Response> {
  statusCode?: number;
  body?: any;
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
  end: jest.Mock;
}

export const mockResponse = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status: jest.fn(function(this: MockResponse, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function(this: MockResponse, data: any) {
      this.body = data;
      return this;
    }),
    send: jest.fn(function(this: MockResponse, data: any) {
      this.body = data;
      return this;
    }),
    end: jest.fn(function(this: MockResponse) {
      return this;
    })
  };
  
  return res;
};

/**
 * Test data creation utilities
 */
export type TestDataType = 'user' | 'post' | 'unknown';

export const createTestData = (type: TestDataType): Record<string, any> => {
  switch (type) {
    case 'user':
      return {
        id: uuidv4(),
        email: `test-${Math.random().toString(36).substring(2)}@example.com`,
        name: `Test User ${Math.floor(Math.random() * 10000)}`,
        createdAt: new Date().toISOString()
      };
    case 'post':
      return {
        id: uuidv4(),
        title: `Test Post ${Math.floor(Math.random() * 10000)}`,
        content: `This is test content for post ${Math.floor(Math.random() * 10000)}`,
        createdAt: new Date().toISOString(),
        authorId: uuidv4()
      };
    default:
      throw new Error(`Unknown test data type: ${type}`);
  }
};

/**
 * Creates a supertest agent with preset headers for API testing
 */
export const apiTestAgent = (headers: Record<string, string> = {}) => {
  const agent = supertest(app);
  
  // Add default headers that should be included in all requests
  const defaultHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...headers
  };
  
  // Create a new agent with the headers
  const agentWithHeaders = {
    get: (url: string) => agent.get(url).set(defaultHeaders),
    post: (url: string) => agent.post(url).set(defaultHeaders),
    put: (url: string) => agent.put(url).set(defaultHeaders),
    patch: (url: string) => agent.patch(url).set(defaultHeaders),
    delete: (url: string) => agent.delete(url).set(defaultHeaders)
  };
  
  return agentWithHeaders;
}; 