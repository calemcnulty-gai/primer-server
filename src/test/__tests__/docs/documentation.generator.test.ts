import { generateApiDocs } from '../../docs/api.docs';
import { OpenAPIV3 } from 'openapi-types';

describe('API Documentation Generator', () => {
  it('Documentation generator should create a valid OpenAPI document', () => {
    const generatedSchema = generateApiDocs();
    expect(generatedSchema).toBeDefined();
    expect(generatedSchema.openapi).toBe('3.0.3');
  });

  it('Generated documentation should include info with API details', () => {
    const generatedSchema = generateApiDocs({
      title: 'Test API',
      version: '2.0.0',
      description: 'Test Description'
    });
    expect(generatedSchema.info).toBeDefined();
    expect(generatedSchema.info.title).toBe('Test API');
    expect(generatedSchema.info.version).toBe('2.0.0');
    expect(generatedSchema.info.description).toBe('Test Description');
  });

  it('Generated schema should include all API endpoints', () => {
    const generatedSchema = generateApiDocs();
    expect(generatedSchema.paths).toBeDefined();
    const healthPath = generatedSchema.paths['/health'];
    expect(healthPath).toBeDefined();
    if (healthPath) {
      expect(healthPath.get).toBeDefined();
    }
  });

  it('Generated schema should include standard response types', () => {
    const generatedSchema = generateApiDocs();
    expect(generatedSchema.components).toBeDefined();
    expect(generatedSchema.components?.schemas).toBeDefined();
    expect(generatedSchema.components?.schemas?.Error).toBeDefined();
    expect(generatedSchema.components?.schemas?.Error).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message'
          }
        },
        required: ['error']
      })
    );
  });

  it('Path parameters should be documented correctly', () => {
    const generatedSchema = generateApiDocs();
    const healthPath = generatedSchema.paths['/health'];
    expect(healthPath).toBeDefined();
    if (healthPath && healthPath.get) {
      expect(healthPath.get.parameters).toBeDefined();
      const deviceIdParam = healthPath.get.parameters?.find(
        (p): p is OpenAPIV3.ParameterObject => 'name' in p && p.name === 'X-Device-ID'
      );
      expect(deviceIdParam).toBeDefined();
      expect(deviceIdParam?.in).toBe('header');
      expect(deviceIdParam?.required).toBe(true);
    }
  });

  it('Request bodies should be documented for POST endpoints', () => {
    const generatedSchema = generateApiDocs();
    const storyPath = generatedSchema.paths['/story/choice'];
    expect(storyPath).toBeDefined();
    if (storyPath && storyPath.post) {
      expect(storyPath.post.requestBody).toBeDefined();
      const requestBody = storyPath.post.requestBody as OpenAPIV3.RequestBodyObject;
      expect(requestBody.content?.['application/json']).toBeDefined();
      expect(requestBody.content?.['application/json'].schema).toBeDefined();
    }
  });

  it('Generated OpenAPI should be valid against OpenAPI 3.0 specification', () => {
    const generatedSchema = generateApiDocs();
    expect(generatedSchema.openapi).toBeDefined();
    expect(generatedSchema.info).toBeDefined();
    expect(generatedSchema.paths).toBeDefined();
    expect(generatedSchema.components).toBeDefined();
  });

  it('Security schemes should be defined', () => {
    const generatedSchema = generateApiDocs();
    expect(generatedSchema.components?.securitySchemes).toBeDefined();
    expect(generatedSchema.components?.securitySchemes?.deviceId).toBeDefined();
    const deviceIdScheme = generatedSchema.components?.securitySchemes?.deviceId as OpenAPIV3.ApiKeySecurityScheme;
    expect(deviceIdScheme.type).toBe('apiKey');
    expect(deviceIdScheme.in).toBe('header');
    expect(deviceIdScheme.name).toBe('X-Device-ID');
  });
}); 