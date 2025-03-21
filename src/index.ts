// Load environment variables from .env file
import dotenv from 'dotenv';
// First load the common .env file
dotenv.config();
// Then load environment-specific .env file to override common vars
const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${environment}` });
console.log(`[Environment] Loaded .env.${environment} with model: ${process.env.OPENAI_MODEL}`);

import express from 'express';
import * as http from 'http';
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
import { initVoiceRoutes } from './routes/voice.routes';
import { attachDeviceId } from './middleware/deviceId';
import { VoiceController } from './controllers/voiceController';
import { LogLevel, setServiceLogLevel, setGlobalLogLevel, createLogger } from './utils/logger';
import { initializeServices, setupWebSocketServer } from './services';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http'; // Use IncomingMessage from http instead of ws
import { generateRandomId } from './utils/utils';

const logger = createLogger('Server');

// Configure logging levels
if (process.env.NODE_ENV !== 'test') {
  // Set default log level based on environment
  const defaultLogLevel = process.env.NODE_ENV === 'production' 
    ? LogLevel.WARN  // Less verbose in production 
    : LogLevel.INFO; // More verbose in development
  
  // Set global default log level
  setGlobalLogLevel(defaultLogLevel);
  
  // Set specific service log levels
  setServiceLogLevel('VoiceService', LogLevel.WARN);    // Reduce verbosity for VoiceService
  setServiceLogLevel('DeepgramService', LogLevel.DEBUG); // Detailed logs for Deepgram debugging
  setServiceLogLevel('CartesiaService', LogLevel.INFO);  // Normal logs for CartesiaService
  
  // Allow override from environment variables (e.g. LOG_LEVEL=1 for INFO only)
  if (process.env.LOG_LEVEL) {
    const level = parseInt(process.env.LOG_LEVEL, 10);
    if (!isNaN(level) && level >= LogLevel.DEBUG && level <= LogLevel.NONE) {
      console.log(`Overriding log level from environment: ${LogLevel[level]}`);
      setGlobalLogLevel(level);
    }
  }
}

export const app = express();
export const server = http.createServer(app);

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

// Initialize all services
const services = initializeServices();

// Initialize voice controller with the new service
const voiceController = new VoiceController(services.voice, services.webrtc);

// Mount voice routes
v1Router.use('/voice', initVoiceRoutes(voiceController));

// Add the main router to the app
app.use((v1Router as any).mainRouter);

// Error handling middleware should be last
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  corsErrorHandler(err, req, res, next);
});
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorHandler(err, req, res, next);
});

// Set up WebSocket with the WebRTC service
setupWebSocketServer(server, services);

// Export services for access from controllers
export const voiceService = services.voice;
export const webrtcService = services.webrtc;

// Create server function for better testability
export const createServer = (port: number = Number(process.env.PORT) || 3000) => {
  // Validate API keys on startup
  validateApiKeys();
  
  // Start the HTTP server
  return server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`📚 API Documentation available at http://localhost:${port}/api-docs`);
    console.log(`🎤 Voice WebSocket server available at ws://localhost:${port}/api/v1/voice`);
  });
};

// Export for testing
export const isMainModule = () => require.main === module;

// Start server if this file is run directly
if (isMainModule()) {
  createServer();
} 