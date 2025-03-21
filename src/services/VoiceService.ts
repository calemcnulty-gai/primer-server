import { EventEmitter } from 'events';
import { DeepgramService, DeepgramConnection } from './DeepgramService';
import { CartesiaService, CartesiaResponse } from './CartesiaService';
import { WebRTCService, WebRTCMessage } from './WebRTCService';
import { createLogger } from '../utils/logger';

const logger = createLogger('VoiceService');

// Interface to track audio session state
interface AudioSession {
  connectionId: string;       // Associated connection ID
  isListening: boolean;       // Whether we're currently listening
  audioBuffer: Buffer[];      // Buffer to collect audio chunks
  totalAudioReceived: number; // Track total bytes received
  stream?: any;              // Active MediaStream
  deepgramConnection?: DeepgramConnection; // Active Deepgram connection
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
    
    // Handle incoming audio stream
    this.webrtcService.on('stream', (connectionId: string, stream: any) => {
      this.handleAudioStream(connectionId, stream);
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
        
        // Get WebRTC state
        const peerConnection = this.webrtcService.getPeerConnection(connectionId);
        const peerState = peerConnection?.connectionState || 'unknown';
        const iceState = peerConnection?.iceConnectionState || 'unknown';
        
        // More lenient connection check - if we have a peer connection and it's in a valid state
        const hasValidConnectionState = peerConnection && (
          peerState === 'connected' || 
          peerState === 'connecting' ||
          iceState === 'checking' || 
          iceState === 'connected' || 
          iceState === 'completed'
        );

        if (!peerConnection) {
          logger.error(`Cannot start listening - No WebRTC peer connection for ${connectionId}`);
          this.webrtcService.sendMessage(connectionId, { 
            type: 'listening-started',
            commandId: commandId,
            error: 'No WebRTC peer connection'
          });
          return;
        }

        // If connection is still establishing, wait briefly and retry
        if (!hasValidConnectionState && (peerState === 'new' || iceState === 'new')) {
          logger.info(`WebRTC connection still establishing for ${connectionId}, waiting briefly...`);
          setTimeout(() => {
            // Recheck connection state
            const currentState = peerConnection.connectionState;
            const currentIceState = peerConnection.iceConnectionState;
            
            if (currentState === 'connected' || currentIceState === 'connected' || currentIceState === 'completed') {
              logger.info(`WebRTC connection now ready for ${connectionId}, starting to listen`);
              this.startListeningWithResponse(connectionId, commandId);
            } else {
              logger.error(`WebRTC connection still not ready for ${connectionId} after waiting`);
              this.webrtcService.sendMessage(connectionId, { 
                type: 'listening-started',
                commandId: commandId,
                error: 'WebRTC connection not ready'
              });
            }
          }, 500); // Wait 500ms for connection to establish
          return;
        }
        
        // Check if already listening
        if (session.isListening) {
          logger.warn(`Session ${connectionId} is already listening, resetting state`);
          this.stopListening(connectionId);
        }
        
        // Start listening
        this.startListeningWithResponse(connectionId, commandId);
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
   * Helper to start listening and send appropriate response
   */
  private startListeningWithResponse(connectionId: string, commandId: string): void {
    const started = this.startListening(connectionId);
    
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
    const peerConnection = this.webrtcService.getPeerConnection(connectionId);
    logger.debug('WebRTC state after start-listening:', {
      connectionId: connectionId, 
      webrtcConnected: this.webrtcService.isConnected(connectionId),
      peerConnectionState: peerConnection?.connectionState || 'unknown',
      iceConnectionState: peerConnection?.iceConnectionState || 'unknown',
      audioTracks: peerConnection?.getReceivers().filter(r => r.track?.kind === 'audio').length || 0,
      sessionListening: this.sessions.get(connectionId)?.isListening
    });
  }

  /**
   * Handle incoming audio stream from client
   */
  private handleAudioStream(connectionId: string, stream: any): void {
    const session = this.sessions.get(connectionId);
    if (!session) {
      logger.warn(`Received audio stream for nonexistent session: ${connectionId}`);
      return;
    }

    if (!session.isListening) {
      logger.debug(`Ignoring audio stream from ${connectionId} - not in listening mode`);
      return;
    }

    try {
      // Get audio tracks from the stream
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        logger.warn(`No audio tracks found in stream from ${connectionId}`);
        return;
      }

      // Store the stream reference
      session.stream = stream;

      // Create a live transcription connection to Deepgram
      const deepgramConnection = this.deepgramService.createConnection({
        model: "nova-3",
        language: "en-US",
        smart_format: true,
        interim_results: true
      });

      // Store the connection in the session
      session.deepgramConnection = deepgramConnection;

      // Track transcription state for streaming to Cartesia
      let currentContext: string | null = null;
      let lastTranscript = '';
      let isFirstUtterance = true;

      // Handle transcription events
      deepgramConnection.on('open', () => {
        logger.info(`Deepgram connection opened for ${connectionId}`);
      });

      deepgramConnection.on('close', () => {
        logger.info(`Deepgram connection closed for ${connectionId}`);
        currentContext = null;
      });

      deepgramConnection.on('transcript', async (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        const isFinal = data.is_final;

        // Log the transcript with its state
        logger.info(`Transcription for ${connectionId}: "${transcript}" (${isFinal ? 'final' : 'interim'})`);

        // Only process non-empty transcripts
        if (transcript.trim()) {
          // For final transcripts, we want to stream to Cartesia
          if (isFinal) {
            try {
              // If this is our first utterance, we send it as is
              if (isFirstUtterance) {
                logger.info(`Sending first utterance to Cartesia: "${transcript}"`);
                currentContext = await this.streamToCartesia(connectionId, transcript);
                isFirstUtterance = false;
              } else {
                // For subsequent utterances, we need to handle continuations properly
                // Ensure proper spacing between utterances
                const continuationText = transcript.startsWith(' ') ? transcript : ' ' + transcript;
                logger.info(`Sending continuation to Cartesia: "${continuationText}" (context: ${currentContext})`);
                currentContext = await this.streamToCartesia(connectionId, continuationText, currentContext);
              }
              lastTranscript = transcript;
            } catch (error) {
              logger.error(`Error streaming to Cartesia for ${connectionId}:`, error);
            }
          } else {
            // For interim results, just log them
            logger.debug(`Interim transcript for ${connectionId}: "${transcript}"`);
          }
        }
      });

      deepgramConnection.on('error', (err) => {
        logger.error(`Deepgram error for ${connectionId}:`, err);
        currentContext = null;
      });

      // Pipe the audio stream to Deepgram
      stream.on('data', (chunk) => {
        if (session.isListening && session.deepgramConnection) {
          session.deepgramConnection.send(chunk);
        }
      });

      // Clean up when the track ends
      audioTracks[0].onended = () => {
        logger.info(`Audio track ended for ${connectionId}`);
        if (session.deepgramConnection) {
          session.deepgramConnection.finish();
        }
        session.stream = undefined;
        session.deepgramConnection = undefined;
      };

    } catch (error) {
      logger.error(`Error handling audio stream for ${connectionId}:`, error);
    }
  }

  /**
   * Stream text to Cartesia with continuation support
   */
  private async streamToCartesia(connectionId: string, text: string, context: string | null = null): Promise<string> {
    try {
      const response = await this.cartesiaService.streamTextToSpeech(text, {
        continuationContext: context,
        outputFormat: {
          container: 'raw',
          sampleRate: 16000,
          encoding: 'pcm_s16le'
        }
      }) as CartesiaResponse;

      // Send the audio data through WebRTC
      this.webrtcService.sendMessage(connectionId, { type: 'speaking-start' });

      // Handle the streaming response
      response.on('data', (audioChunk: Buffer) => {
        this.webrtcService.sendData(connectionId, audioChunk);
      });

      // Handle end of stream
      response.on('end', () => {
        this.webrtcService.sendMessage(connectionId, { type: 'speaking-end' });
      });

      // Return the context for the next continuation
      return response.context;

    } catch (error) {
      logger.error(`Error streaming to Cartesia:`, error);
      throw error;
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
