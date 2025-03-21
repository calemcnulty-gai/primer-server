import { EventEmitter } from 'events';
import { DeepgramService } from './DeepgramService';
import { CartesiaService } from './CartesiaService';
import { WebRTCService, WebRTCMessage } from './WebRTCService';
import { createLogger } from '../utils/logger';

const logger = createLogger('VoiceService');

// Interface to track audio session state
interface AudioSession {
  connectionId: string;       // Associated connection ID
  isListening: boolean;       // Whether we're currently listening
  audioBuffer: Buffer[];      // Buffer to collect audio chunks
  totalAudioReceived: number; // Track total bytes received
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
      // Don't create session yet, wait for connection:ready
    });
    
    // Handle established connections
    this.webrtcService.on('connection:ready', (connectionId: string) => {
      logger.info(`WebRTC connection ready for ${connectionId}, creating voice session`);
      
      // Create voice session only when WebRTC is actually ready
      this.createSession(connectionId);
      
      // Verify connection state after a small delay to ensure stability
      setTimeout(() => {
        if (this.webrtcService.isConnected(connectionId)) {
          logger.info(`WebRTC connection verified as stable for ${connectionId}`);
          
          // Send a confirmation message to the client
          this.webrtcService.sendMessage(connectionId, { 
            type: 'voice-session-ready',
            message: 'Voice session is ready to accept commands'
          });
        } else {
          logger.warn(`WebRTC connection appears unstable for ${connectionId} despite ready event`);
        }
      }, 1000);
    });
    
    // Handle closed connections
    this.webrtcService.on('connection:closed', (connectionId: string) => {
      logger.info(`WebRTC connection closed for ${connectionId}, cleaning up voice session`);
      this.deleteSession(connectionId);
    });
    
    // Handle data (audio chunks)
    this.webrtcService.on('data', (connectionId: string, data: Buffer) => {
      this.handleAudioData(connectionId, data);
    });
    
    // Handle client messages
    this.webrtcService.on('message', (connectionId: string, message: WebRTCMessage) => {
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
        session.isListening = false;
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
      audioBuffer: [],
      totalAudioReceived: 0
    };
    
    this.sessions.set(connectionId, session);
    logger.info(`Created voice session for ${connectionId}`);
  }
  
  /**
   * Delete a voice session when connection is closed
   */
  private deleteSession(connectionId: string): void {
    this.sessions.delete(connectionId);
    logger.info(`Deleted voice session for ${connectionId}`);
  }

  /**
   * Handle client messages related to voice service
   */
  private handleClientMessage(connectionId: string, message: WebRTCMessage): void {
    logger.info(`Processing client message type: ${message.type} from ${connectionId}`);
    
    // Check if we have a session first
    if (!this.sessions.has(connectionId)) {
      logger.warn(`Received ${message.type} for non-existent session ${connectionId}, creating new session`);
      this.createSession(connectionId);
    }
    
    const session = this.sessions.get(connectionId);
    if (!session) return; // Should never happen since we just created it if needed
    
    switch (message.type) {
      case 'start-listening':
        // Debug logging for start-listening command
        logger.debug('Start-listening command details:', {
          commandId: message.commandId, 
          connectionId: message.connectionId || connectionId,
          clientDebugInfo: message.debug 
        });
        
        logger.info(`Start-listening request received with command ID: ${message.commandId || 'none'}`);
        
        // Store the command ID for response tracking
        const commandId = message.commandId || Date.now().toString(36);
        
        // Validate WebRTC state before starting
        const peerConnection = this.webrtcService.getPeerConnection(connectionId);
        if (!peerConnection || peerConnection.connectionState !== 'connected') {
          logger.error(`Cannot start listening - WebRTC not connected for ${connectionId}`);
          this.webrtcService.sendMessage(connectionId, { 
            type: 'listening-started',
            commandId: commandId,
            error: 'WebRTC connection not ready'
          });
          return;
        }
        
        // Check if already listening
        if (session.isListening) {
          logger.warn(`Session ${connectionId} is already listening, resetting state`);
          this.stopListening(connectionId);
        }
        
        // Start listening and get the result
        const started = this.startListening(connectionId);
        
        // Only send success if we actually started listening
        if (started) {
          logger.info(`Successfully started listening for ${connectionId}`);
          this.webrtcService.sendMessage(connectionId, { 
            type: 'listening-started',
            commandId: commandId
          });
        } else {
          logger.error(`Failed to start listening for ${connectionId}`);
          this.webrtcService.sendMessage(connectionId, { 
            type: 'listening-started',
            commandId: commandId,
            error: 'Failed to start listening'
          });
        }
        
        // Debug logging for WebRTC state after start-listening
        logger.debug('WebRTC state after start-listening:', {
          connectionId: connectionId, 
          webrtcConnected: this.webrtcService.isConnected(connectionId),
          peerConnectionState: peerConnection?.connectionState || 'unknown',
          iceConnectionState: peerConnection?.iceConnectionState || 'unknown',
          audioTracks: peerConnection?.getReceivers().filter(r => r.track?.kind === 'audio').length || 0,
          sessionListening: session.isListening
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
   * Handle incoming audio data from client
   */
  private handleAudioData(connectionId: string, audioChunk: Buffer): void {
    const session = this.sessions.get(connectionId);
    if (!session) {
      logger.warn(`Received audio data for nonexistent session: ${connectionId}`);
      return;
    }
    
    // Enhanced session state and audio data logging
    logger.debug(`Audio data received: connectionId=${connectionId}, size=${audioChunk.length} bytes, isListening=${session.isListening}, totalReceived=${session.totalAudioReceived}, bufferChunks=${session.audioBuffer.length}`);
    
    if (!session.isListening) {
      // This is common as audio might still flow, but we're not processing it
      logger.debug(`Ignoring audio data from ${connectionId} - not in listening mode`);
      return;
    }
    
    // Skip very small chunks (likely control data)
    if (audioChunk.length < 2) {
      return; // Silently ignore control packets
    }
    
    // Validate audio chunk size (typical Opus frame sizes are 120-960 bytes)
    if (audioChunk.length < 50 || audioChunk.length > 4000) {
      logger.debug(`Unusual audio chunk size from ${connectionId}: ${audioChunk.length} bytes`);
      return;
    }
    
    // Update stats and buffer the audio
    session.totalAudioReceived += audioChunk.length;
    session.audioBuffer.push(audioChunk);
    
    // Track audio reception milestones
    if (session.totalAudioReceived % 2000 === 0) {
      logger.info(`Audio milestone for ${connectionId}: received=${session.totalAudioReceived} bytes, chunks=${session.audioBuffer.length}`);
    }
    
    // Process audio when we've collected enough data (lowered threshold for faster response)
    const totalSize = session.audioBuffer.reduce((sum, buffer) => sum + buffer.length, 0);
    if (totalSize >= 4000) { // ~250ms of audio at 16kHz/16-bit
      logger.info(`Processing audio buffer: size=${totalSize} bytes, chunks=${session.audioBuffer.length}, connectionId=${connectionId}`);
      this.processAudio(connectionId).catch(error => {
        logger.error(`Failed to process audio for ${connectionId}:`, error);
      });
    }
  }

  /**
   * Start listening to the client's audio stream
   * @returns boolean indicating success
   */
  public startListening(connectionId: string): boolean {
    const session = this.sessions.get(connectionId);
    if (!session) {
      logger.warn(`Cannot start listening: No session exists for ${connectionId}`);
      this.webrtcService.sendError(connectionId, 'NO_SESSION', 'No voice session exists');
      return false;
    }
    
    // Log current session state
    logger.info(`Starting to listen for ${connectionId}, current state: isListening=${session.isListening}`);
    
    if (session.isListening) {
      logger.info(`Already listening to ${connectionId}, sending confirmation`);
      // Send confirmation even if already listening to ensure client is in sync
      this.webrtcService.sendMessage(connectionId, { type: 'listening-started' });
      return true;
    }

    // Check WebRTC connection state (but be more lenient about it)
    const isConnected = this.webrtcService.isConnected(connectionId);
    const peerConnection = this.webrtcService.getPeerConnection(connectionId);
    
    // Get detailed connection states for debugging
    const peerState = peerConnection?.connectionState || 'unknown';
    const iceState = peerConnection?.iceConnectionState || 'unknown';
    
    logger.info(`WebRTC connection check for ${connectionId}: isConnected=${isConnected}, peer=${peerState}, ice=${iceState}`);
    
    // More relaxed connection check - accept checking/connected/completed states
    const hasValidConnectionState = 
      isConnected || 
      peerState === 'connected' || 
      peerState === 'connecting' ||
      iceState === 'checking' || 
      iceState === 'connected' || 
      iceState === 'completed';
    
    if (!hasValidConnectionState) {
      logger.warn(`Cannot start listening for ${connectionId}: No valid WebRTC connection state (peer=${peerState}, ice=${iceState})`);
      this.webrtcService.sendError(connectionId, 'WEBRTC_NOT_CONNECTED', 'WebRTC connection required for audio streaming');
      return false;
    }
    
    // Reset audio buffer and start listening
    session.audioBuffer = [];
    session.isListening = true;
    session.totalAudioReceived = 0;
    
    logger.info(`Started listening to ${connectionId} (isListening=${session.isListening})`);
    
    // Send confirmation that we've started listening, but don't reset state if it fails
    const success = this.webrtcService.sendMessage(connectionId, { 
      type: 'listening-started',
      timestamp: Date.now()
    });
    
    if (!success) {
      logger.error(`Failed to send listening-started message to ${connectionId}, but continuing to listen`);
      // Don't reset isListening - we want to keep listening even if confirmation fails
    }
    
    // Return true since we successfully started listening, even if confirmation failed
    return true;
  }

  /**
   * Stop listening and process any collected audio
   */
  public stopListening(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    if (!session || !session.isListening) return;

    session.isListening = false;
    logger.info(`Stopped listening to ${connectionId}`);
    this.webrtcService.sendMessage(connectionId, { type: 'listening-stopped' });
    
    // Process any collected audio
    if (session.audioBuffer.length > 0) {
      this.processAudio(connectionId);
    }
  }
  
  /**
   * Process collected audio data
   */
  private async processAudio(connectionId: string): Promise<void> {
    const session = this.sessions.get(connectionId);
    if (!session || session.audioBuffer.length === 0) return;
    
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    
    try {
      // Combine audio chunks
      const audioData = Buffer.concat(session.audioBuffer);
      logger.info(`[${requestId}] Processing ${audioData.length} bytes of audio from ${connectionId}`);
      
      // Clear the buffer
      session.audioBuffer = [];
      
      try {
        // Step 1: Transcribe audio using Deepgram
        const transcribedText = await this.deepgramService.transcribeAudio(audioData);
        
        if (!transcribedText || transcribedText.trim() === '') {
          logger.warn(`[${requestId}] Empty transcription result for ${connectionId}`);
          const defaultResponse = "I couldn't hear that clearly. Could you please speak again?";
          await this.streamResponseToClient(connectionId, requestId, defaultResponse);
          this.startListening(connectionId);
          return;
        }
        
        logger.info(`[${requestId}] Transcribed: "${transcribedText.substring(0, 100)}${transcribedText.length > 100 ? '...' : ''}"`);
        
        // Step 2: Create echo response
        logger.info(`[${requestId}] Creating echo response for ${connectionId}`);
        
        // Simple echo response - exactly what was requested
        const responseText = `You said: ${transcribedText}`;
        
        // Step 3: Stream response back to client over WebRTC
        await this.streamResponseToClient(connectionId, requestId, responseText);
        
        // Resume listening
        this.startListening(connectionId);
      } catch (transcriptionError) {
        logger.error(`[${requestId}] Transcription error: ${transcriptionError}`);
        const errorMessage = "I'm having trouble processing your speech. Could you please try again?";
        await this.streamResponseToClient(connectionId, requestId, errorMessage);
        this.startListening(connectionId);
      }
    } catch (error) {
      logger.error(`[${requestId}] Critical error processing audio for ${connectionId}:`, error);
      this.webrtcService.sendError(connectionId, 'PROCESSING_ERROR', 'Failed to process audio');
      this.startListening(connectionId);
    }
  }
  
  /**
   * Stream a text response to the client using Cartesia and WebRTC
   */
  private async streamResponseToClient(connectionId: string, requestId: string, text: string): Promise<void> {
    // Ensure WebRTC is connected
    if (!this.webrtcService.isConnected(connectionId)) {
      logger.error(`[${requestId}] Cannot stream response: WebRTC not connected for ${connectionId}`);
      this.webrtcService.sendError(connectionId, 'WEBRTC_NOT_CONNECTED', 'WebRTC connection required for audio streaming');
      return;
    }
    
    try {
      logger.info(`[${requestId}] Streaming response: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      this.webrtcService.sendMessage(connectionId, { type: 'speaking-start' });
      
      // Stream audio response through Cartesia -> WebRTC
      return this.streamTTSOverWebRTC(connectionId, requestId, text);
      
    } catch (error) {
      logger.error(`[${requestId}] Error generating response for ${connectionId}:`, error);
      this.webrtcService.sendError(connectionId, 'TTS_ERROR', 'Failed to generate speech response');
    }
  }
  
  /**
   * Stream TTS response over WebRTC
   */
  private async streamTTSOverWebRTC(connectionId: string, requestId: string, text: string): Promise<void> {
    if (!this.webrtcService.isConnected(connectionId)) return;
    
    return new Promise<void>((resolve, reject) => {
      try {
        // Track streaming state
        let chunkCount = 0;
        
        // Handle stream start
        this.cartesiaService.once('streamStart', () => {
          this.webrtcService.sendMessage(connectionId, { type: 'speaking-begin' });
        });
        
        // Handle audio chunks - send each directly over WebRTC
        this.cartesiaService.on('audioChunk', (data) => {
          const { audio, chunkIndex } = data;
          chunkCount++;
          
          try {
            // Send chunk over WebRTC
            const sent = this.webrtcService.sendData(connectionId, audio);
            
            if (!sent) {
              logger.warn(`[${requestId}] Failed to send audio chunk #${chunkIndex}`);
              
              // If WebRTC is disconnected, stop streaming
              if (!this.webrtcService.isConnected(connectionId)) {
                logger.warn(`[${requestId}] WebRTC disconnected during streaming`);
                this.cartesiaService.removeAllListeners('audioChunk');
                reject(new Error('WebRTC disconnected during streaming'));
                return;
              }
            }
            
            // Log progress
            if (chunkIndex % 20 === 0) {
              logger.debug(`[${requestId}] Sent ${chunkIndex} audio chunks so far...`);
            }
          } catch (err) {
            logger.error(`[${requestId}] Error sending audio chunk #${chunkIndex}:`, err);
          }
        });
        
        // Handle stream end
        this.cartesiaService.once('streamEnd', () => {
          logger.info(`[${requestId}] Completed streaming ${chunkCount} chunks to ${connectionId}`);
          this.webrtcService.sendMessage(connectionId, { type: 'speaking-end' });
          this.cartesiaService.removeAllListeners('audioChunk');
          resolve();
        });
        
        // Handle stream errors
        this.cartesiaService.once('streamError', (error) => {
          logger.error(`[${requestId}] Streaming error:`, error);
          this.cartesiaService.removeAllListeners('audioChunk');
          reject(error);
        });
        
        // Start streaming TTS
        this.cartesiaService.streamTextToSpeech(text, {
          outputFormat: {
            container: 'raw',
            sampleRate: 16000, // 16kHz
            encoding: 'pcm_s16le' // 16-bit PCM
          }
        }).catch(reject);
        
      } catch (error) {
        reject(error);
      }
    });
  }
}
