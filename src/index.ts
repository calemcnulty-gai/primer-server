// Load environment variables from .env file
import dotenv from 'dotenv';
// First load the common .env file
dotenv.config();
// Then load environment-specific .env file to override common vars
const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${environment}` });
console.log(`[Environment] Loaded .env.${environment} with model: ${process.env.OPENAI_MODEL}`);

import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { corsMiddleware, corsErrorHandler } from './middleware/cors';
import { loggingMiddleware } from './middleware/logging';
import { responseFormatter } from './middleware/responseFormatter';
import { setupSwaggerMiddleware } from './middleware/swagger.middleware';
import { validateApiKeys } from './config/services';
import { createBaseRouter } from './routes/baseRouter';
import { healthRouter } from './routes/health.routes';
import { initStoryRoutes } from './routes/story.routes';
import { initMonitoringRoutes } from './routes/monitoring.routes';
import { attachDeviceId } from './middleware/deviceId';

export const app = express();

// Apply middlewares
app.use(loggingMiddleware);
app.use(corsMiddleware);
app.use(express.json());
app.use(responseFormatter());
app.use(attachDeviceId);

// API Documentation
const docsRouter = express.Router();
setupSwaggerMiddleware(docsRouter);
app.use('/', docsRouter);

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes should be defined here
const v1Router = createBaseRouter('v1');
v1Router.use('/health', healthRouter);

// Get API key from environment
const apiKey = process.env.OPENAI_API_KEY || '';
if (!apiKey) {
  console.warn('WARNING: OPENAI_API_KEY not set in environment variables');
}

// Mount story routes on API router
v1Router.use('/story', initStoryRoutes(apiKey));

// Mount monitoring routes
v1Router.use('/monitoring', initMonitoringRoutes());

// Add the main router to the app
app.use((v1Router as any).mainRouter);

// Error handling middleware should be last
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  corsErrorHandler(err, req, res, next);
});
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorHandler(err, req, res, next);
});

// Create server function for better testability
export const createServer = (port: number = Number(process.env.PORT) || 3000) => {
  // Validate API keys on startup
  validateApiKeys();
  
  return app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`📚 API Documentation available at http://localhost:${port}/api-docs`);
  });
};

// Export for testing
export const isMainModule = () => require.main === module;

// Start server if this file is run directly
if (isMainModule()) {
  createServer();
} 