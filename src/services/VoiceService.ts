import { EventEmitter } from 'events';
import { DeepgramService } from './DeepgramService';
import { CartesiaService, CartesiaResponse } from './CartesiaService';
import { WebRTCService } from './WebRTCService';
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
  private webrtcService: WebRTCService;
  private deepgramService: DeepgramService;
  private cartesiaService: CartesiaService;

  constructor(webrtcService: WebRTCService) {
    super();
    this.sessions = new Map();
    this.status = 'initializing';
    this.webrtcService = webrtcService;

    // Initialize services
    this.deepgramService = new DeepgramService();
    this.cartesiaService = new CartesiaService();

    logger.info('Voice service created with necessary services initialized');
    
    // Register event handlers for WebRTC events
    this.setupWebRTCListeners();
    
    this.initialize();
  }

  /**
   * Setup listeners for WebRTC events
   */
  private setupWebRTCListeners(): void {
    // Handle new connections
    this.webrtcService.on('connection:new', (connectionId: string) => {
      logger.info(`New WebRTC connection initiated: ${connectionId}`);
    });
    
    // Handle established connections
    this.webrtcService.on('connection:ready', (connectionId: string) => {
      logger.info(`WebRTC connection ready for ${connectionId}, creating voice session`);
      this.createSession(connectionId);
      
      // Send a confirmation message to the client
      this.webrtcService.sendMessage(connectionId, { 
        type: 'voice-session-ready',
        message: 'Voice session is ready to accept commands'
      });
    });
    
    // Handle closed connections
    this.webrtcService.on('connection:closed', (connectionId: string) => {
      logger.info(`WebRTC connection closed for ${connectionId}, cleaning up voice session`);
      this.deleteSession(connectionId);
    });
    
    // Handle incoming audio producer
    this.webrtcService.on('stream', (connectionId: string, producer: mediasoup.types.Producer) => {
      const session = this.sessions.get(connectionId);
      if (!session) {
        logger.warn(`Received producer for nonexistent session: ${connectionId}`);
        this.createSession(connectionId);
      }
      
      const updatedSession = this.sessions.get(connectionId)!;
      updatedSession.producer = producer;
      
      logger.info(`Received audio producer for ${connectionId}:`, {
        id: producer.id,
        kind: producer.kind,
        type: producer.type,
        rtpParameters: producer.rtpParameters
      });
      
      if (updatedSession.isListening) {
        logger.info(`Session already listening, initiating audio processing for ${connectionId}`);
        this.handleAudioProducer(connectionId, producer);
      } else {
        logger.info(`Producer stored but waiting for start-listening command for ${connectionId}`);
      }
    });
    
    // Handle client messages
    this.webrtcService.on('message', (connectionId: string, message: any) => {
      logger.debug(`WebRTC message received from ${connectionId}: ${message.type}`);
      this.handleClientMessage(connectionId, message);
    });
    
    // Handle errors
    this.webrtcService.on('error', (connectionId: string, code: string, message: string) => {
      logger.error(`WebRTC error for ${connectionId}: ${code} - ${message}`);
      
      // If there's a voice session, we should stop listening
      const session = this.sessions.get(connectionId);
      if (session && session.isListening) {
        logger.info(`Stopping listening due to WebRTC error for ${connectionId}`);
        this.stopListening(connectionId);
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
   * Handle client messages related to voice service
   */
  private handleClientMessage(connectionId: string, message: any): void {
    logger.info(`Processing client message type: ${message.type} from ${connectionId}`);
    
    // Check if we have a session first
    if (!this.sessions.has(connectionId)) {
      logger.warn(`Received ${message.type} for non-existent session ${connectionId}, creating new session`);
      this.createSession(connectionId);
    }
    
    const session = this.sessions.get(connectionId);
    if (!session) return;
    
    switch (message.type) {
      case 'start-listening':
        logger.info(`Start-listening request received with command ID: ${message.commandId || 'none'}`);
        
        // Store the command ID for response tracking
        const commandId = message.commandId || Date.now().toString(36);
        
        // Check if already listening
        if (session.isListening) {
          logger.warn(`Session ${connectionId} is already listening, resetting state`);
          this.stopListening(connectionId);
        }
        
        // Start listening
        const started = this.startListening(connectionId);
        
        this.webrtcService.sendMessage(connectionId, { 
          type: 'listening-started',
          commandId: commandId,
          error: started ? undefined : 'Failed to start listening'
        });
        break;
        
      case 'stop-listening':
        this.stopListening(connectionId);
        break;
        
      default:
        logger.debug(`Unhandled message type: ${message.type} from ${connectionId}`);
        break;
    }
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

    if (!this.webrtcService.isConnected(connectionId)) {
      logger.warn(`Cannot start listening: WebRTC not connected for ${connectionId}`);
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

    this.webrtcService.sendMessage(connectionId, { type: 'listening-stopped' });
  }
}
