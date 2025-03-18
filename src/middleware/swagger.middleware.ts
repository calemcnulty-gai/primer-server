import express, { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateApiDocs } from '../test/docs/api.docs';

/**
 * Setup Swagger documentation middleware
 */
export function setupSwaggerMiddleware(router: Router) {
  try {
    const swaggerDocument = generateApiDocs();

    const swaggerUiOptions = {
      explorer: true,
      swaggerOptions: {
        deepLinking: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showCommonExtensions: true
      }
    };

    router.use('/api-docs', swaggerUi.serve);
    router.get('/api-docs', swaggerUi.setup(swaggerDocument, swaggerUiOptions));

    router.get('/api-docs/swagger.json', (req, res) => {
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
  } catch (error) {
    console.error('Error setting up Swagger middleware:', error);
    throw error;
  }
} 