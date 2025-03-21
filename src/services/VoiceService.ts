import { EventEmitter } from 'events';
import { DeepgramService } from './DeepgramService';
import { GeminiService } from './GeminiService';
import { CartesiaService } from './CartesiaService';
import { createLogger } from '../utils/logger';

const logger = createLogger('VoiceService');

// Interface for WebRTC connection
interface RTCConnection {
  ws: any; // WebSocket connection
  state: 'new' | 'connecting' | 'connected' | 'failed' | 'closed';
  isListening: boolean;
  lastActivity: number;
  audioBuffer?: Buffer[]; // Buffer to collect audio chunks
  totalAudioReceived: number; // Track total bytes received
  messagesReceived: number; // Track number of messages received
  messagesSent: number; // Track number of messages sent
}

export class VoiceService extends EventEmitter {
  private connections: Map<string, RTCConnection>;
  private status: 'initializing' | 'running' | 'error';
  private iceServers: Array<{ urls: string }>;
  private deepgramService: DeepgramService;
  private geminiService: GeminiService;
  private cartesiaService: CartesiaService;

  constructor() {
    super();
    this.connections = new Map();
    this.status = 'initializing';
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      // Add more STUN/TURN servers as needed
    ];

    // Initialize services
    this.deepgramService = new DeepgramService();
    this.geminiService = new GeminiService();
    this.cartesiaService = new CartesiaService();

    logger.info('Voice service created with STUN/TURN servers and dependent services initialized');
    
    // Initialize the service
    this.initialize();
  }

  /**
   * Initialize the voice service
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing voice service...');
      // Service initialization logic here
      
      // Set status to running when initialization is complete
      this.status = 'running';
      logger.info('🎤 Voice service initialized and ready to accept connections');
    } catch (error) {
      this.status = 'error';
      logger.error('🔴 Voice service initialization failed:', error);
    }
  }

  /**
   * Get the current status of the voice service
   */
  public getStatus(): string {
    logger.debug(`Returning voice service status: ${this.status}`);
    return this.status;
  }

  /**
   * Get the WebRTC configuration for clients
   */
  public getRTCConfig(): { iceServers: Array<{ urls: string }> } {
    logger.debug('Returning RTC configuration with ICE servers');
    return {
      iceServers: this.iceServers
    };
  }

  /**
   * Handle a new WebSocket connection
   */
  public handleNewConnection(connectionId: string, ws: any): void {
    logger.info(`🔌 New WebSocket connection received: ${connectionId}`);
    
    // Create a new connection object
    const connection: RTCConnection = {
      ws,
      state: 'new',
      isListening: false,
      lastActivity: Date.now(),
      audioBuffer: [],
      totalAudioReceived: 0,
      messagesReceived: 0,
      messagesSent: 0
    };

    // Store the connection
    this.connections.set(connectionId, connection);
    logger.debug(`Connection object created and stored for ${connectionId}`);

    // Set up WebSocket message handler
    ws.on('message', (message: any) => {
      connection.messagesReceived++;
      
      // Check if message is a string (signaling) or binary (audio data)
      if (typeof message === 'string' || message instanceof String) {
        logger.debug(`Received text message #${connection.messagesReceived} from connection ${connectionId}`);
        this.handleWebSocketMessage(connectionId, message.toString());
      } else {
        // Handle binary audio data
        logger.debug(`Received binary data #${connection.messagesReceived} from connection ${connectionId}, size: ${message.length} bytes`);
        this.handleAudioData(connectionId, message);
      }
    });

    // Set up WebSocket close handler
    ws.on('close', (code: number, reason: string) => {
      logger.info(`WebSocket close event received for ${connectionId}: Code ${code}, Reason: ${reason || 'No reason provided'}`);
      this.handleConnectionClosed(connectionId);
    });

    // Set up WebSocket error handler
    ws.on('error', (error: Error) => {
      logger.error(`🔴 WebSocket error for connection ${connectionId}:`, error);
      this.sendError(connectionId, 'CONNECTION_FAILED', 'WebSocket connection error');
    });

    logger.info(`🟢 Voice connection fully established: ${connectionId}`);
    
    // Log connection stats periodically
    const statsInterval = setInterval(() => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        logger.info(`Connection stats for ${connectionId}: State=${conn.state}, Audio=${conn.totalAudioReceived} bytes, Messages Received=${conn.messagesReceived}, Messages Sent=${conn.messagesSent}`);
      } else {
        clearInterval(statsInterval);
      }
    }, 30000); // Log every 30 seconds
    
    // Store the interval reference in a variable for cleanup
    (connection as any).statsInterval = statsInterval;
  }
  
  /**
   * Handle incoming audio data from WebRTC
   */
  private handleAudioData(connectionId: string, audioChunk: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isListening) {
      logger.debug(`Ignoring audio chunk from connection ${connectionId}: connection not found or not listening`);
      return;
    }
    
    // Store the audio chunk in the connection's buffer
    connection.audioBuffer?.push(audioChunk);
    
    // Update stats
    connection.totalAudioReceived += audioChunk.length;
    connection.lastActivity = Date.now();
    
    logger.debug(`Received audio chunk from connection ${connectionId}, size: ${audioChunk.length} bytes, total received: ${connection.totalAudioReceived} bytes`);
  }

  /**
   * Handle a message from a WebSocket connection
   */
  private handleWebSocketMessage(connectionId: string, message: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Received message for unknown connection: ${connectionId}`);
      return;
    }

    // Update last activity time
    connection.lastActivity = Date.now();

    try {
      const data = JSON.parse(message);
      logger.info(`📥 Received ${data.type} message from connection ${connectionId}`);
      
      switch (data.type) {
        case 'offer':
          this.handleRTCOffer(connectionId, data);
          break;
          
        case 'ice-candidate':
          this.handleICECandidate(connectionId, data);
          break;
          
        case 'start-listening':
          this.startListening(connectionId);
          break;
          
        case 'stop-listening':
          this.stopListening(connectionId);
          break;
          
        default:
          logger.warn(`Unknown message type: ${data.type} from connection ${connectionId}`);
      }
    } catch (error) {
      logger.error(`Error processing message from connection ${connectionId}:`, error);
      this.sendError(connectionId, 'INTERNAL_ERROR', 'Error processing message');
    }
  }

  /**
   * Handle WebRTC offer from client
   */
  private handleRTCOffer(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Received RTC offer for unknown connection: ${connectionId}`);
      return;
    }

    logger.info(`Processing WebRTC offer from connection ${connectionId}`);
    
    // In a real implementation, we would:
    // 1. Create an RTCPeerConnection
    // 2. Set the remote description from data.sdp
    // 3. Create an answer
    // 4. Set the local description
    // 5. Send the answer back to the client

    // For this mock implementation, we'll just simulate the process
    connection.state = 'connecting';
    logger.debug(`Changed connection state to 'connecting' for ${connectionId}`);
    
    // Simulate creating and sending an RTC answer
    setTimeout(() => {
      const answerMessage = {
        type: 'answer',
        sdp: {
          // Mock SDP data that would normally come from RTCPeerConnection.createAnswer()
          type: 'answer',
          sdp: 'v=0\r\no=- 123456789 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE audio\r\n...'
        }
      };
      
      logger.info(`Sending WebRTC answer to connection ${connectionId}`);
      this.sendMessage(connectionId, answerMessage);
      connection.state = 'connected';
      logger.debug(`Changed connection state to 'connected' for ${connectionId}`);
    }, 500);
  }

  /**
   * Handle ICE candidate from client
   */
  private handleICECandidate(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Received ICE candidate for unknown connection: ${connectionId}`);
      return;
    }

    // In a real implementation, we would add the ICE candidate to the RTCPeerConnection
    // For the mock implementation, we'll just log that we received it
    logger.info(`Received ICE candidate from connection ${connectionId}`);
    
    // Simulate sending our own ICE candidate
    setTimeout(() => {
      const iceMessage = {
        type: 'ice-candidate',
        candidate: {
          // Mock ICE candidate data
          candidate: 'candidate:123456789 1 udp 2122260223 192.168.1.1 56789 typ host generation 0',
          sdpMLineIndex: 0,
          sdpMid: 'audio'
        }
      };
      
      logger.info(`Sending ICE candidate to connection ${connectionId}`);
      this.sendMessage(connectionId, iceMessage);
    }, 200);
  }

  /**
   * Start listening to the client's audio stream
   */
  private startListening(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Received start-listening for unknown connection: ${connectionId}`);
      return;
    }

    // Reset audio buffer
    connection.audioBuffer = [];
    connection.isListening = true;
    logger.info(`🎙️ Started listening to connection ${connectionId}`);
    this.sendMessage(connectionId, { type: 'listening-started' });
  }

  /**
   * Stop listening to the client's audio stream and process the collected audio
   */
  private async stopListening(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Received stop-listening for unknown connection: ${connectionId}`);
      return;
    }

    connection.isListening = false;
    logger.info(`🛑 Stopped listening to connection ${connectionId}`);
    this.sendMessage(connectionId, { type: 'listening-stopped' });
    
    // Process the collected audio
    if (connection.audioBuffer && connection.audioBuffer.length > 0) {
      try {
        // Combine audio chunks into a single buffer
        const audioData = Buffer.concat(connection.audioBuffer);
        
        if (audioData.length === 0) {
          logger.warn(`No audio data received from connection ${connectionId}`);
          this.sendError(connectionId, 'MEDIA_ERROR', 'No audio data received');
          return;
        }
        
        logger.info(`📊 Processing ${audioData.length} bytes of audio data from connection ${connectionId}`);
        
        // Start the processing pipeline
        await this.processAudio(connectionId, audioData);
        
        // Clear the buffer after processing
        connection.audioBuffer = [];
        logger.debug(`Audio buffer cleared for connection ${connectionId}`);
      } catch (error) {
        logger.error(`🔴 Error processing audio from connection ${connectionId}:`, error);
        this.sendError(
          connectionId, 
          'MEDIA_ERROR', 
          `Failed to process audio: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      logger.warn(`No audio data collected from connection ${connectionId}`);
      this.sendError(connectionId, 'MEDIA_ERROR', 'No audio data received');
    }
  }
  
  /**
   * Process audio data through STT -> LLM -> TTS pipeline
   */
  private async processAudio(connectionId: string, audioData: Buffer): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Cannot process audio for unknown connection: ${connectionId}`);
      return;
    }
    
    try {
      logger.info(`🔄 Starting audio processing pipeline for connection ${connectionId}`);
      
      // Step 1: Speech-to-text with Deepgram
      logger.info(`🎤→📝 Calling Deepgram STT service for connection ${connectionId}`);
      const startStt = Date.now();
      const transcribedText = await this.deepgramService.transcribeAudio(audioData);
      const sttDuration = Date.now() - startStt;
      
      if (!transcribedText) {
        logger.warn(`Empty transcription result for connection ${connectionId}`);
        this.sendError(connectionId, 'MEDIA_ERROR', 'Failed to transcribe audio (empty result)');
        return;
      }
      
      logger.info(`✅ STT completed in ${sttDuration}ms for connection ${connectionId}, transcribed: "${transcribedText.substring(0, 100)}${transcribedText.length > 100 ? '...' : ''}"`);
      
      // Step 2: Process with Gemini LLM
      logger.info(`📝→💭 Calling Gemini LLM service for connection ${connectionId}`);
      const startLlm = Date.now();
      const llmResponse = await this.geminiService.processText(transcribedText);
      const llmDuration = Date.now() - startLlm;
      
      logger.info(`✅ LLM processing completed in ${llmDuration}ms for connection ${connectionId}, response: "${llmResponse.substring(0, 100)}${llmResponse.length > 100 ? '...' : ''}"`);
      
      // Step 3: Text-to-speech with Cartesia
      logger.info(`💭→🔊 Starting TTS process for connection ${connectionId}`);
      this.sendMessage(connectionId, { type: 'speaking-start' });
      
      const startTts = Date.now();
      const audioResponse = await this.cartesiaService.textToSpeech(llmResponse);
      const ttsDuration = Date.now() - startTts;
      
      logger.info(`✅ TTS completed in ${ttsDuration}ms for connection ${connectionId}, generated ${audioResponse.length} bytes`);
      
      // Step 4: Send audio back to client
      // In a real implementation with WebRTC, this would be sent through the audio track
      // For our mock implementation, we'll simulate sending the audio
      logger.info(`🔊→📱 Sending ${audioResponse.length} bytes of audio back to connection ${connectionId}`);
      
      // Since we're not actually sending audio over WebRTC in this implementation,
      // we'll simulate a delay based on audio length
      const audioDurationMs = Math.min(audioResponse.length / 16, 5000); // Rough estimate
      
      const totalProcessingTime = sttDuration + llmDuration + ttsDuration;
      logger.info(`📊 Total processing time: ${totalProcessingTime}ms for connection ${connectionId}`);
      
      setTimeout(() => {
        // Send speaking-end notification when "playback" is complete
        logger.info(`✅ Audio playback completed for connection ${connectionId}`);
        this.sendMessage(connectionId, { type: 'speaking-end' });
      }, audioDurationMs);
      
    } catch (error) {
      logger.error(`🔴 Error in audio processing pipeline for connection ${connectionId}:`, error);
      this.sendError(
        connectionId, 
        'INTERNAL_ERROR', 
        `Audio processing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle connection closed
   */
  private handleConnectionClosed(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Close event for unknown connection: ${connectionId}`);
      return;
    }
    
    // Clear any intervals
    if ((connection as any).statsInterval) {
      clearInterval((connection as any).statsInterval);
    }
    
    logger.info(`🔌 Voice connection closed: ${connectionId}`);
    logger.info(`📊 Final connection stats for ${connectionId}: Lifetime=${Math.round((Date.now() - connection.lastActivity)/1000)}s, Audio=${connection.totalAudioReceived} bytes, Messages Received=${connection.messagesReceived}, Messages Sent=${connection.messagesSent}`);
    
    this.connections.delete(connectionId);
  }

  /**
   * Send a message to a connection
   */
  private sendMessage(connectionId: string, message: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state === 'closed') {
      logger.warn(`Cannot send message to closed/missing connection: ${connectionId}`);
      return;
    }

    try {
      connection.ws.send(JSON.stringify(message));
      connection.messagesSent++;
      logger.debug(`📤 Sent message #${connection.messagesSent} to connection ${connectionId}: ${message.type}`);
    } catch (error) {
      logger.error(`🔴 Error sending message to connection ${connectionId}:`, error);
    }
  }

  /**
   * Send an error message to a connection
   */
  private sendError(connectionId: string, code: string, message: string): void {
    logger.warn(`⚠️ Sending error to connection ${connectionId}: [${code}] ${message}`);
    this.sendMessage(connectionId, {
      type: 'error',
      error: {
        code,
        message
      }
    });
  }
}