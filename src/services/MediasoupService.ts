import { EventEmitter } from 'events';
import * as mediasoup from 'mediasoup';
import { createLogger } from '../utils/logger';
import { WebSocket, RawData } from 'ws';

const logger = createLogger('MediasoupService');

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
    code: number;
    message: string;
  };
}

interface Notification {
  notification: true;
  method: string;
  data?: any;
}

const config = {
  worker: {
    logLevel: 'debug' as mediasoup.types.WorkerLogLevel,
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      'rtx',
      'bwe',
      'score',
      'simulcast',
      'svc',
      'sctp'
    ] as mediasoup.types.WorkerLogTag[],
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  },
  router: {
    mediaCodecs: [
      {
        kind: 'audio' as mediasoup.types.MediaKind,
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        parameters: {
          minptime: 10,
          useinbandfec: 1
        }
      }
    ]
  }
};

interface Peer {
  id: string;
  ws: WebSocket;
  router?: mediasoup.types.Router;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
  data: {
    rtpCapabilities?: mediasoup.types.RtpCapabilities;
    joined: boolean;
  };
}

export class MediasoupService extends EventEmitter {
  private worker?: mediasoup.types.Worker;
  private peers: Map<string, Peer>;
  private status: 'initializing' | 'running' | 'error';

  constructor() {
    super();
    this.peers = new Map();
    this.status = 'initializing';
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing mediasoup worker with config:', config.worker);
      
      this.worker = await mediasoup.createWorker(config.worker);

      this.worker.on('died', (error) => {
        logger.error('mediasoup worker died', error);
        this.status = 'error';
        setTimeout(() => {
          logger.info('Attempting to restart mediasoup worker...');
          this.initialize();
        }, 2000);
      });

      logger.info('mediasoup worker created successfully');
      this.status = 'running';

    } catch (error) {
      logger.error('Failed to initialize mediasoup worker:', error);
      this.status = 'error';
      throw error;
    }
  }

  public async handleConnection(peerId: string, ws: WebSocket): Promise<void> {
    if (!this.worker || this.status !== 'running') {
      throw new Error('MediasoupService not ready');
    }

    logger.info(`New WebSocket connection from peer ${peerId}`);

    try {
      // Create router for this peer
      const router = await this.worker.createRouter(config.router);
      logger.info(`Created router for peer ${peerId} with capabilities:`, router.rtpCapabilities);

      // Initialize peer state
      const peer: Peer = {
        id: peerId,
        ws,
        router,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        data: {
          joined: false
        }
      };

      this.peers.set(peerId, peer);

      // Handle WebSocket messages
      ws.on('message', async (message: RawData) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          await this.handleRequest(peer, parsedMessage);
        } catch (error) {
          logger.error(`Error processing message from peer ${peerId}:`, error);
          this.sendError(peer, {
            message: error instanceof Error ? error.message : 'Internal error',
            code: 500
          });
        }
      });

      // Handle WebSocket closure
      ws.on('close', () => {
        logger.info(`WebSocket closed for peer ${peerId}`);
        this.handlePeerDisconnection(peer);
      });

      // Handle WebSocket errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error for peer ${peerId}:`, error);
      });

      logger.info(`Peer ${peerId} initialized successfully`);

    } catch (error) {
      logger.error(`Failed to initialize peer ${peerId}:`, error);
      ws.close();
      throw error;
    }
  }

  private async handleRequest(peer: Peer, request: Request): Promise<void> {
    const { id, method, data } = request;

    logger.debug('Received request', { peerId: peer.id, method, id, data });

    try {
      let responseData: any;

      switch (method) {
        case 'getRouterRtpCapabilities':
          responseData = await this.handleGetRouterRtpCapabilities(peer);
          break;

        case 'createWebRtcTransport':
          responseData = await this.handleCreateWebRtcTransport(peer);
          break;

        case 'connectWebRtcTransport':
          await this.handleConnectWebRtcTransport(peer, data);
          responseData = { connected: true };
          break;

        case 'produce':
          responseData = await this.handleProduce(peer, data);
          break;

        case 'consume':
          responseData = await this.handleConsume(peer, data);
          break;

        default:
          throw new Error(`Unknown method ${method}`);
      }

      const response: Response = {
        response: true,
        id,
        ok: true,
        data: responseData
      };

      this.sendMessage(peer, response);
    } catch (error) {
      logger.error(`Request failed [${method}]:`, error);
      this.sendError(peer, {
        code: error instanceof Error ? 500 : 400,
        message: error instanceof Error ? error.message : String(error)
      }, id);
    }
  }

  private async handleGetRouterRtpCapabilities(peer: Peer): Promise<mediasoup.types.RtpCapabilities> {
    logger.info(`Getting router RTP capabilities for peer ${peer.id}`);
    return peer.router!.rtpCapabilities;
  }

  private async handleCreateWebRtcTransport(peer: Peer): Promise<any> {
    if (!peer.router) {
      throw new Error('Router not initialized');
    }

    logger.info(`Creating WebRTC transport for peer ${peer.id}`);

    try {
      const transport = await peer.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 800000
      });

      // Store transport
      peer.transports.set(transport.id, transport);

      // Monitor transport state
      transport.observer.on('close', () => {
        logger.info('Transport closed', { transportId: transport.id });
        peer.transports.delete(transport.id);
      });

      transport.observer.on('newproducer', (producer) => {
        logger.info('New producer', { producerId: producer.id });
      });

      transport.observer.on('newconsumer', (consumer) => {
        logger.info('New consumer', { consumerId: consumer.id });
      });

      // Return only the data needed by the client
      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      };

    } catch (error) {
      logger.error('Failed to create WebRTC transport:', error);
      throw error;
    }
  }

  private async handleConnectWebRtcTransport(peer: Peer, data: any): Promise<void> {
    const { transportId, dtlsParameters } = data;
    const transport = peer.transports.get(transportId);

    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    logger.info('Connecting transport', { transportId, dtlsParameters });

    try {
      await transport.connect({ dtlsParameters });
      logger.info('Transport connected successfully', { 
        transportId,
        dtlsState: transport.dtlsState,
        iceState: transport.iceState
      });
    } catch (error) {
      logger.error('Failed to connect transport:', error);
      throw error;
    }
  }

  private async handleProduce(peer: Peer, data: any): Promise<any> {
    const { transportId, kind, rtpParameters } = data;
    const transport = peer.transports.get(transportId);

    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    if (transport.dtlsState !== 'connected') {
      throw new Error('Transport not connected');
    }

    logger.info('Creating producer', { 
      peerId: peer.id,
      transportId, 
      kind,
      rtpParameters: {
        ...rtpParameters,
        codecs: rtpParameters.codecs.map((codec: any) => ({
          ...codec,
          parameters: codec.parameters
        }))
      }
    });

    try {
      const producer = await transport.produce({
        kind,
        rtpParameters
      });

      peer.producers.set(producer.id, producer);

      // Enhanced producer event logging
      producer.observer.on('close', () => {
        logger.info('Producer closed', { 
          peerId: peer.id,
          producerId: producer.id,
          kind: producer.kind
        });
        peer.producers.delete(producer.id);
      });

      producer.observer.on('pause', () => {
        logger.info('Producer paused', {
          peerId: peer.id,
          producerId: producer.id,
          kind: producer.kind
        });
      });

      producer.observer.on('resume', () => {
        logger.info('Producer resumed', {
          peerId: peer.id,
          producerId: producer.id,
          kind: producer.kind
        });
      });

      // Log successful producer creation
      logger.info('Producer created successfully', {
        peerId: peer.id,
        producerId: producer.id,
        kind: producer.kind,
        type: producer.type,
        paused: producer.paused
      });

      return { id: producer.id };

    } catch (error) {
      logger.error('Failed to create producer:', {
        peerId: peer.id,
        transportId,
        kind,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async handleConsume(peer: Peer, data: any): Promise<any> {
    const { transportId, producerId, rtpCapabilities } = data;
    const transport = peer.transports.get(transportId);

    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    if (!peer.router?.canConsume({ producerId, rtpCapabilities })) {
      logger.warn('Cannot consume producer', {
        peerId: peer.id,
        transportId,
        producerId,
        reason: 'Incompatible RTP capabilities'
      });
      throw new Error('Cannot consume this producer');
    }

    logger.info('Creating consumer', {
      peerId: peer.id,
      transportId,
      producerId,
      rtpCapabilities: {
        codecs: rtpCapabilities.codecs.map((codec: any) => ({
          ...codec,
          parameters: codec.parameters
        }))
      }
    });

    try {
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true // Start paused
      });

      peer.consumers.set(consumer.id, consumer);

      // Enhanced consumer event logging
      consumer.on('transportclose', () => {
        logger.info('Consumer transport closed', {
          peerId: peer.id,
          consumerId: consumer.id,
          kind: consumer.kind
        });
        peer.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        logger.info('Consumer producer closed', {
          peerId: peer.id,
          consumerId: consumer.id,
          kind: consumer.kind
        });
        peer.consumers.delete(consumer.id);
        this.sendNotification(peer, 'producerClosed', { consumerId: consumer.id });
      });

      consumer.on('producerpause', () => {
        logger.info('Producer paused - consumer affected', {
          peerId: peer.id,
          consumerId: consumer.id,
          kind: consumer.kind
        });
      });

      consumer.on('producerresume', () => {
        logger.info('Producer resumed - consumer affected', {
          peerId: peer.id,
          consumerId: consumer.id,
          kind: consumer.kind
        });
      });

      consumer.on('score', (score) => {
        // Only log significant score changes to avoid spam
        if (score.score < 5) { // Log poor scores
          logger.warn('Consumer score is poor', {
            peerId: peer.id,
            consumerId: consumer.id,
            score: score.score,
            producerScore: score.producerScore,
            producerScores: score.producerScores
          });
        } else if (score.score < 7) { // Log mediocre scores
          logger.info('Consumer score is mediocre', {
            peerId: peer.id,
            consumerId: consumer.id,
            score: score.score
          });
        }
      });

      logger.info('Consumer created successfully', {
        peerId: peer.id,
        consumerId: consumer.id,
        kind: consumer.kind,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
        rtpParameters: {
          codecs: consumer.rtpParameters.codecs.map(codec => ({
            ...codec,
            parameters: codec.parameters
          }))
        }
      });

      return {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused
      };

    } catch (error) {
      logger.error('Failed to create consumer:', {
        peerId: peer.id,
        transportId,
        producerId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private handlePeerDisconnection(peer: Peer): void {
    logger.info(`Cleaning up peer ${peer.id}`);

    // Close all transports (this will also close producers and consumers)
    for (const transport of peer.transports.values()) {
      transport.close();
    }

    // Close the router
    peer.router?.close();

    // Remove the peer
    this.peers.delete(peer.id);

    logger.info(`Peer ${peer.id} cleaned up`);
  }

  private sendMessage(peer: Peer, message: Response | ErrorResponse | Notification): void {
    try {
      peer.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error(`Failed to send message to peer ${peer.id}:`, error);
    }
  }

  private sendError(peer: Peer, error: { message: string, code: number }, requestId?: number): void {
    try {
      const errorResponse: ErrorResponse = {
        response: true,
        id: requestId || 0,
        ok: false,
        error
      };
      peer.ws.send(JSON.stringify(errorResponse));
    } catch (err) {
      logger.error(`Failed to send error to peer ${peer.id}:`, err);
    }
  }

  private sendNotification(peer: Peer, method: string, data?: any): void {
    const notification: Notification = {
      notification: true,
      method,
      data
    };
    this.sendMessage(peer, notification);
  }

  public getStatus(): string {
    return this.status;
  }
} 