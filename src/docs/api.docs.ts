import { OpenAPIV3 } from 'openapi-types';

export function getOpenAPIDocument(): OpenAPIV3.Document {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Story Generation API',
      version: '1.0.0',
      description: 'API for interactive storytelling',
    },
    paths: {
      '/api/v1/story/current': {
        get: {
          summary: 'Get the current story segment',
          security: [{ deviceId: [] }],
          responses: {
            '200': {
              description: 'Current story segment',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StorySegment',
                  },
                },
              },
            },
            '400': {
              description: 'Error response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/story/choice': {
        post: {
          summary: 'Make a choice in the story',
          security: [{ deviceId: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['choiceId'],
                  properties: {
                    choiceId: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Next story segment',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StorySegment',
                  },
                },
              },
            },
            '400': {
              description: 'Error response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/story/progress': {
        post: {
          summary: 'Update story progress',
          security: [{ deviceId: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['progress'],
                  properties: {
                    progress: {
                      type: 'number',
                      minimum: 0,
                      maximum: 100,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Success response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuccessResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Error response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'string',
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          required: ['success'],
          properties: {
            success: {
              type: 'boolean',
            },
          },
        },
        StorySegment: {
          type: 'object',
          required: ['id', 'content', 'choices'],
          properties: {
            id: {
              type: 'string',
            },
            content: {
              type: 'string',
            },
            choices: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'text'],
                properties: {
                  id: {
                    type: 'string',
                  },
                  text: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        StoryState: {
          type: 'object',
          required: ['progress'],
          properties: {
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
          },
        },
      },
      securitySchemes: {
        deviceId: {
          type: 'apiKey',
          name: 'X-Device-ID',
          in: 'header',
        },
      },
    },
  };
} 