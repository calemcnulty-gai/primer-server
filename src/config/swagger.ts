import swaggerJSDoc from 'swagger-jsdoc';
import { OpenAPIV3 } from 'openapi-types';

// Define OpenAPI specification
const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Primer Server API',
      version: '1.0.0',
      description: 'API for integrating with various AI services'
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'API Server'
      }
    ],
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Health check endpoint',
          description: 'Returns the health status of the API',
          responses: {
            '200': {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/HealthResponse'
                  }
                }
              }
            }
          }
        }
      },
      '/v1/elevenlabs/voices': {
        get: {
          tags: ['ElevenLabs'],
          summary: 'Get available voices',
          description: 'Returns a list of available voices from ElevenLabs',
          security: [
            {
              ApiKeyAuth: []
            }
          ],
          responses: {
            '200': {
              description: 'List of voices',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean'
                      },
                      data: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/Voice'
                        }
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            }
          }
        }
      },
      '/v1/elevenlabs/text-to-speech': {
        post: {
          tags: ['ElevenLabs'],
          summary: 'Convert text to speech',
          description: 'Converts text to speech using ElevenLabs API',
          security: [
            {
              ApiKeyAuth: []
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TextToSpeechRequest'
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Audio file',
              content: {
                'audio/mpeg': {
                  schema: {
                    type: 'string',
                    format: 'binary'
                  }
                }
              }
            },
            '400': {
              description: 'Bad request',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            },
            '500': {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY'
        }
      },
      schemas: {
        Error: {
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
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'success'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Voice: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'voice-id-123'
            },
            name: {
              type: 'string',
              example: 'Voice Name'
            },
            description: {
              type: 'string',
              example: 'Voice description'
            }
          }
        },
        TextToSpeechRequest: {
          type: 'object',
          required: ['text'],
          properties: {
            text: {
              type: 'string',
              example: 'Hello, world!'
            },
            voiceId: {
              type: 'string',
              example: 'voice-id-123'
            }
          }
        }
      },
      responses: {
        ErrorResponse: {
          description: 'Error response',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        SuccessResponse: {
          description: 'Success response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: true
                  },
                  data: {
                    type: 'object'
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts']
};

// Initialize swagger-jsdoc
export const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Add examples to the swagger spec
function addExamplesToSpec(spec: any): OpenAPIV3.Document {
  // Make a deep copy to avoid mutating the original
  const enhancedSpec = JSON.parse(JSON.stringify(spec));
  
  // Add examples to health endpoint
  if (enhancedSpec.paths['/health']?.get?.responses?.[200]?.content?.['application/json']) {
    enhancedSpec.paths['/health'].get.responses[200].content['application/json'].examples = {
      'health-response': {
        value: {
          status: 'success',
          timestamp: new Date().toISOString()
        }
      }
    };
  }
  
  // Add examples to ElevenLabs voices endpoint
  if (enhancedSpec.paths['/v1/elevenlabs/voices']?.get?.responses?.[200]?.content?.['application/json']) {
    enhancedSpec.paths['/v1/elevenlabs/voices'].get.responses[200].content['application/json'].examples = {
      'voices-list': {
        value: {
          success: true,
          data: [
            { id: 'voice-1', name: 'Voice 1' },
            { id: 'voice-2', name: 'Voice 2' }
          ]
        }
      }
    };
  }
  
  // Add examples to ElevenLabs voices endpoint error response
  if (enhancedSpec.paths['/v1/elevenlabs/voices']?.get?.responses?.[500]?.content?.['application/json']) {
    enhancedSpec.paths['/v1/elevenlabs/voices'].get.responses[500].content['application/json'].examples = {
      'server-error': {
        value: {
          success: false,
          error: {
            message: 'Failed to fetch voices',
            code: 'SERVER_ERROR'
          }
        }
      }
    };
  }
  
  // Add examples to text-to-speech request body
  if (enhancedSpec.paths['/v1/elevenlabs/text-to-speech']?.post?.requestBody?.content?.['application/json']) {
    enhancedSpec.paths['/v1/elevenlabs/text-to-speech'].post.requestBody.content['application/json'].examples = {
      'text-to-speech-request': {
        value: {
          text: 'Hello, world!',
          voiceId: 'voice-id-123'
        }
      }
    };
  }
  
  // Add examples to text-to-speech 400 response
  if (enhancedSpec.paths['/v1/elevenlabs/text-to-speech']?.post?.responses?.[400]?.content?.['application/json']) {
    enhancedSpec.paths['/v1/elevenlabs/text-to-speech'].post.responses[400].content['application/json'].examples = {
      'validation-error': {
        value: {
          success: false,
          error: {
            message: 'Validation error',
            code: 'VALIDATION_ERROR',
            details: [
              {
                path: 'text',
                message: 'Text is required'
              }
            ]
          }
        }
      }
    };
  }
  
  // Add examples to text-to-speech 500 response
  if (enhancedSpec.paths['/v1/elevenlabs/text-to-speech']?.post?.responses?.[500]?.content?.['application/json']) {
    enhancedSpec.paths['/v1/elevenlabs/text-to-speech'].post.responses[500].content['application/json'].examples = {
      'server-error': {
        value: {
          success: false,
          error: {
            message: 'Text-to-speech conversion failed',
            code: 'SERVER_ERROR'
          }
        }
      }
    };
  }
  
  return enhancedSpec;
}

/**
 * Get the OpenAPI schema for the API
 * @returns The OpenAPI schema object
 */
export function getOpenApiSchema(): OpenAPIV3.Document {
  // Enhance the swagger spec with examples
  return addExamplesToSpec(swaggerSpec);
} 