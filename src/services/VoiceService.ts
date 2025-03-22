import { EventEmitter } from 'events';
import { DeepgramService } from './DeepgramService';
import { CartesiaService, CartesiaResponse } from './CartesiaService';
import { MediasoupService } from './MediasoupService';
import { createLogger } from '../utils/logger';
import * as mediasoup from 'mediasoup';

const logger = createLogger('VoiceService');

// Interface to track audio session state
interface AudioSession {
  connectionId: string;       // Associated connection ID
  isListening: boolean;       // Whether we're currently listening
  totalAudioReceived: number; // Track total bytes received
  producer?: mediasoup.types.Producer; // Active audio producer
  deepgramConnection?: any;   // Active Deepgram connection
}

export class VoiceService extends EventEmitter {
  private sessions: Map<string, AudioSession>;
  private status: 'initializing' | 'running' | 'error';
  private mediasoupService: MediasoupService;
  private deepgramService: DeepgramService;
  private cartesiaService: CartesiaService;

  constructor(mediasoupService: MediasoupService) {
    super();
    this.sessions = new Map();
    this.status = 'initializing';
    this.mediasoupService = mediasoupService;

    // Initialize services
    this.deepgramService = new DeepgramService();
    this.cartesiaService = new CartesiaService();

    logger.info('Voice service created with necessary services initialized');
    
    // Register event handlers for mediasoup events
    this.setupMediasoupListeners();
    
    this.initialize();
  }

  /**
   * Setup listeners for mediasoup events
   */
  private setupMediasoupListeners(): void {
    // Handle new connections
    this.mediasoupService.on('peer:new', (peerId: string) => {
      logger.info(`New mediasoup connection initiated: ${peerId}`);
    });
    
    // Handle established connections
    this.mediasoupService.on('peer:ready', (peerId: string) => {
      logger.info(`Mediasoup connection ready for ${peerId}, creating voice session`);
      this.createSession(peerId);
    });
    
    // Handle closed connections
    this.mediasoupService.on('peer:closed', (peerId: string) => {
      logger.info(`Mediasoup connection closed for ${peerId}, cleaning up voice session`);
      this.deleteSession(peerId);
    });
    
    // Handle incoming audio producer
    this.mediasoupService.on('producer:new', (peerId: string, producer: mediasoup.types.Producer) => {
      const session = this.sessions.get(peerId);
      if (!session) {
        logger.warn(`Received producer for nonexistent session: ${peerId}`);
        this.createSession(peerId);
      }
      
      const updatedSession = this.sessions.get(peerId)!;
      updatedSession.producer = producer;
      
      logger.info(`Received audio producer for ${peerId}:`, {
        id: producer.id,
        kind: producer.kind,
        type: producer.type,
        rtpParameters: producer.rtpParameters
      });
      
      if (updatedSession.isListening) {
        logger.info(`Session already listening, initiating audio processing for ${peerId}`);
        this.handleAudioProducer(peerId, producer);
      } else {
        logger.info(`Producer stored but waiting for start-listening command for ${peerId}`);
      }
    });
  }

  /**
   * Initialize the voice service
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing voice service...');
      this.status = 'running';
      logger.info('Voice service initialized and ready to process audio');
    } catch (error) {
      this.status = 'error';
      logger.error('Voice service initialization failed:', error);
    }
  }

  /**
   * Get the current status of the voice service
   */
  public getStatus(): string {
    return this.status;
  }

  /**
   * Create a new voice session for a connection
   */
  private createSession(connectionId: string): void {
    // Only create if it doesn't exist already
    if (this.sessions.has(connectionId)) return;
    
    const session: AudioSession = {
      connectionId,
      isListening: false,
      totalAudioReceived: 0
    };
    
    this.sessions.set(connectionId, session);
    logger.info(`Created voice session for ${connectionId}`);
  }
  
  /**
   * Delete a voice session when connection is closed
   */
  private deleteSession(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      if (session.deepgramConnection) {
        session.deepgramConnection.finish();
      }
    }
    this.sessions.delete(connectionId);
    logger.info(`Deleted voice session for ${connectionId}`);
  }

  /**
   * Handle incoming audio producer from client
   */
  private async handleAudioProducer(connectionId: string, producer: mediasoup.types.Producer): Promise<void> {
    const session = this.sessions.get(connectionId);
    if (!session) {
      logger.warn(`No session for ${connectionId}`);
      return;
    }
    if (!session.isListening) {
      logger.debug(`Not listening for ${connectionId}`);
      return;
    }
    if (session.deepgramConnection) {
      logger.info(`Already processing for ${connectionId}`);
      return;
    }

    try {
      logger.info(`Processing audio producer for ${connectionId}:`, {
        id: producer.id,
        kind: producer.kind,
        type: producer.type,
        rtpParameters: producer.rtpParameters
      });

      // For now, just log the RTP stats periodically
      const statsInterval = setInterval(async () => {
        const stats = await producer.getStats();
        logger.info(`Producer stats for ${connectionId}:`, stats);
      }, 5000);

      // Clean up interval on producer close
      producer.on('transportclose', () => {
        clearInterval(statsInterval);
      });

      // TODO: In the next phase, we'll implement the actual audio processing pipeline
      // This will involve:
      // 1. Getting raw audio data from the producer
      // 2. Converting it to the format Deepgram expects
      // 3. Sending it to Deepgram

    } catch (error) {
      logger.error(`Error processing audio for ${connectionId}:`, error);
      if (session.deepgramConnection) {
        session.deepgramConnection.finish();
        session.deepgramConnection = undefined;
      }
    }
  }

  /**
   * Start listening to the client's audio stream
   */
  public startListening(connectionId: string): boolean {
    const session = this.sessions.get(connectionId);
    if (!session) {
      logger.warn(`Cannot start listening: No session exists for ${connectionId}`);
      return false;
    }
    
    logger.info(`Starting to listen for ${connectionId}, current state: isListening=${session.isListening}`);
    
    if (session.isListening) {
      logger.info(`Already listening to ${connectionId}`);
      return true;
    }

    if (!this.mediasoupService.isConnected(connectionId)) {
      logger.warn(`Cannot start listening: mediasoup not connected for ${connectionId}`);
      return false;
    }
    
    // Reset audio buffer and start listening
    session.totalAudioReceived = 0;
    session.isListening = true;
    
    logger.info(`Started listening to ${connectionId}`);
    
    // If we already have a producer, start processing it now
    if (session.producer) {
      logger.info(`Producer already available for ${connectionId}, starting audio processing`);
      this.handleAudioProducer(connectionId, session.producer);
    } else {
      logger.info(`Waiting for producer to arrive for ${connectionId}`);
    }
    
    return true;
  }

  /**
   * Stop listening and clean up
   */
  public stopListening(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    if (!session || !session.isListening) return;

    session.isListening = false;
    logger.info(`Stopped listening to ${connectionId}`);

    // Clean up audio processing
    if (session.deepgramConnection) {
      session.deepgramConnection.finish();
      session.deepgramConnection = undefined;
    }

    this.mediasoupService.sendNotificationById(connectionId, 'listening-stopped');
  }
}
