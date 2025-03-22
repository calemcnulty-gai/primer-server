import * as http from 'http';
import { WebSocket, Server as WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { VoiceControllerInterface } from '../controllers/voiceController';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { VoiceController } from '../controllers/voiceController';
import { MediasoupService } from '../services/MediasoupService';

const logger = createLogger('WebSocketMiddleware');

/**
 * WebSocket middleware for handling voice connections
 */
export function setupVoiceWebSocket(
  server: http.Server,
  voiceController: VoiceControllerInterface,
  path: string
): WebSocketServer {
  // Create WebSocket server with specified path
  const wss = new WebSocketServer({ 
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

// Middleware to handle WebSocket upgrade requests
export function websocketMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check if this is a WebSocket upgrade request
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    return next();
  }

  // Log WebSocket connection attempt
  logger.info('WebSocket upgrade request received');

  // Let the WebSocket server handle the upgrade
  next();
}

// Export types for TypeScript support
export type WebSocketWithId = WebSocket & { id?: string };

export function createWebSocketMiddleware(voiceController: VoiceController) {
  return function handleWebSocket(ws: WebSocket, req: Request) {
    const connectionId = req.params.connectionId;
    if (!connectionId) {
      logger.error('No connection ID provided');
      ws.close();
      return;
    }

    logger.info(`WebSocket connection request for ${connectionId}`);
    voiceController.handleWebSocketConnection(connectionId, ws);
  };
}