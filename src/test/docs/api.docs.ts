import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { OpenAPIV3 } from 'openapi-types';
import { Router, Request, Response } from 'express';

/**
 * Generates OpenAPI documentation for the API
 */
export interface ApiDocsOptions {
  title?: string;
  version?: string;
  description?: string;
  servers?: { url: string; description?: string }[];
}

export function generateApiDocs(options?: ApiDocsOptions): OpenAPIV3.Document {
  return {
    openapi: '3.0.3',
    info: {
      title: options?.title || 'Story Generation API',
      version: options?.version || '1.0.0',
      description: options?.description || 'API for generating interactive stories'
    },
    servers: options?.servers || [
      {
        url: '/api/v1',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        deviceId: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Device-ID',
          description: 'Device ID for demo purposes'
        }
      },
      responses: {
        Error: {
          description: 'Error response',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        Success: {
          description: 'Success response',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SuccessResponse'
              }
            }
          }
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            }
          },
          required: ['error']
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the operation was successful'
            }
          },
          required: ['success']
        },
        StorySegment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the story segment'
            },
            content: {
              type: 'string',
              description: 'The story segment text'
            },
            choices: {
              type: 'array',
              description: 'Available choices for this segment',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Unique identifier for the choice'
                  },
                  text: {
                    type: 'string',
                    description: 'Text to display for the choice'
                  }
                },
                required: ['id', 'text']
              }
            }
          },
          required: ['id', 'content', 'choices']
        },
        StoryState: {
          type: 'object',
          properties: {
            progress: {
              type: 'number',
              description: 'Story progress percentage',
              minimum: 0,
              maximum: 100
            }
          },
          required: ['progress']
        }
      }
    },
    paths: {
      '/health': {
        get: {
          summary: 'Health check endpoint',
          description: 'Returns the health status of the API',
          parameters: [
            {
              name: 'X-Device-ID',
              in: 'header',
              required: true,
              schema: {
                type: 'string',
                pattern: '^[a-zA-Z0-9-]+$'
              }
            }
          ],
          responses: {
            '200': {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'string',
                        example: 'success'
                      },
                      message: {
                        type: 'string',
                        example: 'API is healthy'
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time'
                      }
                    }
                  },
                  examples: {
                    success: {
                      value: {
                        status: 'success',
                        message: 'API is healthy',
                        timestamp: '2025-03-18T16:42:25.633Z'
                      }
                    }
                  }
                }
              }
            },
            '400': {
              $ref: '#/components/responses/Error'
            },
            '500': {
              $ref: '#/components/responses/Error'
            }
          }
        }
      },
      '/story/current': {
        get: {
          summary: 'Get current story segment',
          description: 'Returns the current story segment and state for the user',
          operationId: 'getCurrentStory',
          security: [{ deviceId: [] }],
          parameters: [
            {
              name: 'X-Device-ID',
              in: 'header',
              required: true,
              schema: {
                type: 'string',
                pattern: '^[a-zA-Z0-9-]+$'
              }
            }
          ],
          responses: {
            '200': {
              description: 'Current story segment and state',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          segment: {
                            $ref: '#/components/schemas/StorySegment'
                          },
                          state: {
                            $ref: '#/components/schemas/StoryState'
                          }
                        },
                        required: ['segment', 'state']
                      },
                      success: {
                        type: 'boolean',
                        example: true
                      }
                    },
                    required: ['data', 'success']
                  },
                  examples: {
                    success: {
                      value: {
                        success: true,
                        data: {
                          segment: {
                            id: 'segment-1',
                            content: 'Once upon a time...',
                            choices: [
                              { id: 'choice-1', text: 'Go left', nextSegmentId: 'segment-2' },
                              { id: 'choice-2', text: 'Go right', nextSegmentId: 'segment-3' }
                            ]
                          },
                          state: {
                            progress: 25
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              $ref: '#/components/responses/Error'
            },
            '500': {
              $ref: '#/components/responses/Error'
            }
          }
        }
      },
      '/story/choice': {
        post: {
          summary: 'Make a story choice',
          description: 'Submit a choice to progress the story',
          operationId: 'makeChoice',
          security: [{ deviceId: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    choiceId: {
                      type: 'string',
                      description: 'ID of the selected choice'
                    }
                  },
                  required: ['choiceId']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Next story segment and updated state',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      segment: {
                        $ref: '#/components/schemas/StorySegment'
                      },
                      state: {
                        $ref: '#/components/schemas/StoryState'
                      }
                    },
                    required: ['segment', 'state']
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
              description: 'Internal server error',
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
      '/story/progress': {
        post: {
          summary: 'Update story progress',
          description: 'Update story progress and user preferences',
          operationId: 'updateProgress',
          security: [{ deviceId: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    segmentId: {
                      type: 'string',
                      description: 'ID of the completed segment'
                    },
                    preferences: {
                      type: 'object',
                      description: 'User preferences for story generation',
                      additionalProperties: true
                    }
                  },
                  required: ['segmentId']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Progress update successful',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          state: {
                            $ref: '#/components/schemas/StoryState'
                          }
                        },
                        required: ['state']
                      }
                    ]
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
              description: 'Internal server error',
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
    }
  };
}

/**
 * Extracts test examples from test files
 */
export interface TestExample {
  request: {
    body?: Record<string, any>;
    params?: Record<string, any>;
    query?: Record<string, any>;
  };
  response: {
    status: number;
    body?: Record<string, any>;
  };
}

export const extractTestExamples = (): Record<string, Record<string, TestExample>> => {
  // Return more comprehensive examples for all endpoints
  return {
    '/health': {
      get: {
        request: {},
        response: {
          status: 200,
          body: {
            status: 'success',
            message: 'API is healthy',
            timestamp: new Date().toISOString()
          }
        }
      }
    },
    '/story/current': {
      get: {
        request: {},
        response: {
          status: 200,
          body: {
            segment: {
              id: 'segment-1',
              content: 'Once upon a time...',
              choices: [
                { id: 'choice-1', text: 'Go left', nextSegmentId: 'segment-2' },
                { id: 'choice-2', text: 'Go right', nextSegmentId: 'segment-3' }
              ]
            }
          }
        }
      }
    },
    '/story/choice': {
      post: {
        request: {
          body: {
            choiceId: 'choice-1'
          }
        },
        response: {
          status: 200,
          body: {
            segment: {
              id: 'segment-2',
              content: 'You went left...',
              choices: []
            }
          }
        }
      }
    }
  };
};

/**
 * Configures the API documentation routes
 */
export const setupApiDocs = (router: Router): Router => {
  // Serve OpenAPI spec
  router.get('/api-docs/swagger.json', (req: Request, res: Response) => {
    try {
      const docs = generateApiDocs();
      res.json(docs);
    } catch (error) {
      console.error('Error generating API documentation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate API documentation'
      });
    }
  });

  // Serve Swagger UI
  router.get('/api-docs', (req: Request, res: Response) => {
    try {
      const swaggerHtml = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>API Documentation</title>
            <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui.css">
            <style>
              body { margin: 0; padding: 0; }
              #swagger-ui { max-width: 1460px; margin: 0 auto; }
            </style>
          </head>
          <body>
            <div id="swagger-ui"></div>
            <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-bundle.js"></script>
            <script>
              window.onload = function() {
                SwaggerUIBundle({
                  url: "/api-docs/swagger.json",
                  dom_id: "#swagger-ui",
                  deepLinking: true,
                  presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.SwaggerUIStandalonePreset
                  ],
                  plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                  ],
                  layout: "BaseLayout",
                  defaultModelsExpandDepth: 3,
                  defaultModelExpandDepth: 3,
                  displayRequestDuration: true,
                  docExpansion: "list",
                  filter: true,
                  showExtensions: true,
                  showCommonExtensions: true,
                  syntaxHighlight: {
                    activate: true,
                    theme: "agate"
                  }
                });
              }
            </script>
          </body>
        </html>
      `;
      res.setHeader('Content-Type', 'text/html');
      res.send(swaggerHtml);
    } catch (error) {
      console.error('Error serving Swagger UI:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to serve API documentation UI'
      });
    }
  });

  return router;
}; 