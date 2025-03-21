import { WebRTCService } from './WebRTCService';
import { VoiceService } from './VoiceService';
import { DeepgramService } from './DeepgramService';
import { GeminiService } from './GeminiService';
import { CartesiaService } from './CartesiaService';
import { createLogger } from '../utils/logger';

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

// Example integration with a WebSocket server
export function setupWebSocketServer(wss: any, services: ReturnType<typeof initializeServices>) {
  const { webrtc } = services;
  
  wss.on('connection', (ws: any, req: any) => {
    // Generate unique connection ID
    const connectionId = generateConnectionId();
    
    logger.info(`New WebSocket connection: ${connectionId}`);
    
    // Pass connection to WebRTC service for handling
    webrtc.handleNewConnection(connectionId, ws);
  });
  
  logger.info('WebSocket server configured to use WebRTC and Voice services');
}

/**
 * Generate a unique connection ID
 */
function generateConnectionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

// Export all services directly
export { WebRTCService } from './WebRTCService';
export { VoiceService } from './VoiceService';
export { DeepgramService } from './DeepgramService';
export { GeminiService } from './GeminiService';
export { CartesiaService } from './CartesiaService'; 