import { VoiceService } from './VoiceService';
import { DeepgramService } from './DeepgramService';
import { GeminiService } from './GeminiService';
import { CartesiaService } from './CartesiaService';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { MediasoupService } from './MediasoupService';

const logger = createLogger('Services');

/**
 * Initialize all services and set up dependencies
 * @returns Object containing all initialized services
 */
export function initializeServices() {
  logger.info('Initializing services...');
  
  // Initialize MediasoupService first (no dependencies)
  const mediasoupService = new MediasoupService();
  
  // Initialize Voice service with MediasoupService dependency
  const voiceService = new VoiceService(mediasoupService);
  
  // Export other services directly for potential direct usage
  return {
    mediasoup: mediasoupService,
    voice: voiceService,
    deepgram: new DeepgramService(),
    gemini: new GeminiService(),
    cartesia: new CartesiaService()
  };
}

/**
 * Set up WebSocket server with the services
 */
export function setupWebSocketServer(server: any, path: string = '/api/v1/voice') {
  // Create WebSocket server
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ 
    server,
    path
  });
  
  const mediasoupService = new MediasoupService();
  
  // Handle new connections
  wss.on('connection', async (ws: any, req: any) => {
    // Generate unique connection ID
    const peerId = uuidv4();
    
    logger.info(`New WebSocket connection: ${peerId} on path ${path}`);
    
    try {
      await mediasoupService.handleConnection(peerId, ws);
    } catch (error) {
      logger.error(`Failed to initialize mediasoup connection for peer ${peerId}:`, error);
      ws.close();
    }
  });
  
  logger.info(`WebSocket server configured on path ${path}`);
  
  return wss;
}

// Export services
export { MediasoupService } from './MediasoupService';
export { VoiceService } from './VoiceService';
export { DeepgramService } from './DeepgramService';
export { GeminiService } from './GeminiService';
export { CartesiaService } from './CartesiaService'; 