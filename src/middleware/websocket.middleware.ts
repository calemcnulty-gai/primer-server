import * as http from 'http';
import * as WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { VoiceControllerInterface } from '../controllers/voiceController';

/**
 * WebSocket middleware for handling voice connections
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