import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { MediasoupService } from '../services/MediasoupService';

const logger = createLogger('WebSocketRouter');
const mediasoupService = new MediasoupService();

export function configureWebSocket(wss: any, path: string): void {
  logger.info(`Configuring WebSocket server on path: ${path}`);

  wss.on('connection', async (ws: WebSocket, req: any) => {
    if (req.url !== path) {
      logger.warn(`Rejected WebSocket connection to invalid path: ${req.url}`);
      ws.close();
      return;
    }

    const peerId = uuidv4();
    logger.info(`New WebSocket connection on ${path}, assigned peerId: ${peerId}`);

    try {
      await mediasoupService.handleConnection(peerId, ws);
    } catch (error) {
      logger.error(`Failed to initialize mediasoup connection for peer ${peerId}:`, error);
      ws.close();
    }
  });
} 