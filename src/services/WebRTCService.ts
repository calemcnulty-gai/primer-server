import { EventEmitter } from 'events';
import * as mediasoup from 'mediasoup';
import { createLogger } from '../utils/logger';

const logger = createLogger('WebRTCService');

// Types for connection state tracking
export interface RTCConnectionState {
  id: string;
  ws: any;  // WebSocket connection for signaling
  transport?: mediasoup.types.WebRtcTransport;
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
            channels: 2
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
        connected: false
      };

      this.connections.set(connectionId, connection);

      // Handle WebSocket messages
      ws.on('message', (message: any) => {
        this.handleWebSocketMessage(connectionId, message);
      });

      // Handle WebSocket closure
      ws.on('close', () => {
        this.handleConnectionClosed(connectionId);
      });

      // Handle WebSocket errors
      ws.on('error', (error: Error) => {
        logger.error(`WebSocket error for ${connectionId}:`, error);
        this.sendError(connectionId, 'CONNECTION_ERROR', error.message);
      });

      // Send router RTP capabilities to client
      this.sendMessage(connectionId, {
        type: 'connection-ready',
        routerRtpCapabilities: router.rtpCapabilities
      });

      this.emit('connection:new', connectionId);

    } catch (error) {
      logger.error(`Failed to setup connection ${connectionId}:`, error);
      this.sendError(connectionId, 'SETUP_FAILED', 'Failed to initialize connection');
      ws.close();
    }
  }

  /**
   * Handle WebSocket messages for signaling
   */
  private async handleWebSocketMessage(connectionId: string, message: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastActivity = Date.now();

    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      logger.debug(`Received message type ${data.type} from ${connectionId}`);

      switch (data.type) {
        case 'connect-transport':
          await this.handleConnectTransport(connectionId, data);
          break;

        case 'create-transport':
          await this.handleCreateTransport(connectionId, data);
          break;

        case 'produce':
          await this.handleProduce(connectionId, data);
          break;

        default:
          // Forward unhandled messages to listeners
          this.emit('message', connectionId, data);
          break;
      }
    } catch (error) {
      logger.error(`Error processing message from ${connectionId}:`, error);
      this.sendError(connectionId, 'MESSAGE_ERROR', 'Failed to process message');
    }
  }

  /**
   * Handle transport creation request
   */
  private async handleCreateTransport(connectionId: string, data: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.router) return;

    try {
      const transport = await connection.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 800000
      });

      connection.transport = transport;
      connection.state = 'connecting';

      // Send transport parameters to client
      this.sendMessage(connectionId, {
        type: 'transport-created',
        transportId: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });

    } catch (error) {
      logger.error(`Failed to create transport for ${connectionId}:`, error);
      this.sendError(connectionId, 'TRANSPORT_ERROR', 'Failed to create transport');
    }
  }

  /**
   * Handle transport connection request
   */
  private async handleConnectTransport(connectionId: string, data: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.transport) return;

    try {
      await connection.transport.connect({
        dtlsParameters: data.dtlsParameters
      });

      connection.state = 'connected';
      connection.connected = true;
      
      this.sendMessage(connectionId, {
        type: 'transport-connected'
      });

      this.emit('connection:ready', connectionId);

    } catch (error) {
      logger.error(`Failed to connect transport for ${connectionId}:`, error);
      this.sendError(connectionId, 'TRANSPORT_CONNECT_ERROR', 'Failed to connect transport');
    }
  }

  /**
   * Handle produce request (client wants to send audio)
   */
  private async handleProduce(connectionId: string, data: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.transport) return;

    try {
      const producer = await connection.transport.produce({
        kind: 'audio',
        rtpParameters: data.rtpParameters
      });

      connection.producer = producer;

      // Log audio stream metadata
      logger.info(`Audio producer created for ${connectionId}:`, {
        id: producer.id,
        kind: producer.kind,
        type: producer.type,
        paused: producer.paused,
        score: producer.score
      });

      // Monitor producer stats
      setInterval(async () => {
        const stats = await producer.getStats();
        logger.debug(`Producer stats for ${connectionId}:`, stats);
      }, 10000);

      // Send producer ID to client
      this.sendMessage(connectionId, {
        type: 'producer-created',
        producerId: producer.id
      });

      // Emit stream event with producer
      this.emit('stream', connectionId, producer);

    } catch (error) {
      logger.error(`Failed to create producer for ${connectionId}:`, error);
      this.sendError(connectionId, 'PRODUCE_ERROR', 'Failed to create producer');
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
  public sendError(connectionId: string, code: string, message: string): void {
    logger.warn(`Sending error to ${connectionId}: ${code} - ${message}`);
    this.sendMessage(connectionId, {
      type: 'error',
      error: { code, message }
    });
    this.emit('error', connectionId, code, message);
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
} 