import { WebRTCService } from './WebRTCService';
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
  
  // Initialize WebRTC service first (no dependencies)
  const webrtcService = new WebRTCService();
  
  // Initialize Voice service with WebRTC dependency
  const voiceService = new VoiceService(webrtcService);
  
  // Export other services directly for potential direct usage
  return {
    webrtc: webrtcService,
    voice: voiceService,
    deepgram: new DeepgramService(),
    gemini: new GeminiService(),
    cartesia: new CartesiaService()
  };
}

// Type definition for the services object
export type Services = ReturnType<typeof initializeServices>;

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

// Export all services directly
export { WebRTCService } from './WebRTCService';
export { VoiceService } from './VoiceService';
export { DeepgramService } from './DeepgramService';
export { GeminiService } from './GeminiService';
export { CartesiaService } from './CartesiaService'; 