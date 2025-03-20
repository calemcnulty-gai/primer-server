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
      '/api/v1/voice/status': {
        get: {
          summary: 'Check the status of the voice service',
          description: 'Returns whether the voice service is ready to accept connections',
          tags: ['Voice'],
          responses: {
            '200': {
              description: 'Status of the voice service',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/VoiceStatus',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/voice/config': {
        get: {
          summary: 'Get WebRTC configuration',
          description: 'Returns the configuration needed for WebRTC connections',
          tags: ['Voice'],
          responses: {
            '200': {
              description: 'WebRTC configuration including ICE servers',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/WebRTCConfig',
                  },
                },
              },
            },
          },
        },
      },
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
        VoiceStatus: {
          type: 'object',
          required: ['status', 'ready'],
          properties: {
            status: {
              type: 'string',
              description: 'Current status of the voice service',
              enum: ['initializing', 'running', 'error'],
            },
            ready: {
              type: 'boolean',
              description: 'Whether the voice service is ready to accept connections',
            },
          },
        },
        WebRTCConfig: {
          type: 'object',
          required: ['iceServers'],
          properties: {
            iceServers: {
              type: 'array',
              description: 'List of ICE servers for WebRTC connection',
              items: {
                type: 'object',
                required: ['urls'],
                properties: {
                  urls: {
                    type: 'string',
                    description: 'URL of the ICE server',
                  },
                },
              },
            },
          },
        },
        WebRTCMessage: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              description: 'Type of the WebRTC message',
              enum: ['offer', 'answer', 'ice-candidate', 'start-listening', 'stop-listening', 'speaking-start', 'speaking-end', 'error'],
            },
            sdp: {
              type: 'object',
              description: 'Session Description Protocol data (for offer/answer types)',
            },
            candidate: {
              type: 'object',
              description: 'ICE candidate data (for ice-candidate type)',
            },
            error: {
              type: 'object',
              description: 'Error details (for error type)',
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code',
                },
                message: {
                  type: 'string',
                  description: 'Human-readable error message',
                },
              },
            },
          },
        },
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