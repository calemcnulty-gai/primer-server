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
    });
    
    // Handle established connections
    this.webrtcService.on('connection:ready', (connectionId: string) => {
      logger.info(`WebRTC connection ready for ${connectionId}, creating voice session`);
      this.createSession(connectionId);
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
      this.handleClientMessage(connectionId, message);
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
    if (!this.sessions.has(connectionId)) return;
    
    switch (message.type) {
      case 'start-listening':
        // Debug logging for start-listening command
        console.log('[DEBUG] Received start-listening command:', {
          commandId: message.commandId, 
          connectionId: message.connectionId,
          clientDebugInfo: message.debug 
        });
        
        this.startListening(connectionId);
        
        // Debug logging for WebRTC state after start-listening
        const peerConnection = this.webrtcService.getPeerConnection(connectionId);
        console.log('[DEBUG] WebRTC state on server after start-listening:', {
          connectionId: connectionId, 
          webrtcConnected: this.webrtcService.isConnected(connectionId),
          peerConnectionState: peerConnection?.connectionState || 'unknown',
          iceConnectionState: peerConnection?.iceConnectionState || 'unknown',
          audioTracks: peerConnection?.getReceivers().filter(r => r.track?.kind === 'audio').length || 0
        });
        break;
        
      case 'stop-listening':
        this.stopListening(connectionId);
        break;
    }
  }

  /**
   * Handle incoming audio data from client
   */
  private handleAudioData(connectionId: string, audioChunk: Buffer): void {
    const session = this.sessions.get(connectionId);
    if (!session || !session.isListening) return;
    
    // Skip very small chunks (likely heartbeats or control messages)
    if (audioChunk.length < 50) return;
    
    // Update stats
    session.totalAudioReceived += audioChunk.length;
    session.audioBuffer.push(audioChunk);
    
    // Debug logging for audio data reception
    console.log('[DEBUG] Server received audio data:', {
      connectionId: connectionId,
      bytesReceived: audioChunk.length,
      timestamp: Date.now()
    });
    
    logger.debug(`Received ${audioChunk.length} bytes of audio over WebRTC from ${connectionId}`);
    
    // Process audio when we've collected enough data (8KB)
    const totalSize = session.audioBuffer.reduce((sum, buffer) => sum + buffer.length, 0);
    if (totalSize > 8000) {
      logger.info(`Collected ${totalSize} bytes of audio, processing for ${connectionId}`);
      this.processAudio(connectionId);
    }
  }

  /**
   * Start listening to the client's audio stream
   */
  public startListening(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    if (!session || session.isListening) return;

    // Ensure WebRTC is connected before listening
    if (!this.webrtcService.isConnected(connectionId)) {
      logger.warn(`Cannot start listening for ${connectionId}: WebRTC not connected`);
      this.webrtcService.sendError(connectionId, 'WEBRTC_NOT_CONNECTED', 'WebRTC connection required for audio streaming');
      return;
    }

    // Reset audio buffer and start listening
    session.audioBuffer = [];
    session.isListening = true;
    
    logger.info(`Started listening to ${connectionId}`);
    this.webrtcService.sendMessage(connectionId, { type: 'listening-started' });
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
