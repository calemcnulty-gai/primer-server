import express, { Application, Router } from 'express';
import cors from 'cors';
import path from 'path';
import { healthRouter } from './routes/health.routes';
import { responseFormatter } from './middleware/responseFormatter';
import { errorHandler } from './middleware/errorHandler';
import { setupSwaggerMiddleware } from './middleware/swagger.middleware';
import { attachDeviceId } from './middleware/deviceId';
import { createBaseRouter } from './routes/baseRouter';
import { initStoryRoutes } from './routes/story.routes';
import { initMonitoringRoutes } from './routes/monitoring.routes';
// import { initRTVIRoutes } from './routes/rtvi.routes';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app: Application = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(responseFormatter());
app.use(attachDeviceId);

// Serve static files from public directory
app.use('/static', express.static(path.join(__dirname, '../public')));

// Create a docs router
const docsRouter = Router();

// Setup Swagger documentation
setupSwaggerMiddleware(docsRouter);

// Initialize API v1 router
const v1Router = createBaseRouter('v1');

// Get API key from environment
const apiKey = process.env.OPENAI_API_KEY || '';
if (!apiKey) {
  console.warn('WARNING: OPENAI_API_KEY not set in environment variables');
}

// Mount story routes on API router
v1Router.use('/story', initStoryRoutes(apiKey));

// Mount monitoring routes
v1Router.use('/monitoring', initMonitoringRoutes());

// Mount RTVI routes
// v1Router.use('/rtvi', initRTVIRoutes());

// Mount the main router from v1Router
app.use((v1Router as any).mainRouter);

// Routes
app.use('/health', healthRouter);
app.use('/', docsRouter);

// Error handling middleware (must be last)
app.use(errorHandler as express.ErrorRequestHandler);

export default app; 