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
  processingTimeout?: NodeJS.Timeout; // Timeout for processing audio
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
          
          // If we receive audio but haven't started listening yet, start listening
          if (message.length > 1000) {  // Only for substantial audio data
            logger.info(`Received audio data before listening started. Starting listening for ${connectionId}`);
            this.startListening(connectionId);
            this.handleAudioData(connectionId, message);
          }
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
      logger.warn(`[${new Date().toISOString()}] Received message for unknown connection: ${connectionId}`);
      try {
        this.sendError(connectionId, 'CONNECTION_NOT_FOUND', 'Connection needs to be re-established');
      } catch (e) {
        logger.error(`[${new Date().toISOString()}] Failed to send error for unknown connection ${connectionId}:`, e);
      }
      return;
    }

    try {
      const msgTime = new Date().toISOString();
      const data = JSON.parse(message);
      logger.info(`[${msgTime}] 📥 Received ${data.type} message from connection ${connectionId}`);
      
      // Log raw message content for debugging
      logger.debug(`[${msgTime}] Message content: ${JSON.stringify(data).substring(0, 200)}${JSON.stringify(data).length > 200 ? '...' : ''}`);
      
      switch (data.type) {
        case 'offer':
          logger.info(`[${msgTime}] Processing offer from ${connectionId} (connection state: ${connection.state})`);
          this.handleRTCOffer(connectionId, data);
          break;
          
        case 'ice-candidate':
          logger.info(`[${msgTime}] Processing ICE candidate from ${connectionId} (connection state: ${connection.state})`);
          this.handleICECandidate(connectionId, data);
          break;
          
        case 'start-listening':
          logger.info(`[${msgTime}] Processing start-listening from ${connectionId} (connection state: ${connection.state}, currently listening: ${connection.isListening})`);
          this.startListening(connectionId);
          break;
          
        case 'stop-listening':
          logger.info(`[${msgTime}] Processing stop-listening from ${connectionId} (connection state: ${connection.state}, currently listening: ${connection.isListening})`);
          this.stopListening(connectionId);
          break;
          
        case 'heartbeat':
          // Handle heartbeat messages to keep the connection alive
          logger.debug(`[${msgTime}] Received heartbeat from ${connectionId}`);
          this.sendMessage(connectionId, { type: 'heartbeat-ack' });
          break;
          
        case 'ping':
          // Handle ping messages from client (alternative heartbeat mechanism)
          logger.debug(`[${msgTime}] Received ping from ${connectionId}`);
          this.sendMessage(connectionId, { type: 'pong' });
          break;
          
        default:
          logger.warn(`[${msgTime}] Unknown message type: ${data.type} from connection ${connectionId}`);
      }
    } catch (error) {
      const errorTime = new Date().toISOString();
      logger.error(`[${errorTime}] Error processing message from connection ${connectionId}:`, error);
      logger.error(`[${errorTime}] Raw message content: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
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
        sdpTransform: (sdp) => {
          // Ensure the SDP includes both sending and receiving capabilities
          // This addresses the issue where 'recvonly' might be preventing proper audio flow
          const modifiedSdp = sdp.replace('a=recvonly', 'a=sendrecv');
          logger.debug(`Modified SDP for ${connectionId} to ensure bidirectional audio.`);
          return modifiedSdp;
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
        logger.info(`Received ${chunk.length} bytes of data through WebRTC data channel from ${connectionId}`);
        this.handleAudioData(connectionId, chunk);
      });
      
      peer.on('stream', (stream: MediaStream) => {
        logger.info(`Received media stream from ${connectionId}`);
        
        // Process any audio tracks from the stream
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          logger.info(`Stream contains ${audioTracks.length} audio tracks from ${connectionId}`);
          
          // You could set up a MediaRecorder here to capture audio from the stream
          // This would be an alternative to the data channel approach
        } else {
          logger.warn(`Received stream but it contains no audio tracks from ${connectionId}`);
        }
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
    
    // Debug the audio data to see its format
    logger.info(`📊 AUDIO DATA RECEIVED: ${audioChunk.length} bytes, first few bytes: ${audioChunk.slice(0, 16).toString('hex')}`);
    
    // Store the audio chunk
    connection.audioBuffer.push(audioChunk);
    
    // Update stats
    connection.totalAudioReceived += audioChunk.length;
    
    logger.info(`Received audio chunk from connection ${connectionId}, size: ${audioChunk.length} bytes, total received: ${connection.totalAudioReceived} bytes`);
    
    // Special logging for first audio chunk
    if (connection.totalAudioReceived === audioChunk.length) {
      logger.info(`🎉 Received first audio chunk from connection ${connectionId}, size: ${audioChunk.length} bytes`);
      
      // If this is a binary audio chunk (not a text message), set the connection state to connected
      if (connection.state === 'connecting') {
        connection.state = 'connected';
        logger.info(`Updated connection state to 'connected' after receiving first audio chunk for ${connectionId}`);
      }
      
      // Set a timeout to force processing after a brief silence period
      setTimeout(() => {
        if (connection.isListening && connection.audioBuffer.length > 0) {
          logger.info(`Processing audio due to silence timeout for ${connectionId}`);
          this.stopListening(connectionId);
        }
      }, 1500); // Process after 1.5 seconds of silence
    }
    
    // Check if we've received enough audio to process
    const totalSize = connection.audioBuffer.reduce((sum, buffer) => sum + buffer.length, 0);
    logger.info(`📊 Current audio buffer size: ${totalSize} bytes from ${connection.audioBuffer.length} chunks for ${connectionId}`);
    
    // Process if we've received more than 8KB
    if (totalSize > 8000) {
      logger.info(`📊 Collected ${totalSize} bytes of audio data, stopping listening to process for ${connectionId}`);
      this.stopListening(connectionId);
    }
    
    // Also set a timeout to restart listening after processing is complete
    if (!connection.processingTimeout) {
      connection.processingTimeout = setTimeout(() => {
        // Clear the timeout reference
        connection.processingTimeout = undefined;
        
        if (connection.audioBuffer.length > 0) {
          logger.info(`Processing audio due to collection timeout for ${connectionId}`);
          this.stopListening(connectionId);
        }
      }, 3000); // Maximum of 3 seconds of collection
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
    
    // After a delay, force a test response if no audio was received
    setTimeout(() => {
      this.checkForAudioActivity(connectionId);
    }, 5000); // Wait 5 seconds
  }
  
  /**
   * Check if we've received any audio data, and if not, send a test response
   */
  private checkForAudioActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isListening) {
      return;
    }
    
    // If we haven't received any audio data yet, force a test response
    if (connection.totalAudioReceived === 0) {
      logger.info(`No audio received after listening started for ${connectionId}, sending test response`);
      
      // First stop listening to prevent conflicts
      connection.isListening = false;
      
      // Generate a test response 
      this.sendMessage(connectionId, { type: 'speaking-start' });
      
      // Use CartesiaService to generate a test response
      logger.info(`[TEST_AUDIO] Requesting test audio from CartesiaService for ${connectionId}`);
      this.cartesiaService.textToSpeech("Hello! I'm testing the voice connection. Can you hear me? Please say something.")
        .then(audioResponse => {
          logger.info(`[TEST_AUDIO] Generated test audio response of ${audioResponse.length} bytes, format: raw PCM`);
          
          // Debug first few bytes to check format
          logger.info(`[TEST_AUDIO] First 20 bytes: ${audioResponse.slice(0, 20).toString('hex')}`);
          
          return this.sendAudioToClient(connectionId, audioResponse);
        })
        .then(() => {
          logger.info(`[TEST_AUDIO] Successfully sent test audio to client ${connectionId}`);
          this.sendMessage(connectionId, { type: 'speaking-end' });
          
          // Resume listening
          connection.isListening = true;
          logger.info(`Resumed listening for ${connectionId} after test response`);
        })
        .catch(error => {
          logger.error(`[TEST_AUDIO] ERROR sending test audio to ${connectionId}:`, error);
          logger.error(`[TEST_AUDIO] Error type: ${typeof error}, message: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          // Log the stack trace if available
          if (error instanceof Error && error.stack) {
            logger.error(`[TEST_AUDIO] Stack trace: ${error.stack}`);
          }
          
          // Resume listening even if there was an error
          connection.isListening = true;
          logger.error(`[TEST_AUDIO] Resumed listening for ${connectionId} despite error`);
          
          // Notify the client that there was an issue
          this.sendError(connectionId, 'AUDIO_ERROR', 'Failed to generate test audio response');
        });
    }
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

    // Clear any processing timeouts
    if (connection.processingTimeout) {
      clearTimeout(connection.processingTimeout);
      connection.processingTimeout = undefined;
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
          
          // Start listening again to allow more audio collection
          this.startListening(connectionId);
          return;
        }
        
        logger.info(`📊 Processing ${audioData.length} bytes of audio data from connection ${connectionId}`);
        
        // Start the processing pipeline
        await this.processAudio(connectionId, audioData);
        
        // Clear the buffer after processing
        connection.audioBuffer = [];
        logger.debug(`Audio buffer cleared for connection ${connectionId}`);
        
        // Start listening again automatically after processing
        this.startListening(connectionId);
      } catch (error) {
        logger.error(`🔴 Error processing audio from connection ${connectionId}:`, error);
        this.sendError(
          connectionId, 
          'MEDIA_ERROR', 
          `Failed to process audio: ${error instanceof Error ? error.message : String(error)}`
        );
        
        // Start listening again to allow more audio collection despite the error
        this.startListening(connectionId);
      }
    } else {
      logger.warn(`No audio data collected from connection ${connectionId}`);
      this.sendError(connectionId, 'MEDIA_ERROR', 'No audio data received');
      
      // Start listening again to allow more audio collection
      this.startListening(connectionId);
    }
  }
  
  /**
   * Process audio data through STT -> TTS pipeline using streaming capabilities
   */
  private async processAudio(connectionId: string, audioData: Buffer): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Cannot process audio for unknown connection: ${connectionId}`);
      return;
    }
    
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    const startTime = new Date();
    
    try {
      logger.info(`[${requestId}] [${startTime.toISOString()}] 🔄 Starting streaming audio processing pipeline for connection ${connectionId}`);
      
      // Ensure we have audio data to process
      if (!audioData || audioData.length === 0) {
        logger.warn(`[${requestId}] Empty audio data for connection ${connectionId}`);
        this.sendError(connectionId, 'MEDIA_ERROR', 'No audio data to process');
        return;
      }
      
      // Log audio format information
      logger.info(`[${requestId}] 📊 PROCESSING AUDIO: ${audioData.length} bytes, first few bytes: ${audioData.slice(0, 16).toString('hex')}`);

      // Force using a test audio for debugging if real audio is not being received
      if (audioData.length < 1000) {
        logger.warn(`[${requestId}] Audio data may be too small (${audioData.length} bytes). Using test phrase.`);
        
        // Create a test response
        const testResponse = "This is a test response. I'm echoing back what I heard.";
        
        // Use streaming TTS for the test response
        logger.info(`[${requestId}] Using test response for connection ${connectionId}: "${testResponse}"`);
        this.sendMessage(connectionId, { type: 'speaking-start' });
        
        // Use streaming TTS from Cartesia
        await this.streamCartesiaResponse(connectionId, requestId, testResponse);
        return;
      }
      
      // Determine if we should use batch or streaming for this audio
      // For short audio clips (< 5 seconds), it's more efficient to use batch processing
      const isShortAudio = audioData.length < 100000; // Rough estimate for 5 seconds of audio
      
      if (isShortAudio) {
        // Use batch processing for shorter audio
        await this.processBatchAudio(connectionId, requestId, audioData);
      } else {
        // Use streaming for longer audio
        await this.processStreamingAudio(connectionId, requestId, audioData);
      }
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      logger.info(`[${requestId}] [${endTime.toISOString()}] ✅ Total audio processing completed in ${duration}ms for connection ${connectionId}`);
      
    } catch (error) {
      const errorTime = new Date();
      logger.error(`[${requestId}] [${errorTime.toISOString()}] 🔴 Error in audio processing pipeline for connection ${connectionId}:`, error);
      this.sendError(
        connectionId, 
        'INTERNAL_ERROR', 
        `Audio processing failed: ${error instanceof Error ? error.message : String(error)}`
      );
      
      // Try to provide some audio feedback even when the pipeline fails
      try {
        const errorResponse = "Sorry, I encountered a technical issue. Please try again in a moment.";
        this.sendMessage(connectionId, { type: 'speaking-start' });
        const audioResponse = await this.cartesiaService.textToSpeech(errorResponse);
        await this.sendAudioToClient(connectionId, audioResponse);
      } catch (feedbackError) {
        logger.error(`[${requestId}] [${new Date().toISOString()}] Failed to send error audio feedback for ${connectionId}`, feedbackError);
      }
    }
  }
  
  /**
   * Process audio using batch (non-streaming) method for shorter audio clips
   */
  private async processBatchAudio(connectionId: string, requestId: string, audioData: Buffer): Promise<void> {
    logger.info(`[${requestId}] Using batch processing for audio from connection ${connectionId}`);
    
    // Step 1: Speech-to-text with Deepgram
    logger.info(`[${requestId}] 🎤→📝 Calling Deepgram STT service (batch mode) for connection ${connectionId}`);
    const startStt = Date.now();
    
    try {
      const transcribedText = await this.deepgramService.transcribeAudio(audioData);
      const sttDuration = Date.now() - startStt;
      
      logger.info(`[${requestId}] ✅ STT result: "${transcribedText || 'EMPTY'}" for connection ${connectionId}`);
      
      if (!transcribedText || transcribedText.trim() === '') {
        logger.warn(`[${requestId}] Empty transcription result for connection ${connectionId}`);
        
        // Use a default response when transcription fails
        const defaultResponse = "I couldn't hear that clearly. Could you please speak again?";
        
        // Send the default response to TTS
        logger.info(`[${requestId}] Using default response for connection ${connectionId}: "${defaultResponse}"`);
        this.sendMessage(connectionId, { type: 'speaking-start' });
        
        const startTts = Date.now();
        const audioResponse = await this.cartesiaService.textToSpeech(defaultResponse);
        const ttsDuration = Date.now() - startTts;
        
        logger.info(`[${requestId}] ✅ TTS completed in ${ttsDuration}ms for connection ${connectionId}, generated ${audioResponse.length} bytes`);
        
        // Send audio to client
        await this.sendAudioToClient(connectionId, audioResponse);
        return;
      }
      
      logger.info(`[${requestId}] ✅ STT completed in ${sttDuration}ms for connection ${connectionId}, transcribed: "${transcribedText.substring(0, 100)}${transcribedText.length > 100 ? '...' : ''}"`);
      
      // Create echo response (skip LLM processing)
      logger.info(`[${requestId}] 📝→🔊 Creating echo response for connection ${connectionId}`);
      const echoResponse = `You said: ${transcribedText}`;
      
      // Step 2: Text-to-speech with Cartesia
      logger.info(`[${requestId}] 💭→🔊 Starting TTS process for connection ${connectionId}`);
      this.sendMessage(connectionId, { type: 'speaking-start' });
      
      const startTts = Date.now();
      
      try {
        const audioResponse = await this.cartesiaService.textToSpeech(echoResponse);
        const ttsDuration = Date.now() - startTts;
        
        if (!audioResponse || audioResponse.length === 0) {
          logger.warn(`[${requestId}] Empty TTS response for connection ${connectionId}`);
          this.sendError(connectionId, 'MEDIA_ERROR', 'Failed to generate speech from text');
          return;
        }
        
        logger.info(`[${requestId}] ✅ TTS completed in ${ttsDuration}ms for connection ${connectionId}, generated ${audioResponse.length} bytes`);
        
        // Step 3: Send audio back to client
        logger.info(`[${requestId}] 🔊→📱 Sending ${audioResponse.length} bytes of audio back to connection ${connectionId}`);
        
        // Send the audio to the client
        await this.sendAudioToClient(connectionId, audioResponse);
        
        const totalProcessingTime = sttDuration + ttsDuration;
        logger.info(`[${requestId}] 📊 Total batch processing time: ${totalProcessingTime}ms for connection ${connectionId}`);
      } catch (ttsError) {
        logger.error(`[${requestId}] TTS service error for ${connectionId}:`, ttsError);
        this.sendError(connectionId, 'TTS_ERROR', 'Text-to-speech service failed');
      }
    } catch (sttError) {
      logger.error(`[${requestId}] STT service error for ${connectionId}:`, sttError);
      this.sendError(connectionId, 'STT_ERROR', 'Speech-to-text service failed');
      
      // Try to return a fallback audio response
      const fallbackResponse = "I'm having trouble understanding you right now. Could you try again?";
      try {
        this.sendMessage(connectionId, { type: 'speaking-start' });
        const audioResponse = await this.cartesiaService.textToSpeech(fallbackResponse);
        await this.sendAudioToClient(connectionId, audioResponse);
      } catch (fallbackError) {
        logger.error(`[${requestId}] Failed to send fallback audio for ${connectionId}:`, fallbackError);
      }
    }
  }
  
  /**
   * Process audio using streaming method for longer audio clips
   */
  private async processStreamingAudio(connectionId: string, requestId: string, audioData: Buffer): Promise<void> {
    logger.info(`[${requestId}] Using streaming processing for audio from connection ${connectionId}`);
    
    // Create a promise that will resolve when we have the full transcript
    const transcriptionPromise = new Promise<string>((resolve, reject) => {
      let fullTranscript = '';
      let lastInterimResult = '';
      
      // Set a timeout to prevent hanging indefinitely
      const timeout = setTimeout(() => {
        // If we have any interim results, use them
        if (lastInterimResult) {
          resolve(lastInterimResult);
        } else {
          reject(new Error('Transcription timeout'));
        }
      }, 30000); // 30 second timeout
      
      // Create Deepgram stream with PCM audio settings matching client
      const deepgramStream = this.deepgramService.createStream({
        encoding: 'linear16',
        sampleRate: 16000, // 16kHz to match client settings
        channels: 1,       // Mono audio
        model: 'nova-2',
        language: 'en-US',
        smartFormat: true,
        interimResults: true
      });
      
      // Handle events from Deepgram
      this.deepgramService.on('transcription', (data) => {
        const { transcript, isFinal } = data;
        
        if (transcript) {
          // Store the last interim result in case we timeout
          lastInterimResult = transcript;
          
          if (isFinal) {
            // For final results, append to full transcript
            fullTranscript += (fullTranscript ? ' ' : '') + transcript;
            logger.info(`[${requestId}] Received final transcript part: "${transcript}"`);
            
            // Optionally, we could start TTS for this segment immediately
            // but for simplicity, we'll wait for the full transcript
          }
        }
      });
      
      this.deepgramService.on('streamClose', () => {
        clearTimeout(timeout);
        logger.info(`[${requestId}] Deepgram stream closed, final transcript: "${fullTranscript}"`);
        
        if (fullTranscript) {
          resolve(fullTranscript);
        } else if (lastInterimResult) {
          // If we have no final results but do have interim results, use those
          resolve(lastInterimResult);
        } else {
          reject(new Error('No transcription received'));
        }
      });
      
      this.deepgramService.on('streamError', (error) => {
        clearTimeout(timeout);
        logger.error(`[${requestId}] Deepgram stream error:`, error);
        reject(error);
      });
      
      // Send the audio to Deepgram
      this.deepgramService.sendAudioToStream(deepgramStream, audioData);
      
      // Close the stream after sending all audio
      // For real-time continuous streaming, you would keep this open
      this.deepgramService.closeStream(deepgramStream);
    });
    
    try {
      // Wait for the transcription to complete
      const transcribedText = await transcriptionPromise;
      
      if (!transcribedText || transcribedText.trim() === '') {
        logger.warn(`[${requestId}] Empty streaming transcription result for connection ${connectionId}`);
        
        // Use a default response when transcription fails
        const defaultResponse = "I couldn't hear that clearly. Could you please speak again?";
        
        // Stream the default response
        logger.info(`[${requestId}] Using default response for connection ${connectionId}: "${defaultResponse}"`);
        this.sendMessage(connectionId, { type: 'speaking-start' });
        
        // Use streaming TTS
        await this.streamCartesiaResponse(connectionId, requestId, defaultResponse);
        return;
      }
      
      logger.info(`[${requestId}] ✅ Streaming STT completed for connection ${connectionId}, transcribed: "${transcribedText.substring(0, 100)}${transcribedText.length > 100 ? '...' : ''}"`);
      
      // Create echo response (skip LLM processing)
      logger.info(`[${requestId}] 📝→🔊 Creating echo response for connection ${connectionId}`);
      const echoResponse = `You said: ${transcribedText}`;
      
      // Stream the response back using Cartesia
      logger.info(`[${requestId}] 💭→🔊 Starting streaming TTS process for connection ${connectionId}`);
      this.sendMessage(connectionId, { type: 'speaking-start' });
      
      // Use streaming TTS
      await this.streamCartesiaResponse(connectionId, requestId, echoResponse);
      
    } catch (error) {
      logger.error(`[${requestId}] Error in streaming audio processing for ${connectionId}:`, error);
      this.sendError(connectionId, 'STREAMING_ERROR', `Streaming failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Try to return a fallback audio response
      const fallbackResponse = "I'm having trouble processing your audio. Could you try again?";
      try {
        this.sendMessage(connectionId, { type: 'speaking-start' });
        const audioResponse = await this.cartesiaService.textToSpeech(fallbackResponse);
        await this.sendAudioToClient(connectionId, audioResponse);
      } catch (fallbackError) {
        logger.error(`[${requestId}] Failed to send fallback audio for ${connectionId}:`, fallbackError);
      }
    }
  }
  
  /**
   * Stream a text response using Cartesia's streaming TTS
   */
  private async streamCartesiaResponse(connectionId: string, requestId: string, text: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`[${requestId}] Cannot stream audio to disconnected client: ${connectionId}`);
      return;
    }
    
    return new Promise<void>((resolve, reject) => {
      try {
        logger.info(`[${requestId}] Starting Cartesia streaming TTS for: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
        
        // Track streaming state
        let chunkCount = 0;
        let totalBytesSent = 0;
        
        // Handle stream start
        this.cartesiaService.once('streamStart', () => {
          logger.info(`[${requestId}] Cartesia streaming TTS started for ${connectionId}`);
          // Notify client that audio streaming is beginning
          this.sendMessage(connectionId, { type: 'speaking-begin' });
        });
        
        // Handle audio chunks
        this.cartesiaService.on('audioChunk', async (data) => {
          const { audio, chunkIndex } = data;
          
          chunkCount++;
          totalBytesSent += audio.length;
          
          logger.debug(`[${requestId}] Received audio chunk #${chunkIndex} (${audio.length} bytes) from Cartesia for ${connectionId}`);
          
          try {
            // Send each chunk immediately as it arrives for smoother playback
            await this.sendAudioChunkToClient(connectionId, requestId, audio, chunkIndex);
          } catch (err) {
            logger.error(`[${requestId}] Error sending chunk #${chunkIndex} to client ${connectionId}:`, err);
            // Continue processing despite errors with individual chunks
          }
        });
        
        // Handle stream end
        this.cartesiaService.once('streamEnd', async (data) => {
          logger.info(`[${requestId}] Cartesia streaming TTS completed: ${chunkCount} chunks, ${totalBytesSent} bytes for ${connectionId}`);
          
          // Send end-of-stream marker to client
          this.sendMessage(connectionId, { type: 'speaking-end' });
          
          // Clean up event listeners
          this.cartesiaService.removeAllListeners('audioChunk');
          
          resolve();
        });
        
        // Handle stream errors
        this.cartesiaService.once('streamError', (error) => {
          logger.error(`[${requestId}] Cartesia streaming TTS error for ${connectionId}:`, error);
          
          // Clean up event listeners
          this.cartesiaService.removeAllListeners('audioChunk');
          
          reject(error);
        });
        
        // Start the streaming TTS with PCM format matching client expectations
        this.cartesiaService.streamTextToSpeech(text, {
          outputFormat: {
            container: 'raw',
            sampleRate: 16000,  // Match client-side expectation: 16kHz
            encoding: 'pcm_s16le' // 16-bit PCM, little-endian (Linear16)
          }
        }).catch(error => {
          logger.error(`[${requestId}] Error starting Cartesia streaming for ${connectionId}:`, error);
          reject(error);
        });
        
      } catch (error) {
        logger.error(`[${requestId}] Error setting up Cartesia streaming for ${connectionId}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Send a single audio chunk to the client
   * @param connectionId Client connection ID
   * @param requestId Request tracking ID
   * @param audioChunk Single audio chunk from Cartesia
   * @param chunkIndex Sequential index of this chunk
   */
  private async sendAudioChunkToClient(connectionId: string, requestId: string, audioChunk: Buffer, chunkIndex: number): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`[${requestId}] Cannot send chunk to disconnected client: ${connectionId}`);
      return;
    }
    
    try {
      // Skip sending very small chunks which may be heartbeats or control messages
      if (audioChunk.length < 10) {
        logger.debug(`[${requestId}] Skipping tiny chunk #${chunkIndex} (${audioChunk.length} bytes) - likely a control message`);
        return;
      }
      
      let success = false;
      
      // First try WebRTC for lower latency if it's available and connected
      if (connection.peer && connection.peer.connected) {
        try {
          connection.peer.send(audioChunk);
          success = true;
          
          if (chunkIndex === 1 || chunkIndex % 10 === 0) {
            logger.debug(`[${requestId}] Sent chunk #${chunkIndex} (${audioChunk.length} bytes) via WebRTC to ${connectionId}`);
          }
        } catch (webrtcError) {
          logger.error(`[${requestId}] Failed to send chunk #${chunkIndex} via WebRTC:`, webrtcError);
          // Fall back to WebSocket
        }
      }
      
      // Fall back to WebSocket if WebRTC didn't work or isn't available
      if (!success && connection.ws.readyState === 1) { // 1 = OPEN
        try {
          await new Promise<void>((resolve, reject) => {
            connection.ws.send(audioChunk, { binary: true }, (err: Error | null) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
          
          if (chunkIndex === 1 || chunkIndex % 10 === 0) {
            logger.debug(`[${requestId}] Sent chunk #${chunkIndex} (${audioChunk.length} bytes) via WebSocket to ${connectionId}`);
          }
          
          success = true;
        } catch (wsError) {
          logger.error(`[${requestId}] Failed to send chunk #${chunkIndex} via WebSocket:`, wsError);
          throw wsError;
        }
      }
      
      if (!success) {
        throw new Error(`All audio delivery methods unavailable for chunk #${chunkIndex}`);
      }
    } catch (error) {
      logger.error(`[${requestId}] Error sending audio chunk #${chunkIndex} to ${connectionId}:`, error);
      throw error;
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
      const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      const startTime = new Date();
      logger.info(`[${requestId}] [${startTime.toISOString()}] Attempting to send ${audioData.length} bytes of audio to ${connectionId}`);
      
      // Check if the audio buffer is empty or extremely small
      if (!audioData || audioData.length < 100) {
        logger.error(`[${requestId}] Audio data is too small or empty: ${audioData ? audioData.length : 0} bytes`);
        throw new Error('Audio data is too small or empty');
      }
      
      // Log audio format details (first bytes) to help debug format issues
      logger.info(`[${requestId}] Audio format details - first 20 bytes: ${audioData.slice(0, 20).toString('hex')}`);
      
      let success = false;
      
      // First try WebRTC for better performance if it's available and connected
      if (connection.peer && connection.peer.connected) {
        try {
          // If we have a connected WebRTC peer, send the audio through the data channel
          logger.info(`[${requestId}] [${new Date().toISOString()}] Sending audio via WebRTC data channel to ${connectionId}`);
          
          // Send audio in chunks if it's large to avoid buffer overflows
          const CHUNK_SIZE = 16000; // 16KB chunks
          let chunksSent = 0;
          
          for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
            const chunk = audioData.slice(i, i + CHUNK_SIZE);
            connection.peer.send(chunk);
            chunksSent++;
          }
          
          logger.info(`[${requestId}] [${new Date().toISOString()}] Audio data sent via WebRTC to ${connectionId} in ${chunksSent} chunks`);
          success = true;
        } catch (webrtcError) {
          logger.error(`[${requestId}] [${new Date().toISOString()}] Failed to send audio via WebRTC to ${connectionId}:`, webrtcError);
          // Fall back to WebSocket if WebRTC fails
          logger.info(`[${requestId}] [${new Date().toISOString()}] Falling back to WebSocket for audio delivery to ${connectionId}`);
        }
      }
      
      // Fall back to WebSocket if WebRTC didn't work or isn't available
      if (!success && connection.ws.readyState === 1) { // 1 = OPEN
        try {
          // Fallback to WebSocket for audio
          logger.info(`[${requestId}] [${new Date().toISOString()}] Sending audio via WebSocket to ${connectionId}`);
          
          // Send audio in chunks over websocket as well to avoid large packet issues
          const CHUNK_SIZE = 16000; // 16KB chunks
          let chunksSent = 0;
          
          for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
            const chunk = audioData.slice(i, i + CHUNK_SIZE);
            
            // Use a promise to handle the send operation
            await new Promise<void>((resolve, reject) => {
              connection.ws.send(chunk, { binary: true }, (err: Error | null) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            
            chunksSent++;
          }
          
          logger.info(`[${requestId}] [${new Date().toISOString()}] Successfully sent ${audioData.length} bytes of audio in ${chunksSent} chunks via WebSocket to ${connectionId}`);
          success = true;
        } catch (wsError) {
          logger.error(`[${requestId}] [${new Date().toISOString()}] Failed to send audio via WebSocket to ${connectionId}:`, wsError);
          throw new Error(`All audio delivery methods failed: ${wsError.message}`);
        }
      } else if (!success) {
        logger.error(`[${requestId}] [${new Date().toISOString()}] Cannot send audio to ${connectionId}: WebRTC unavailable and WebSocket not in OPEN state (state: ${connection.ws.readyState})`);
        throw new Error('All audio delivery methods unavailable');
      }
      
      // Short delay to ensure audio processing finishes on the client side
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send speaking-end notification when audio is sent
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      logger.info(`[${requestId}] [${endTime.toISOString()}] ✅ Audio sent to client ${connectionId} in ${duration}ms`);
      this.sendMessage(connectionId, { type: 'speaking-end' });
    } catch (error) {
      logger.error(`[${new Date().toISOString()}] 🔴 Failed to send audio to client ${connectionId}:`, error);
      logger.error(`[${new Date().toISOString()}] Error type: ${typeof error}, message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof Error && error.stack) {
        logger.error(`[${new Date().toISOString()}] Stack trace: ${error.stack}`);
      }
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
      logger.warn(`[${new Date().toISOString()}] Cannot send message to closed/missing connection: ${connectionId}`);
      return;
    }

    try {
      const msgTime = new Date().toISOString();
      connection.ws.send(JSON.stringify(message));
      connection.messagesSent++;
      logger.debug(`[${msgTime}] 📤 Sent message #${connection.messagesSent} to connection ${connectionId}: ${message.type}`);
    } catch (error) {
      logger.error(`[${new Date().toISOString()}] 🔴 Error sending message to connection ${connectionId}:`, error);
    }
  }

  /**
   * Send an error message to a connection
   */
  private sendError(connectionId: string, code: string, message: string): void {
    logger.warn(`[${new Date().toISOString()}] Sending error to ${connectionId}: ${code} - ${message}`);
    this.sendMessage(connectionId, {
      type: 'error',
      error: {
        code,
        message
      }
    });
  }
}
