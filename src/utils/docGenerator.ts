import { OpenAPIV3 } from 'openapi-types';
import fs from 'fs';
import path from 'path';
import { getOpenApiSchema } from '../config/swagger';

/**
 * Generates OpenAPI documentation for the API
 */
export function generateApiDocumentation(): OpenAPIV3.Document {
  // Get base OpenAPI schema
  const openApiSchema = getOpenApiSchema() as OpenAPIV3.Document;
  
  // Add examples from test files
  const testExamples = extractTestExamples();
  
  // Ensure schema has all required sections
  if (!openApiSchema.components) {
    openApiSchema.components = {};
  }
  
  if (!openApiSchema.components.schemas) {
    openApiSchema.components.schemas = {};
  }
  
  if (!openApiSchema.components.responses) {
    openApiSchema.components.responses = {};
  }
  
  if (!openApiSchema.components.securitySchemes) {
    openApiSchema.components.securitySchemes = {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-KEY'
      }
    };
  }
  
  // Add standard schemas if not present
  if (!openApiSchema.components.schemas.Error) {
    openApiSchema.components.schemas.Error = {
      type: 'object',
      required: ['success', 'error'],
      properties: {
        success: {
          type: 'boolean',
          example: false
        },
        error: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              example: 'An error occurred'
            },
            code: {
              type: 'string',
              example: 'ERROR_CODE'
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string'
                  },
                  message: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      }
    };
  }
  
  if (!openApiSchema.components.schemas.SuccessResponse) {
    openApiSchema.components.schemas.SuccessResponse = {
      type: 'object',
      required: ['success'],
      properties: {
        success: {
          type: 'boolean',
          example: true
        },
        data: {
          type: 'object'
        }
      }
    };
  }
  
  // Merge examples into OpenAPI schema
  for (const [pathKey, pathMethods] of Object.entries(testExamples)) {
    if (!openApiSchema.paths[pathKey]) {
      openApiSchema.paths[pathKey] = {};
    }
    
    for (const [method, examples] of Object.entries(pathMethods)) {
      const pathItem = openApiSchema.paths[pathKey] as OpenAPIV3.PathItemObject;
      const operation = pathItem[method as OpenAPIV3.HttpMethods] as OpenAPIV3.OperationObject;
      
      if (!operation) {
        continue;
      }
      
      // Add standard error responses to all operations
      if (!operation.responses['500']) {
        operation.responses['500'] = {
          description: 'Server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              examples: {
                'server-error': {
                  value: {
                    success: false,
                    error: {
                      message: 'Internal server error',
                      code: 'SERVER_ERROR'
                    }
                  }
                }
              }
            }
          }
        };
      }
      
      // For operations that handle user input, also add 400 response
      if (['post', 'put', 'patch'].includes(method)) {
        if (!operation.responses['400']) {
          operation.responses['400'] = {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                },
                examples: {
                  'validation-error': {
                    value: {
                      success: false,
                      error: {
                        message: 'Validation error',
                        code: 'VALIDATION_ERROR',
                        details: [
                          {
                            path: 'field',
                            message: 'Field is required'
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          };
        }
      }
      
      // Add request examples
      if (examples.request && operation.requestBody) {
        const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
        
        for (const [contentType, example] of Object.entries(examples.request)) {
          if (!requestBody.content[contentType]) {
            requestBody.content[contentType] = {
              schema: { type: 'object' }
            };
          }
          
          requestBody.content[contentType].examples = requestBody.content[contentType].examples || {};
          requestBody.content[contentType].examples['test-example'] = {
            value: example
          };
        }
      }
      
      // Add response examples
      if (examples.response) {
        for (const [statusCode, responseExamples] of Object.entries(examples.response)) {
          if (!operation.responses[statusCode]) {
            operation.responses[statusCode] = {
              description: `Status ${statusCode} response`
            };
          }
          
          const response = operation.responses[statusCode] as OpenAPIV3.ResponseObject;
          response.content = response.content || {};
          
          for (const [contentType, example] of Object.entries(responseExamples)) {
            if (!response.content[contentType]) {
              response.content[contentType] = {
                schema: { type: 'object' }
              };
            }
            
            response.content[contentType].examples = response.content[contentType].examples || {};
            response.content[contentType].examples['test-example'] = {
              value: example
            };
          }
        }
      }
    }
  }
  
  // Ensure all paths have proper operations
  for (const [pathKey, pathItem] of Object.entries(openApiSchema.paths)) {
    const pathItemObj = pathItem as OpenAPIV3.PathItemObject;
    
    // Ensure all operations have required fields
    const operations = ['get', 'post', 'put', 'delete', 'patch'] as const;
    for (const method of operations) {
      const operation = pathItemObj[method] as OpenAPIV3.OperationObject;
      
      if (!operation) continue;
      
      // Ensure operation has responses
      if (!operation.responses) {
        operation.responses = {};
      }
      
      // Ensure each operation has at least a 200 response
      if (!operation.responses['200']) {
        operation.responses['200'] = {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SuccessResponse'
              }
            }
          }
        };
      }
      
      // Add examples if not present
      for (const [statusCode, response] of Object.entries(operation.responses)) {
        const responseObj = response as OpenAPIV3.ResponseObject;
        
        if (!responseObj.content && statusCode !== '204') {
          responseObj.content = {
            'application/json': {
              schema: {
                $ref: statusCode.startsWith('2') 
                  ? '#/components/schemas/SuccessResponse' 
                  : '#/components/schemas/Error'
              }
            }
          };
        }
        
        // Ensure all content types have schemas
        if (responseObj.content) {
          for (const [contentType, mediaType] of Object.entries(responseObj.content)) {
            if (!mediaType.schema) {
              mediaType.schema = {
                $ref: statusCode.startsWith('2') 
                  ? '#/components/schemas/SuccessResponse' 
                  : '#/components/schemas/Error'
              };
            }
          }
        }
      }
    }
  }
  
  return openApiSchema;
}

/**
 * Extracts examples from test files
 */
export function extractTestExamples(): Record<string, Record<string, {
  request?: Record<string, any>;
  response?: Record<string, Record<string, any>>;
}>> {
  const examples: Record<string, Record<string, {
    request?: Record<string, any>;
    response?: Record<string, Record<string, any>>;
  }>> = {};
  
  // Mock implementation - in a real implementation, this would parse test files
  // to extract examples from test assertions
  examples['/health'] = {
    get: {
      response: {
        '200': {
          'application/json': {
            success: true,
            data: {
              status: 'ok',
              timestamp: new Date().toISOString()
            }
          }
        }
      }
    }
  };
  
  examples['/v1/story/current'] = {
    get: {
      request: {},
      response: {
        '200': {
          'application/json': {
            success: true,
            data: {
              id: 'intro',
              content: 'You stand at the entrance of a dark cave...',
              choices: [
                {
                  id: 'enter',
                  text: 'Enter the cave',
                  nextSegmentId: 'cave_interior'
                },
                {
                  id: 'leave',
                  text: 'Turn back',
                  nextSegmentId: 'forest_path'
                }
              ]
            }
          }
        }
      }
    }
  };

  examples['/v1/story/choice'] = {
    post: {
      request: {
        'application/json': {
          choiceId: 'enter'
        }
      },
      response: {
        '200': {
          'application/json': {
            success: true,
            data: {
              nextSegment: {
                id: 'cave_interior',
                content: 'The cave is dark and mysterious...',
                choices: [
                  {
                    id: 'explore',
                    text: 'Explore deeper',
                    nextSegmentId: 'deep_cave'
                  },
                  {
                    id: 'exit',
                    text: 'Exit the cave',
                    nextSegmentId: 'cave_entrance'
                  }
                ]
              }
            }
          }
        }
      }
    }
  };
  
  return examples;
}

/**
 * Get parameter examples for an endpoint
 */
export function getParameterExamples(
  path: string,
  method: string,
  paramName: string,
  paramIn: string
): any {
  const examples = extractTestExamples();
  
  if (!examples[path] || !examples[path][method]) {
    return undefined;
  }
  
  const pathExamples = examples[path][method];
  
  // Find a test request that includes this parameter
  if (pathExamples.request && pathExamples.request[paramIn]) {
    return pathExamples.request[paramIn][paramName];
  }
  
  return undefined;
}

// Helper function to check if a parameter is a ParameterObject (not a ReferenceObject)
export function isParameterObject(param: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject): param is OpenAPIV3.ParameterObject {
  return 'in' in param && 'name' in param;
} 