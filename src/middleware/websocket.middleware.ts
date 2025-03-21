import * as http from 'http';
import * as WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { VoiceControllerInterface } from '../controllers/voiceController';
import { WebRTCService } from '../services/WebRTCService';

/**
 * WebSocket middleware for handling voice connections
 * @deprecated Use setupWebSocketServer from services/index.ts instead
 */
export function setupVoiceWebSocket(
  server: http.Server,
  voiceController: VoiceControllerInterface,
  path: string
): WebSocket.Server {
  // Create WebSocket server with specified path
  const wss = new WebSocket.Server({ 
    server,
    path
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket) => {
    // Generate connection ID
    const connectionId = uuidv4();
    
    // Handle connection with voice controller
    voiceController.handleWebSocketConnection(connectionId, ws);
  });

  return wss;
}

/**
 * Set up WebSocket server with WebRTC service
 * This is a bridge function to help migrate from the controller approach to the services approach
 */
export function setupWebRTCWebSocket(
  server: http.Server,
  webrtcService: WebRTCService,
  path: string
): WebSocket.Server {
  // Create WebSocket server with specified path
  const wss = new WebSocket.Server({ 
    server,
    path
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket) => {
    // Generate connection ID
    const connectionId = uuidv4();
    
    // Handle connection with WebRTC service
    webrtcService.handleNewConnection(connectionId, ws);
  });

  return wss;
}