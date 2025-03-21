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
    
    // Create a new connection object with initial state set to 'connected'
    const connection: RTCConnection = {
      ws,
      state: 'connected', // Immediately set state to connected to avoid state transition issues
      isListening: true,  // Auto-start listening
      lastActivity: Date.now(),
      audioBuffer: [],
      totalAudioReceived: 0,
      messagesReceived: 0,
      messagesSent: 0
    };

    // Store the connection
    this.connections.set(connectionId, connection);
    logger.debug(`Connection object created and stored for ${connectionId} (auto-configured as connected and listening)`);

    // Set up WebSocket message handler
    ws.on('message', (message: any) => {
      connection.messagesReceived++;
      
      // Debug the raw message
      if (message instanceof Buffer) {
        logger.debug(`Raw binary message from ${connectionId}: first 10 bytes: ${message.slice(0, 10).toString('hex')}, length: ${message.length}`);
      }
      
      // First try to detect if the binary data is actually JSON
      if (message instanceof Buffer) {
        try {
          // Check for JSON structure in the binary data
          const textMessage = message.toString('utf8');
          
          // Log the first part of the message for debugging
          logger.debug(`Trying to parse as JSON: ${textMessage.substring(0, 50)}...`);
          
          // Check if it looks like JSON (starts with { and has a "type" field)
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
        
        // Handle as binary audio data
        logger.debug(`Handling as binary data #${connection.messagesReceived} from connection ${connectionId}, size: ${message.length} bytes`);
        this.handleAudioData(connectionId, message);
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

    logger.info(`🟢 Voice connection fully established and auto-configured: ${connectionId}`);
    
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
    
    // Store the interval reference in a variable for cleanup
    (connection as any).statsInterval = statsInterval;
  }
  
  /**
   * Handle audio data, with special detection for start-listening command
   */
  private handleAudioData(connectionId: string, audioChunk: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.debug(`Ignoring audio chunk from connection ${connectionId}: connection not found`);
      return;
    }
    
    // Special check: Try to detect "start-listening" command in binary data
    // This handles cases where the client combines control messages with audio data
    try {
      // Check first few bytes for potential text
      const prefix = audioChunk.slice(0, Math.min(150, audioChunk.length)).toString('utf8');
      if (prefix.includes('"type":"start-listening"')) {
        logger.info(`🔍 Detected start-listening command embedded in binary data from ${connectionId}`);
        // Force start listening
        if (!connection.isListening) {
          if (connection.state !== 'connected') {
            connection.state = 'connected';
          }
          this.startListening(connectionId);
        }
      }
    } catch (e) {
      // Not a text prefix, continue normal processing
    }
    
    // Update last activity time regardless of listening state
    connection.lastActivity = Date.now();
    
    // Handle small packets differently - they might be heartbeats
    const isSmallPacket = audioChunk.length < 50;
    
    // If connection exists but isn't listening, auto-start listening
    if (!connection.isListening) {
      if (isSmallPacket) {
        logger.debug(`Received small packet (${audioChunk.length} bytes) from ${connectionId}, might be a heartbeat`);
      } else {
        logger.info(`Received substantial audio data (${audioChunk.length} bytes) from non-listening connection ${connectionId}. Auto-starting listening.`);
        // Auto-repair connection state if needed
        if (connection.state !== 'connected') {
          logger.warn(`Auto-repairing connection state for ${connectionId} from ${connection.state} to 'connected'`);
          connection.state = 'connected';
        }
        // Force start listening since we're getting actual audio
        this.startListening(connectionId);
      }
      
      // Skip processing for now - the next audio chunk will be processed
      return;
    }
    
    // Don't process very small packets as audio
    if (isSmallPacket) {
      logger.debug(`Skipping small packet (${audioChunk.length} bytes) from ${connectionId} - likely a heartbeat`);
      return;
    }
    
    // Store the audio chunk in the connection's buffer
    connection.audioBuffer?.push(audioChunk);
    
    // Update stats
    connection.totalAudioReceived += audioChunk.length;
    
    logger.debug(`Received audio chunk from connection ${connectionId}, size: ${audioChunk.length} bytes, total received: ${connection.totalAudioReceived} bytes`);
    
    // If this is the first audio chunk after starting to listen, log it specially
    if (connection.totalAudioReceived === audioChunk.length) {
      logger.info(`🎉 Received first audio chunk from connection ${connectionId}, size: ${audioChunk.length} bytes`);
    }
  }

  /**
   * Handle a message from a WebSocket connection
   */
  private handleWebSocketMessage(connectionId: string, message: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn(`Received message for unknown connection: ${connectionId}`);
      // Try to recreate the connection if we receive messages for it
      try {
        this.sendError(connectionId, 'CONNECTION_NOT_FOUND', 'Connection needs to be re-established');
      } catch (e) {
        logger.error(`Failed to send error for unknown connection ${connectionId}:`, e);
      }
      return;
    }

    // Update last activity time
    connection.lastActivity = Date.now();

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
          logger.info(`⭐⭐⭐ RECEIVED START-LISTENING from ${connectionId} (connection state: ${connection.state}, currently listening: ${connection.isListening})`);
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
    
    // In a real implementation, we would:
    // 1. Create an RTCPeerConnection
    // 2. Set the remote description from data.sdp
    // 3. Create an answer
    // 4. Set the local description
    // 5. Send the answer back to the client

    // For this mock implementation, we'll just simulate the process
    connection.state = 'connecting';
    logger.debug(`Changed connection state to 'connecting' for ${connectionId}`);
    
    // Simulate creating and sending an RTC answer immediately (no timeout)
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
    
    // Automatically start listening for this connection to avoid missed audio chunks
    this.startListening(connectionId);
    logger.info(`Auto-started listening for connection ${connectionId} after successful offer`);
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
    
    // Simulate sending our own ICE candidate immediately (no timeout)
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
    
    // Make sure connection state is advanced if still in 'new' state
    if (connection.state === 'new') {
      connection.state = 'connecting';
      logger.info(`Updated connection ${connectionId} state to 'connecting' after ICE candidate`);
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

    // Auto-repair connection state if needed
    if (connection.state === 'new') {
      logger.warn(`Connection ${connectionId} is still in 'new' state when start-listening requested. Auto-repairing connection state.`);
      connection.state = 'connected';
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
