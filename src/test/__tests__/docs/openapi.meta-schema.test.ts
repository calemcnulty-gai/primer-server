import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { OpenAPIV3 } from 'openapi-types';

describe('OpenAPI 3.0 Meta-schema', () => {
  let metaSchemaPath: string;
  
  beforeAll(() => {
    metaSchemaPath = path.resolve(__dirname, '../../fixtures/openapi3-schema.json');
  });
  
  test('should have a valid OpenAPI 3.0 meta-schema fixture', () => {
    // Check that the file exists
    expect(fs.existsSync(metaSchemaPath)).toBe(true);
    
    // Load the schema
    const schema = JSON.parse(fs.readFileSync(metaSchemaPath, 'utf-8'));
    
    // Verify it's the correct schema
    expect(schema).toBeDefined();
    expect(schema.$id).toBe('https://spec.openapis.org/oas/3.0/schema/2019-04-02');
    expect(schema.title).toBe('OpenAPI 3.0 schema');
  });
  
  test('should be able to validate an OpenAPI document against the meta-schema', () => {
    // Load the schema
    const schema = JSON.parse(fs.readFileSync(metaSchemaPath, 'utf-8'));
    
    // Create a minimal valid OpenAPI document
    const validOpenApiDoc: OpenAPIV3.Document = {
      openapi: '3.0.3',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {}
    };
    
    // Validate using Ajv with formats added
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    
    // Register additional formats that might be used in the schema
    ajv.addFormat('uri-reference', true);
    ajv.addFormat('uri', true);
    ajv.addFormat('email', true);
    ajv.addFormat('regex', true);
    
    const validate = ajv.compile(schema);
    const valid = validate(validOpenApiDoc);
    
    expect(valid).toBe(true);
  });
  
  test('should reject an invalid OpenAPI document', () => {
    // Load the schema
    const schema = JSON.parse(fs.readFileSync(metaSchemaPath, 'utf-8'));
    
    // Create an invalid OpenAPI document (missing required field)
    const invalidOpenApiDoc = {
      openapi: '3.0.3',
      // Missing info object
      paths: {}
    };
    
    // Validate using Ajv with formats added
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    
    // Register additional formats that might be used in the schema
    ajv.addFormat('uri-reference', true);
    ajv.addFormat('uri', true);
    ajv.addFormat('email', true);
    ajv.addFormat('regex', true);
    
    const validate = ajv.compile(schema);
    const valid = validate(invalidOpenApiDoc);
    
    expect(valid).toBe(false);
  });
}); 