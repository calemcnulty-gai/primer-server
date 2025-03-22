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
      'info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp', 'rtx', 'bwe', 'score', 'simulcast', 'svc', 'sctp'
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
        parameters: { minptime: 10, useinbandfec: 1 },
      },
    ],
  },
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
      logger.info('Initializing mediasoup worker');
      this.worker = await mediasoup.createWorker(config.worker);

      this.worker.on('died', (error) => {
        logger.error('Mediasoup worker died:', error);
        this.status = 'error';
        setTimeout(() => {
          logger.info('Restarting mediasoup worker...');
          this.initialize();
        }, 2000);
      });

      logger.info('Mediasoup worker running');
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

    logger.info(`New WebSocket connection: ${peerId}`);

    try {
      const router = await this.worker.createRouter(config.router);
      logger.debug(`Router created for peer ${peerId}`);

      const peer: Peer = {
        id: peerId,
        ws,
        router,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        data: { joined: false },
      };

      this.peers.set(peerId, peer);

      ws.on('message', (message: RawData) => this.handleRequest(peer, message));
      ws.on('close', () => this.handlePeerDisconnection(peer));
      ws.on('error', (error) => logger.error(`WebSocket error for ${peerId}:`, error));

      logger.info(`Peer ${peerId} initialized`);
    } catch (error) {
      logger.error(`Failed to initialize peer ${peerId}:`, error);
      ws.close();
      throw error;
    }
  }

  private async handleRequest(peer: Peer, message: RawData): Promise<void> {
    let request: Request;
    try {
      request = JSON.parse(message.toString());
    } catch (error) {
      logger.error(`Invalid message from ${peer.id}:`, error);
      return;
    }

    const { id, method, data } = request;
    logger.debug(`Request from ${peer.id}: ${method} (id: ${id})`);

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
          responseData = await this.handleConnectWebRtcTransport(peer, data);
          break;
        case 'produce':
          responseData = await this.handleProduce(peer, data);
          break;
        case 'consume':
          responseData = await this.handleConsume(peer, data);
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }

      this.sendMessage(peer, { response: true, id, ok: true, data: responseData });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Request [${method}] failed for ${peer.id}: ${message}`);
      this.sendError(peer, { code: 500, message }, id);
    }
  }

  private async handleGetRouterRtpCapabilities(peer: Peer): Promise<mediasoup.types.RtpCapabilities> {
    logger.debug(`Providing RTP capabilities for ${peer.id}`);
    return peer.router!.rtpCapabilities;
  }

  private async handleCreateWebRtcTransport(peer: Peer): Promise<any> {
    if (!peer.router) throw new Error('Router not initialized');

    logger.info(`Creating WebRTC transport for ${peer.id}`);

    const transport = await peer.router.createWebRtcTransport({
      listenIps: [{ ip: '10.1.111.119', announcedIp: null }], // TODO: Make configurable
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 800000,
    });

    peer.transports.set(transport.id, transport);

    transport.on('dtlsstatechange', (state) =>
      logger.debug(`Transport ${transport.id} DTLS state: ${state}`)
    );
    transport.on('icestatechange', (state) =>
      logger.debug(`Transport ${transport.id} ICE state: ${state}`)
    );
    transport.on('@close', () => {
      logger.info(`Transport ${transport.id} closed`);
      peer.transports.delete(transport.id);
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  private async handleConnectWebRtcTransport(peer: Peer, data: any): Promise<{ connected: boolean }> {
    const { transportId, dtlsParameters } = data;
    const transport = peer.transports.get(transportId);

    if (!transport) throw new Error(`Transport ${transportId} not found`);

    logger.info(`Connecting transport ${transportId}`);

    await transport.connect({ dtlsParameters });
    logger.info(`Transport ${transportId} connected`, {
      dtlsState: transport.dtlsState,
      iceState: transport.iceState,
    });

    // Wait briefly for state to stabilize (optional, adjust as needed)
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (transport.dtlsState !== 'connected' || transport.iceState !== 'completed') {
      throw new Error(`Transport ${transportId} not fully connected (DTLS: ${transport.dtlsState}, ICE: ${transport.iceState})`);
    }

    return { connected: true };
  }

  private async handleProduce(peer: Peer, data: any): Promise<{ id: string }> {
    const { transportId, kind, rtpParameters } = data;
    const transport = peer.transports.get(transportId);

    if (!transport) throw new Error(`Transport ${transportId} not found`);
    if (transport.dtlsState !== 'connected' || transport.iceState !== 'completed') {
      throw new Error(`Transport ${transportId} not fully connected (DTLS: ${transport.dtlsState}, ICE: ${transport.iceState})`);
    }

    logger.info(`Producing ${kind} on transport ${transportId} for ${peer.id}`);

    const producer = await transport.produce({ kind, rtpParameters });
    peer.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      logger.info(`Producer ${producer.id} closed due to transport`);
      peer.producers.delete(producer.id);
    });

    logger.info(`Producer ${producer.id} created for ${peer.id}`);

    return { id: producer.id };
  }

  private async handleConsume(peer: Peer, data: any): Promise<any> {
    const { transportId, producerId, rtpCapabilities } = data;
    const transport = peer.transports.get(transportId);

    if (!transport) throw new Error(`Transport ${transportId} not found`);
    if (transport.dtlsState !== 'connected' || transport.iceState !== 'completed') {
      throw new Error(`Transport ${transportId} not fully connected`);
    }

    if (!peer.router?.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume this producer');
    }

    logger.info(`Consuming producer ${producerId} for ${peer.id}`);

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    peer.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      logger.info(`Consumer ${consumer.id} closed due to transport`);
      peer.consumers.delete(consumer.id);
    });
    consumer.on('producerclose', () => {
      logger.info(`Consumer ${consumer.id} closed due to producer`);
      peer.consumers.delete(consumer.id);
      this.sendNotification(peer, 'producerClosed', { consumerId: consumer.id });
    });

    logger.info(`Consumer ${consumer.id} created for ${peer.id}`);

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  }

  private handlePeerDisconnection(peer: Peer): void {
    logger.info(`Disconnecting peer ${peer.id}`);

    for (const transport of peer.transports.values()) transport.close();
    peer.router?.close();
    this.peers.delete(peer.id);

    logger.info(`Peer ${peer.id} disconnected`);
  }

  private sendMessage(peer: Peer, message: Response | ErrorResponse | Notification): void {
    try {
      peer.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error(`Failed to send message to ${peer.id}:`, error);
    }
  }

  private sendError(peer: Peer, error: { message: string; code: number }, requestId?: number): void {
    this.sendMessage(peer, {
      response: true,
      id: requestId || 0,
      ok: false,
      error,
    });
  }

  private sendNotification(peer: Peer, method: string, data?: any): void {
    this.sendMessage(peer, { notification: true, method, data });
  }

  public getStatus(): string {
    return this.status;
  }

  public isConnected(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return !!peer && peer.transports.size > 0 && Array.from(peer.transports.values()).some(t => 
      t.dtlsState === 'connected' && t.iceState === 'completed'
    );
  }

  public sendNotificationById(peerId: string, method: string, data?: any): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.sendNotification(peer, method, data);
    }
  }
}