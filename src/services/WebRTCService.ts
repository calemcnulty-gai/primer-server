import { EventEmitter } from 'events';
import * as mediasoup from 'mediasoup';
import { createLogger } from '../utils/logger';

const logger = createLogger('WebRTCService');

// Types for connection state tracking
export interface RTCConnectionState {
  id: string;
  ws: any;  // WebSocket connection for signaling
  transport?: mediasoup.types.WebRtcTransport;
  transportConnected: boolean;  // Track if transport is connected
  producer?: mediasoup.types.Producer;
  router?: mediasoup.types.Router;
  state: 'new' | 'connecting' | 'connected' | 'failed' | 'closed';
  lastActivity: number;
  connected: boolean;
}

// Message types for client communication
export interface WebRTCMessage {
  type: string;
  [key: string]: any;
}

// Events emitted by WebRTCService
export interface WebRTCEvents {
  'connection:new': (connectionId: string) => void;
  'connection:ready': (connectionId: string) => void;
  'connection:closed': (connectionId: string) => void;
  'stream': (connectionId: string, producer: mediasoup.types.Producer) => void;
  'message': (connectionId: string, message: WebRTCMessage) => void;
  'error': (connectionId: string, code: string, message: string) => void;
}

// Standard mediasoup message interfaces
interface Request {
  id: number;
  method: string;
  data?: any;
}

interface Response {
  response: true;
  id: number;
  ok: true;
  data?: any;
}

interface ErrorResponse {
  response: true;
  id: number;
  ok: false;
  error: {
    code: string | number;
    message: string;
  };
}

interface Notification {
  notification: true;
  method: string;
  data?: any;
}

export class WebRTCService extends EventEmitter {
  private connections: Map<string, RTCConnectionState>;
  private worker?: mediasoup.types.Worker;
  private status: 'initializing' | 'running' | 'error';

  constructor() {
    super();
    this.connections = new Map();
    this.status = 'initializing';
    logger.info('WebRTC service created');
    this.initialize();
  }

  /**
   * Initialize mediasoup worker and router
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing mediasoup worker...');
      
      // Create mediasoup worker
      this.worker = await mediasoup.createWorker({
        logLevel: 'warn',
        logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      });

      this.worker.on('died', () => {
        logger.error('mediasoup worker died, attempting restart...');
        setTimeout(() => this.initialize(), 2000);
      });

      this.status = 'running';
      logger.info('WebRTC service initialized and ready');
    } catch (error) {
      this.status = 'error';
      logger.error('WebRTC service initialization failed:', error);
    }
  }

  /**
   * Get the current status of the WebRTC service
   */
  public getStatus(): string {
    return this.status;
  }

  /**
   * Handle a new WebSocket connection for signaling
   */
  public async handleNewConnection(connectionId: string, ws: any): Promise<void> {
    logger.info(`New WebSocket connection received: ${connectionId}`);

    try {
      if (!this.worker) {
        throw new Error('Worker not initialized');
      }

      // Create a new router for this connection
      const router = await this.worker.createRouter({
        mediaCodecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
            parameters: {
              minptime: 10,
              useinbandfec: 1
            }
          }
        ]
      });

      // Create connection state
      const connection: RTCConnectionState = {
        id: connectionId,
        ws,
        router,
        state: 'new',
        lastActivity: Date.now(),
        connected: false,
        transportConnected: false
      };

      this.connections.set(connectionId, connection);

      // Handle WebSocket messages
      ws.on('message', async (message: any) => {
        // Update last activity timestamp
        connection.lastActivity = Date.now();
        await this.handleWebSocketMessage(connectionId, message);
      });

      // Handle WebSocket closure
      ws.on('close', () => {
        this.handleConnectionClosed(connectionId);
      });

      // Handle WebSocket errors
      ws.on('error', (error: Error) => {
        logger.error(`WebSocket error for ${connectionId}:`, error);
        this.sendError(connectionId, {
          code: 'CONNECTION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to connect'
        }, undefined);
      });

      // Send initial connection info to client
      this.sendNotification(connectionId, 'routerRtpCapabilities', {
        rtpCapabilities: router.rtpCapabilities,
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      this.emit('connection:new', connectionId);

    } catch (error) {
      logger.error(`Failed to setup connection ${connectionId}:`, error);
      this.sendError(connectionId, {
        code: 'SETUP_FAILED',
        message: 'Failed to initialize connection'
      }, undefined);
      ws.close();
    }
  }

  /**
   * Handle WebSocket messages for signaling
   */
  private async handleWebSocketMessage(connectionId: string, message: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.error(`No connection found for ${connectionId}`);
      return;
    }

    connection.lastActivity = Date.now();
    let parsedRequest: Request | undefined;

    try {
      // Parse message
      try {
        if (typeof message === 'string') {
          parsedRequest = JSON.parse(message);
        } else if (message instanceof Buffer) {
          parsedRequest = JSON.parse(message.toString());
        } else if (message && typeof message === 'object') {
          parsedRequest = message;
        } else {
          throw new Error('Invalid message format');
        }

        if (!parsedRequest.id || !parsedRequest.method) {
          throw new Error('Missing required fields');
        }
      } catch (e) {
        logger.error(`Failed to parse message from ${connectionId}:`, e);
        this.sendError(connectionId, {
          code: 'INVALID_MESSAGE',
          message: 'Message format invalid'
        });
        return;
      }

      const request = parsedRequest; // Now TypeScript knows this is defined
      logger.info(`Received request method ${request.method} from ${connectionId}`, {
        method: request.method,
        connectionState: connection.state,
        hasTransport: !!connection.transport,
        hasProducer: !!connection.producer
      });

      let responseData: any;

      switch (request.method) {
        case 'createWebRtcTransport':
          if (!connection.router) {
            throw new Error('Router not initialized');
          }

          // If there's an existing transport, close it first
          if (connection.transport) {
            logger.info(`Closing existing transport for ${connectionId}`);
            connection.transport.close();
            connection.transportConnected = false;
          }

          connection.transport = await connection.router.createWebRtcTransport({
            listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: 800000
          });

          logger.info(`Transport created for ${connectionId}`, {
            transportId: connection.transport.id,
            iceState: connection.transport.iceState,
            dtlsState: connection.transport.dtlsState
          });

          responseData = {
            id: connection.transport.id,
            iceParameters: connection.transport.iceParameters,
            iceCandidates: connection.transport.iceCandidates,
            dtlsParameters: connection.transport.dtlsParameters
          };
          break;

        case 'connectWebRtcTransport':
          if (!connection.transport) {
            throw new Error('Transport not created');
          }

          if (!request.data?.dtlsParameters) {
            throw new Error('Missing DTLS parameters');
          }

          await connection.transport.connect({ dtlsParameters: request.data.dtlsParameters });
          connection.state = 'connected';
          connection.connected = true;
          connection.transportConnected = true;

          logger.info(`Transport connected for ${connectionId}`, {
            iceState: connection.transport.iceState,
            dtlsState: connection.transport.dtlsState
          });

          responseData = { connected: true };
          break;

        case 'produce':
          if (!connection.transport) {
            throw new Error('Transport not created');
          }

          if (!connection.connected) {
            throw new Error('Transport not connected');
          }

          if (!request.data?.rtpParameters) {
            throw new Error('Missing RTP parameters');
          }

          const producer = await connection.transport.produce({
            kind: 'audio',
            rtpParameters: request.data.rtpParameters
          });

          connection.producer = producer;

          logger.info(`Audio producer created for ${connectionId}:`, {
            id: producer.id,
            kind: producer.kind,
            type: producer.type,
            paused: producer.paused,
            score: producer.score,
            rtpParameters: producer.rtpParameters
          });

          producer.observer.on('score', (score) => {
            logger.debug(`Producer score for ${connectionId}:`, score);
          });

          producer.observer.on('close', () => {
            logger.info(`Producer closed for ${connectionId}`);
            connection.producer = undefined;
          });

          responseData = { id: producer.id };
          this.emit('stream', connectionId, producer);
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      // Send success response
      this.sendResponse(connectionId, {
        response: true,
        id: request.id,
        ok: true,
        data: responseData
      });

    } catch (error) {
      logger.error(`Error processing message from ${connectionId}:`, error);
      this.sendError(connectionId, {
        code: 'REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to process request'
      }, parsedRequest?.id);
    }
  }

  /**
   * Close a specific connection
   */
  public closeConnection(connectionId: string): void {
    this.handleConnectionClosed(connectionId);
  }

  /**
   * Handle connection closed
   */
  private async handleConnectionClosed(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      // Clean up mediasoup resources
      if (connection.producer) {
        connection.producer.close();
      }
      
      if (connection.transport) {
        connection.transport.close();
      }
      
      if (connection.router) {
        connection.router.close();
      }

      this.connections.delete(connectionId);
      this.emit('connection:closed', connectionId);

      logger.info(`Connection closed and cleaned up: ${connectionId}`);
    } catch (error) {
      logger.error(`Error cleaning up connection ${connectionId}:`, error);
    }
  }

  /**
   * Send a message to a connection
   */
  public sendMessage(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state === 'closed') return false;

    try {
      connection.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`Error sending message to ${connectionId}:`, error);
      return false;
    }
  }

  /**
   * Send an error message to a connection
   */
  public sendError(connectionId: string, error: { code: string | number, message: string }, requestId?: number): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state === 'closed') return;

    try {
      const errorResponse: ErrorResponse = {
        response: true,
        id: requestId || 0,
        ok: false,
        error: {
          code: typeof error.code === 'string' ? 500 : error.code,
          message: error.message
        }
      };
      connection.ws.send(JSON.stringify(errorResponse));
      this.emit('error', connectionId, String(error.code), error.message);
    } catch (err) {
      logger.error(`Error sending error to ${connectionId}:`, err);
    }
  }

  /**
   * Check if a connection is established
   */
  public isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return !!(connection?.connected && connection.state === 'connected');
  }

  /**
   * Get the WebRTC configuration for clients
   */
  public getRTCConfig(): { iceServers: Array<{ urls: string }> } {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  private sendResponse(connectionId: string, response: Response): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state === 'closed') return;

    try {
      connection.ws.send(JSON.stringify(response));
    } catch (error) {
      logger.error(`Error sending response to ${connectionId}:`, error);
    }
  }

  private sendNotification(connectionId: string, method: string, data?: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state === 'closed') return;

    try {
      const notification: Notification = {
        notification: true,
        method,
        data
      };
      connection.ws.send(JSON.stringify(notification));
    } catch (error) {
      logger.error(`Error sending notification to ${connectionId}:`, error);
    }
  }
} 