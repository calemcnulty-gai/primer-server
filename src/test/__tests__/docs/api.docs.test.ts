import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../../app';
import { generateApiDocs, extractTestExamples } from '../../docs/api.docs';
import { OpenAPIV3 } from 'openapi-types';

describe('API Documentation Generator', () => {
  describe('generateApiDocs', () => {
    it('should generate OpenAPI documentation', () => {
      const docs = generateApiDocs();
      
      expect(docs).toBeDefined();
      expect(docs.openapi).toBe('3.0.3');
      expect(docs.info).toBeDefined();
      expect(docs.paths).toBeDefined();
    });
    
    it('should include health endpoint in docs', () => {
      const docs = generateApiDocs();
      
      expect(docs.paths).toHaveProperty('/health');
      const healthPath = docs.paths['/health'] as OpenAPIV3.PathItemObject;
      expect(healthPath).toHaveProperty('get');
      const getOperation = healthPath.get as OpenAPIV3.OperationObject;
      expect(getOperation.responses).toHaveProperty('200');
    });

    it('should include story endpoints in docs', () => {
      const docs = generateApiDocs();
      
      expect(docs.paths).toHaveProperty('/story/current');
      expect(docs.paths).toHaveProperty('/story/choice');
    });

    it('should include security schemes', () => {
      const docs = generateApiDocs();
      
      expect(docs.components).toBeDefined();
      expect(docs.components?.securitySchemes).toBeDefined();
      expect(docs.components?.securitySchemes).toHaveProperty('deviceId');
      
      const deviceIdScheme = docs.components?.securitySchemes?.deviceId as OpenAPIV3.ApiKeySecurityScheme;
      expect(deviceIdScheme.type).toBe('apiKey');
      expect(deviceIdScheme.in).toBe('header');
      expect(deviceIdScheme.name).toBe('X-Device-ID');
    });

    it('should include standard error responses', () => {
      const docs = generateApiDocs();
      
      expect(docs.components?.schemas).toBeDefined();
      expect(docs.components?.schemas).toHaveProperty('Error');
      
      const errorSchema = docs.components?.schemas?.Error as OpenAPIV3.SchemaObject;
      expect(errorSchema.properties).toBeDefined();
      expect(errorSchema.properties).toHaveProperty('error');
      expect(errorSchema.required).toContain('error');
    });

    it('should include story segment schema', () => {
      const docs = generateApiDocs();
      
      expect(docs.components?.schemas).toHaveProperty('StorySegment');
      const segmentSchema = docs.components?.schemas?.StorySegment as OpenAPIV3.SchemaObject;
      expect(segmentSchema.properties).toHaveProperty('id');
      expect(segmentSchema.properties).toHaveProperty('content');
      expect(segmentSchema.properties).toHaveProperty('choices');
      expect(segmentSchema.required).toContain('id');
      expect(segmentSchema.required).toContain('content');
      expect(segmentSchema.required).toContain('choices');
    });

    it('should include story state schema', () => {
      const docs = generateApiDocs();
      
      expect(docs.components?.schemas).toHaveProperty('StoryState');
      const stateSchema = docs.components?.schemas?.StoryState as OpenAPIV3.SchemaObject;
      expect(stateSchema.properties).toHaveProperty('progress');
      expect(stateSchema.required).toContain('progress');
    });

    it('should require device ID for story endpoints', () => {
      const docs = generateApiDocs();
      
      const currentPath = docs.paths['/story/current'] as OpenAPIV3.PathItemObject;
      expect(currentPath.get?.security).toEqual([{ deviceId: [] }]);
      
      const choicePath = docs.paths['/story/choice'] as OpenAPIV3.PathItemObject;
      expect(choicePath.post?.security).toEqual([{ deviceId: [] }]);
    });

    it('should use custom options when provided', () => {
      const customOptions = {
        title: 'Custom API',
        version: '2.0.0',
        description: 'Custom description',
        servers: [
          {
            url: 'https://api.example.com',
            description: 'Production server'
          }
        ]
      };

      const docs = generateApiDocs(customOptions);
      
      expect(docs.info.title).toBe(customOptions.title);
      expect(docs.info.version).toBe(customOptions.version);
      expect(docs.info.description).toBe(customOptions.description);
      expect(docs.servers).toEqual(customOptions.servers);
    });
  });
  
  describe('extractTestExamples', () => {
    it('should extract test examples for health endpoint', () => {
      const testExamples = extractTestExamples();
      
      expect(testExamples).toBeDefined();
      expect(testExamples).toHaveProperty('/health');
      expect(testExamples['/health']).toHaveProperty('get');
      expect(testExamples['/health'].get).toHaveProperty('request');
      expect(testExamples['/health'].get).toHaveProperty('response');
    });
    
    it('should have valid request/response pairs', () => {
      const testExamples = extractTestExamples();
      
      Object.entries(testExamples).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, example]) => {
          expect(example).toHaveProperty('request');
          expect(example).toHaveProperty('response');
          expect(example.response).toHaveProperty('status');
        });
      });
    });

    it('should include story engine endpoints', () => {
      const testExamples = extractTestExamples();
      
      expect(testExamples).toHaveProperty('/story/current');
      expect(testExamples).toHaveProperty('/story/choice');
      
      // Check current story endpoint
      const currentStory = testExamples['/story/current'].get;
      expect(currentStory).toBeDefined();
      expect(currentStory.response).toBeDefined();
      expect(currentStory.response.body).toBeDefined();
      expect(currentStory.response.body?.segment).toBeDefined();
      expect(currentStory.response.body?.segment).toHaveProperty('id');
      expect(currentStory.response.body?.segment).toHaveProperty('content');
      expect(currentStory.response.body?.segment).toHaveProperty('choices');
      
      // Check story choice endpoint
      const storyChoice = testExamples['/story/choice'].post;
      expect(storyChoice).toBeDefined();
      expect(storyChoice.request.body).toHaveProperty('choiceId');
      expect(storyChoice.response).toBeDefined();
      expect(storyChoice.response.body).toBeDefined();
      expect(storyChoice.response.body?.segment).toBeDefined();
      expect(storyChoice.response.body?.segment).toHaveProperty('id');
      expect(storyChoice.response.body?.segment).toHaveProperty('content');
      expect(storyChoice.response.body?.segment).toHaveProperty('choices');
    });
  });
  
  describe('API Documentation Endpoint', () => {
    it('should serve OpenAPI docs at /api-docs', async () => {
      const response = await request(app).get('/api-docs').redirects(1);
      expect(response.status).toBe(200);
      expect(response.text).toContain('swagger-ui');
      expect(response.text).toContain('swagger-ui-bundle.js');
      expect(response.text).toContain('swagger-ui-standalone-preset.js');
    });
    
    it('should serve OpenAPI spec at /api-docs/swagger.json', async () => {
      const response = await request(app).get('/api-docs/swagger.json');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
      expect(response.body).toHaveProperty('components');
      expect(response.body.components).toHaveProperty('securitySchemes');
      expect(response.body.components).toHaveProperty('responses');
    });
    
    it('should include example requests in OpenAPI spec', async () => {
      const response = await request(app).get('/api-docs/swagger.json');
      
      // Check that at least one endpoint has examples
      const paths = response.body.paths;
      let hasExamples = false;
      
      Object.keys(paths).forEach(path => {
        Object.keys(paths[path]).forEach(method => {
          if (method === 'parameters') return; // Skip parameters array
          
          // Check for examples in various locations
          // 1. Request body examples
          if (paths[path][method].requestBody?.content?.['application/json']?.examples) {
            hasExamples = true;
          }
          
          // 2. Response examples
          if (paths[path][method].responses) {
            Object.keys(paths[path][method].responses).forEach(status => {
              if (paths[path][method].responses[status]?.content?.['application/json']?.examples) {
                hasExamples = true;
              }
            });
          }
          
          // 3. Check for example property (alternative format)
          if (paths[path][method].requestBody?.content?.['application/json']?.schema?.example) {
            hasExamples = true;
          }
          
          // 4. Check for example property in responses
          if (paths[path][method].responses) {
            Object.keys(paths[path][method].responses).forEach(status => {
              if (paths[path][method].responses[status]?.content?.['application/json']?.schema?.example) {
                hasExamples = true;
              }
            });
          }
        });
      });
      
      expect(hasExamples).toBe(true);
    });

    it('should handle errors when generating docs', async () => {
      // Mock an error in generateApiDocs
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const originalGenerateApiDocs = require('../../docs/api.docs').generateApiDocs;
      require('../../docs/api.docs').generateApiDocs = () => {
        throw new Error('Test error');
      };

      const response = await request(app).get('/api-docs/swagger.json');
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');

      // Restore original function
      require('../../docs/api.docs').generateApiDocs = originalGenerateApiDocs;
      jest.spyOn(console, 'error').mockRestore();
    });
  });
}); 