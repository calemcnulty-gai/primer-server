import { EventEmitter } from 'events';
import SimplePeer from 'simple-peer';
import * as wav from 'node-wav';
import { DeepgramService } from './DeepgramService';
import { GeminiService } from './GeminiService';
import { CartesiaService } from './CartesiaService';
import { createLogger } from '../utils/logger';

const logger = createLogger('VoiceService');

// Interface for WebRTC connection
interface RTCConnection {
  ws: any; // WebSocket connection
  peer?: any; // Simple-peer instance
  state: 'new' | 'connecting' | 'connected' | 'failed' | 'closed';
  isListening: boolean;
  lastActivity: number;
  audioBuffer: Buffer[]; // Buffer to collect audio chunks
  totalAudioReceived: number; // Track total bytes received
  messagesReceived: number; // Track number of messages received
  messagesSent: number; // Track number of messages sent
  statsInterval?: NodeJS.Timeout; // Interval for logging connection stats
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
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
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
    
    // Create a new connection object with initial state
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
      
      // Update last activity time
      connection.lastActivity = Date.now();
      
      // First try to detect if the binary data is actually JSON
      if (message instanceof Buffer) {
        try {
          // Check for JSON structure in the binary data
          const textMessage = message.toString('utf8');
          
          // Check if it looks like JSON (starts with { and ends with })
          if (textMessage.startsWith('{') && textMessage.includes('"type"')) {
            // Try parsing as JSON
            const parsedMessage = JSON.parse(textMessage);
            logger.info(`📥 Successfully parsed binary data as JSON. Type: ${parsedMessage.type} from connection ${connectionId}`);
            
            // Handle the message
            this.handleWebSocketMessage(connectionId, textMessage);
            return;
          }
        } catch (e) {
          // Not valid JSON, continue to audio processing
          logger.debug(`Failed to parse binary as JSON: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        // Handle as binary audio data if we're listening
        if (connection.isListening) {
          logger.debug(`Handling as binary data #${connection.messagesReceived} from connection ${connectionId}, size: ${message.length} bytes`);
          this.handleAudioData(connectionId, message);
        } else {
          logger.debug(`Received binary data but not listening yet (${message.length} bytes) from ${connectionId}`);
        }
      } else if (typeof message === 'string' || message instanceof String) {
        // Handle string message
        logger.debug(`Received text message #${connection.messagesReceived} from connection ${connectionId}`);
        this.handleWebSocketMessage(connectionId, message.toString());
      } else {
        // Unknown message type
        logger.warn(`Received unknown message type from ${connectionId}: ${typeof message}`);
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

    logger.info(`🟢 Voice connection established for: ${connectionId}`);
    
    // Send a message to confirm the connection is ready
    this.sendMessage(connectionId, { type: 'connection-ready' });
    
    // Log connection stats periodically
    const statsInterval = setInterval(() => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        logger.info(`Connection stats for ${connectionId}: State=${conn.state}, Audio=${conn.totalAudioReceived} bytes, Messages Received=${conn.messagesReceived}, Messages Sent=${conn.messagesSent}`);
      } else {
        clearInterval(statsInterval);
      }
    }, 30000); // Log every 30 seconds
    
    // Store the interval reference for cleanup
    connection.statsInterval = statsInterval;
  }
  
  /**
   * Handle a message from a WebSocket connection
   */
  private handleWebSocketMessage(connectionId: string, message: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Received message for unknown connection: ${connectionId}`);
      try {
        this.sendError(connectionId, 'CONNECTION_NOT_FOUND', 'Connection needs to be re-established');
      } catch (e) {
        logger.error(`Failed to send error for unknown connection ${connectionId}:`, e);
      }
      return;
    }

    try {
      const data = JSON.parse(message);
      logger.info(`📥 Received ${data.type} message from connection ${connectionId}`);
      
      // Log raw message content for debugging
      logger.debug(`Message content: ${JSON.stringify(data).substring(0, 200)}${JSON.stringify(data).length > 200 ? '...' : ''}`);
      
      switch (data.type) {
        case 'offer':
          logger.info(`Processing offer from ${connectionId} (connection state: ${connection.state})`);
          this.handleRTCOffer(connectionId, data);
          break;
          
        case 'ice-candidate':
          logger.info(`Processing ICE candidate from ${connectionId} (connection state: ${connection.state})`);
          this.handleICECandidate(connectionId, data);
          break;
          
        case 'start-listening':
          logger.info(`Processing start-listening from ${connectionId} (connection state: ${connection.state}, currently listening: ${connection.isListening})`);
          this.startListening(connectionId);
          break;
          
        case 'stop-listening':
          logger.info(`Processing stop-listening from ${connectionId} (connection state: ${connection.state}, currently listening: ${connection.isListening})`);
          this.stopListening(connectionId);
          break;
          
        case 'heartbeat':
          // Handle heartbeat messages to keep the connection alive
          logger.debug(`Received heartbeat from ${connectionId}`);
          this.sendMessage(connectionId, { type: 'heartbeat-ack' });
          break;
          
        case 'ping':
          // Handle ping messages from client (alternative heartbeat mechanism)
          logger.debug(`Received ping from ${connectionId}`);
          this.sendMessage(connectionId, { type: 'pong' });
          break;
          
        default:
          logger.warn(`Unknown message type: ${data.type} from connection ${connectionId}`);
      }
    } catch (error) {
      logger.error(`Error processing message from connection ${connectionId}:`, error);
      logger.error(`Raw message content: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
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
    
    try {
      // Update connection state
      connection.state = 'connecting';
      logger.debug(`Changed connection state to 'connecting' for ${connectionId}`);
      
      // Create a new peer connection
      logger.info(`Creating new peer connection for ${connectionId}`);
      const peer = new SimplePeer({
        initiator: false,
        trickle: true,
        config: {
          iceServers: this.iceServers
        },
        wrtc: require('wrtc') // Explicitly provide the wrtc implementation
      });
      
      // Store the peer instance
      connection.peer = peer;
      
      // Set up event handlers for the peer
      peer.on('signal', (signalData: any) => {
        // Send any signaling data back to the client
        logger.info(`WebRTC signaling data generated for ${connectionId}, type: ${signalData.type || 'candidate'}`);
        this.sendMessage(connectionId, signalData);
      });
      
      peer.on('connect', () => {
        logger.info(`WebRTC peer connection established for ${connectionId}`);
        connection.state = 'connected';
        
        // Auto-start listening
        this.startListening(connectionId);
      });
      
      peer.on('data', (chunk: Buffer) => {
        // Handle audio data received through the data channel
        this.handleAudioData(connectionId, chunk);
      });
      
      peer.on('stream', (stream: MediaStream) => {
        logger.info(`Received media stream from ${connectionId}`);
        // We would handle the stream here if needed
      });
      
      peer.on('error', (err: Error) => {
        logger.error(`WebRTC peer error for ${connectionId}:`, err);
        this.sendError(connectionId, 'WEBRTC_ERROR', err.message);
      });
      
      peer.on('close', () => {
        logger.info(`WebRTC peer connection closed for ${connectionId}`);
        if (connection.state !== 'closed') {
          connection.state = 'closed';
          // We don't automatically close the WebSocket when the peer connection is closed
        }
      });
      
      // Signal the peer with the offer from the client
      peer.signal(data);
      
      logger.info(`WebRTC offer processed for ${connectionId}`);
    } catch (error) {
      logger.error(`Failed to process offer from ${connectionId}:`, error);
      this.sendError(connectionId, 'OFFER_PROCESSING_FAILED', 'Could not process WebRTC offer');
      connection.state = 'failed';
    }
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

    logger.info(`Received ICE candidate from connection ${connectionId}`);
    
    if (!connection.peer) {
      logger.warn(`Received ICE candidate but no peer connection exists for ${connectionId}`);
      return;
    }
    
    try {
      // Signal the ICE candidate to the peer
      connection.peer.signal(data);
      logger.debug(`ICE candidate signaled to peer for ${connectionId}`);
    } catch (error) {
      logger.error(`Failed to process ICE candidate from ${connectionId}:`, error);
    }
  }

  /**
   * Handle audio data from client
   */
  private handleAudioData(connectionId: string, audioChunk: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.debug(`Ignoring audio chunk from connection ${connectionId}: connection not found`);
      return;
    }
    
    // Update last activity time
    connection.lastActivity = Date.now();
    
    // Only process if we're listening
    if (!connection.isListening) {
      logger.debug(`Skipping audio chunk from ${connectionId} - not listening yet`);
      return;
    }
    
    // Skip very small packets (likely heartbeats)
    if (audioChunk.length < 50) {
      logger.debug(`Skipping small packet (${audioChunk.length} bytes) from ${connectionId} - likely a heartbeat`);
      return;
    }
    
    // Store the audio chunk
    connection.audioBuffer.push(audioChunk);
    
    // Update stats
    connection.totalAudioReceived += audioChunk.length;
    
    logger.debug(`Received audio chunk from connection ${connectionId}, size: ${audioChunk.length} bytes, total received: ${connection.totalAudioReceived} bytes`);
    
    // Special logging for first audio chunk
    if (connection.totalAudioReceived === audioChunk.length) {
      logger.info(`🎉 Received first audio chunk from connection ${connectionId}, size: ${audioChunk.length} bytes`);
    }
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

    logger.info(`Processing start-listening request for connection ${connectionId} (current state: ${connection.state}, currently listening: ${connection.isListening})`);

    // Only proceed if we're not already listening
    if (connection.isListening) {
      logger.debug(`Already listening for connection ${connectionId}`);
      this.sendMessage(connectionId, { type: 'listening-started' });
      return;
    }

    // Reset audio buffer
    connection.audioBuffer = [];
    connection.isListening = true;
    
    logger.info(`🎙️ Started listening to connection ${connectionId}`);
    this.sendMessage(connectionId, { type: 'listening-started' });
    
    // Log connection state after updating
    logger.info(`Connection ${connectionId} now listening (state=${connection.state}, isListening=${connection.isListening})`);
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

    // Only proceed if we're currently listening
    if (!connection.isListening) {
      logger.debug(`Not currently listening for connection ${connectionId}`);
      this.sendMessage(connectionId, { type: 'listening-stopped' });
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
      logger.info(`🔊→📱 Sending ${audioResponse.length} bytes of audio back to connection ${connectionId}`);
      
      // Send the audio to the client
      await this.sendAudioToClient(connectionId, audioResponse);
      
      const totalProcessingTime = sttDuration + llmDuration + ttsDuration;
      logger.info(`📊 Total processing time: ${totalProcessingTime}ms for connection ${connectionId}`);
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
   * Send audio data back to the client
   */
  private async sendAudioToClient(connectionId: string, audioData: Buffer): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Cannot send audio to disconnected client: ${connectionId}`);
      return;
    }
    
    try {
      if (connection.peer && connection.peer.connected) {
        // If we have a connected WebRTC peer, send the audio through the data channel
        logger.info(`Sending audio via WebRTC data channel to ${connectionId}`);
        
        // Send audio in chunks if it's large to avoid buffer overflows
        const CHUNK_SIZE = 16000; // 16KB chunks
        
        for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
          const chunk = audioData.slice(i, i + CHUNK_SIZE);
          connection.peer.send(chunk);
        }
        
        logger.debug(`Audio data sent via WebRTC to ${connectionId}`);
      } else {
        // Fallback to WebSocket for audio
        logger.info(`Sending audio via WebSocket to ${connectionId}`);
        
        connection.ws.send(audioData, { binary: true }, (err: Error | null) => {
          if (err) {
            logger.error(`Failed to send audio data to ${connectionId}:`, err);
          } else {
            logger.debug(`Successfully sent ${audioData.length} bytes of audio to ${connectionId}`);
          }
        });
      }
      
      // Short delay to ensure audio processing finishes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send speaking-end notification when audio is sent
      logger.info(`✅ Audio sent to client ${connectionId}`);
      this.sendMessage(connectionId, { type: 'speaking-end' });
    } catch (error) {
      logger.error(`🔴 Failed to send audio to client ${connectionId}:`, error);
      this.sendError(connectionId, 'AUDIO_TRANSMISSION_FAILED', 'Failed to send audio response');
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
    
    // Close peer connection if it exists
    if (connection.peer) {
      try {
        connection.peer.destroy();
      } catch (err) {
        logger.error(`Error destroying peer for ${connectionId}:`, err);
      }
    }
    
    // Clear intervals
    if (connection.statsInterval) {
      clearInterval(connection.statsInterval);
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
