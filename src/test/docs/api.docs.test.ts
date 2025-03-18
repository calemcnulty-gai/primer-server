import { OpenAPIV3 } from 'openapi-types';
import { getOpenAPIDocument } from '../../docs/api.docs';

describe('API Documentation', () => {
  let openAPIDoc: OpenAPIV3.Document;

  beforeAll(() => {
    openAPIDoc = getOpenAPIDocument();
  });

  it('should have basic info', () => {
    expect(openAPIDoc.info.title).toBe('Story Generation API');
    expect(openAPIDoc.info.version).toBe('1.0.0');
  });

  it('should have deviceId security scheme', () => {
    expect(openAPIDoc.components?.securitySchemes?.deviceId).toBeDefined();
    const deviceIdScheme = openAPIDoc.components?.securitySchemes?.deviceId as OpenAPIV3.SecuritySchemeObject;
    expect(deviceIdScheme.type).toBe('apiKey');
    
    // Type assertion after confirming it's an apiKey type
    const apiKeyScheme = deviceIdScheme as OpenAPIV3.ApiKeySecurityScheme;
    expect(apiKeyScheme.in).toBe('header');
    expect(apiKeyScheme.name).toBe('X-Device-ID');
  });

  it('should have error response component', () => {
    const errorSchema = openAPIDoc.components?.schemas?.Error as OpenAPIV3.SchemaObject;
    expect(errorSchema).toBeDefined();
    expect(errorSchema.type).toBe('object');
    expect(errorSchema.properties?.error).toBeDefined();
  });

  it('should have success response component', () => {
    const successSchema = openAPIDoc.components?.schemas?.SuccessResponse as OpenAPIV3.SchemaObject;
    expect(successSchema).toBeDefined();
    expect(successSchema.type).toBe('object');
    expect(successSchema.properties?.success).toBeDefined();
  });

  it('should have story segment component', () => {
    const segmentSchema = openAPIDoc.components?.schemas?.StorySegment as OpenAPIV3.SchemaObject;
    expect(segmentSchema).toBeDefined();
    expect(segmentSchema.type).toBe('object');
    expect(segmentSchema.properties?.id).toBeDefined();
    expect(segmentSchema.properties?.content).toBeDefined();
    expect(segmentSchema.properties?.choices).toBeDefined();
  });

  it('should have story state component', () => {
    const stateSchema = openAPIDoc.components?.schemas?.StoryState as OpenAPIV3.SchemaObject;
    expect(stateSchema).toBeDefined();
    expect(stateSchema.type).toBe('object');
    expect(stateSchema.properties?.progress).toBeDefined();
  });

  it('should have getCurrentStory endpoint', () => {
    const path = openAPIDoc.paths['/api/story/current'];
    expect(path).toBeDefined();
    expect(path?.get).toBeDefined();
    expect(path?.get?.security).toEqual([{ deviceId: [] }]);
  });

  it('should have makeChoice endpoint', () => {
    const path = openAPIDoc.paths['/api/story/choice'];
    expect(path).toBeDefined();
    expect(path?.post).toBeDefined();
    expect(path?.post?.security).toEqual([{ deviceId: [] }]);
  });

  it('should have updateProgress endpoint', () => {
    const path = openAPIDoc.paths['/api/story/progress'];
    expect(path).toBeDefined();
    expect(path?.post).toBeDefined();
    expect(path?.post?.security).toEqual([{ deviceId: [] }]);
  });
}); 