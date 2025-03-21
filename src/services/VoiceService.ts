import { EventEmitter } from 'events';
import { DeepgramService } from './DeepgramService';
import { CartesiaService, CartesiaResponse } from './CartesiaService';
import { WebRTCService } from './WebRTCService';
import { createLogger } from '../utils/logger';
import { RTCPeerConnection, RTCRtpReceiver } from 'werift-webrtc';

const logger = createLogger('VoiceService');

// Interface to track audio session state
interface AudioSession {
  connectionId: string;       // Associated connection ID
  isListening: boolean;       // Whether we're currently listening
  totalAudioReceived: number; // Track total bytes received
  stream?: any;              // Active MediaStream
  deepgramConnection?: any;   // Active Deepgram connection
  peerConnection?: RTCPeerConnection; // WebRTC peer connection
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
      const session = this.sessions.get(connectionId);
      if (!session) {
        logger.warn(`Received stream for nonexistent session: ${connectionId}`);
        this.createSession(connectionId);
      }
      
      const updatedSession = this.sessions.get(connectionId)!;
      updatedSession.stream = stream; // Store stream regardless of isListening
      logger.info(`Stored audio stream for ${connectionId}, isListening=${updatedSession.isListening}`);
      
      if (updatedSession.isListening) {
        logger.info(`Session already listening, initiating audio processing for ${connectionId}`);
        this.handleAudioStream(connectionId, stream); // Process immediately if already listening
      } else {
        logger.info(`Stream stored but waiting for start-listening command for ${connectionId}`);
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
      if (session.peerConnection) {
        session.peerConnection.close();
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
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        logger.warn(`No audio tracks for ${connectionId}`);
        return;
      }

      logger.info(`Processing stream for ${connectionId} with ${audioTracks.length} tracks`);
      const pc = new RTCPeerConnection();
      session.peerConnection = pc;

      // Add client stream tracks to peer connection
      audioTracks.forEach((track: any) => {
        try {
          pc.addTransceiver(track, { direction: 'sendrecv' });
        } catch (error) {
          logger.error(`Error adding track to peer connection: ${error}`);
        }
      });

      const deepgramConnection = this.deepgramService.createConnection({
        model: "nova-2",
        language: "en-US",
        smart_format: true,
        interim_results: true,
        encoding: "linear16",
        sampleRate: 16000,
        channels: 1
      });
      session.deepgramConnection = deepgramConnection;

      let processedChunks = 0;
      let totalBytesProcessed = 0;
      let currentContext: string | null = null;
      let lastTranscript = '';
      let isFirstUtterance = true;

      pc.onTrack.subscribe((event) => {
        const track = event.track;
        track.onReceiveRtp.subscribe((rtp) => {
          const pcmData = this.decodePCMU(rtp.payload);
          if (pcmData) {
            processedChunks++;
            totalBytesProcessed += pcmData.length;
            logger.debug(`Chunk #${processedChunks} for ${connectionId}, size: ${pcmData.length}`);
            session.deepgramConnection.send(pcmData);
            session.totalAudioReceived += pcmData.length;
          }
        });
      });

      deepgramConnection.on('open', () => {
        logger.info(`Deepgram opened for ${connectionId}`);
      });

      deepgramConnection.on('close', () => {
        logger.info(`Deepgram closed for ${connectionId} after processing ${processedChunks} chunks (${totalBytesProcessed} bytes)`);
        currentContext = null;
      });

      deepgramConnection.on('transcript', async (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript || '';
        const isFinal = data.is_final;

        logger.info(`Transcription for ${connectionId}: "${transcript}" (${isFinal ? 'final' : 'interim'})`);

        if (transcript.trim()) {
          if (isFinal) {
            try {
              if (isFirstUtterance) {
                logger.info(`Sending first utterance to Cartesia: "${transcript}"`);
                currentContext = await this.streamToCartesia(connectionId, transcript);
                isFirstUtterance = false;
              } else {
                const continuationText = transcript.startsWith(' ') ? transcript : ' ' + transcript;
                logger.info(`Sending continuation to Cartesia: "${continuationText}" (context: ${currentContext})`);
                currentContext = await this.streamToCartesia(connectionId, continuationText, currentContext);
              }
              lastTranscript = transcript;
            } catch (error) {
              logger.error(`Error streaming to Cartesia for ${connectionId}:`, error);
            }
          } else {
            logger.debug(`Interim transcript for ${connectionId}: "${transcript}"`);
          }
        }
      });

      deepgramConnection.on('error', (err) => {
        logger.error(`Deepgram error for ${connectionId}:`, err);
        currentContext = null;
      });

      audioTracks[0].onended = () => {
        logger.info(`Track ended for ${connectionId}. Stats:
          Total chunks processed: ${processedChunks}
          Total bytes processed: ${totalBytesProcessed}
          Processing duration: ${((Date.now() - Date.now()) / 1000).toFixed(1)}s`);

        if (session.deepgramConnection) {
          session.deepgramConnection.finish();
          session.deepgramConnection = undefined;
        }
        if (session.peerConnection) {
          session.peerConnection.close();
          session.peerConnection = undefined;
        }
        session.stream = undefined;
      };

      logger.info(`Audio processing pipeline established for ${connectionId}`);
    } catch (error) {
      logger.error(`Error for ${connectionId}:`, error);
      if (session.deepgramConnection) {
        session.deepgramConnection.finish();
        session.deepgramConnection = undefined;
      }
      if (session.peerConnection) {
        session.peerConnection.close();
        session.peerConnection = undefined;
      }
      session.stream = undefined;
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

      this.webrtcService.sendMessage(connectionId, { type: 'speaking-start' });

      response.on('data', (audioChunk: Buffer) => {
        this.webrtcService.sendData(connectionId, audioChunk);
      });

      response.on('end', () => {
        this.webrtcService.sendMessage(connectionId, { type: 'speaking-end' });
      });

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
    
    logger.info(`Starting to listen for ${connectionId}, current state: isListening=${session.isListening}`);
    
    if (session.isListening) {
      logger.info(`Already listening to ${connectionId}, sending confirmation`);
      this.webrtcService.sendMessage(connectionId, { type: 'listening-started' });
      return true;
    }

    const isConnected = this.webrtcService.isConnected(connectionId);
    const peerConnection = this.webrtcService.getPeerConnection(connectionId);
    const peerState = peerConnection?.connectionState || 'unknown';
    const iceState = peerConnection?.iceConnectionState || 'unknown';
    
    logger.info(`WebRTC connection check for ${connectionId}: isConnected=${isConnected}, peer=${peerState}, ice=${iceState}`);
    
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
    session.totalAudioReceived = 0;
    session.isListening = true;
    
    logger.info(`Started listening to ${connectionId} (isListening=${session.isListening})`);
    
    // If we already have a stream, start processing it now
    if (session.stream) {
      logger.info(`Stream already available for ${connectionId}, starting audio processing`);
      this.handleAudioStream(connectionId, session.stream);
    } else {
      logger.info(`Waiting for stream to arrive for ${connectionId}`);
    }
    
    const success = this.webrtcService.sendMessage(connectionId, { 
      type: 'listening-started',
      timestamp: Date.now()
    });
    
    if (!success) {
      logger.error(`Failed to send listening-started message to ${connectionId}, but continuing to listen`);
    }
    
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

    // Clean up audio processing
    if (session.deepgramConnection) {
      session.deepgramConnection.finish();
      session.deepgramConnection = undefined;
    }
    if (session.peerConnection) {
      session.peerConnection.close();
      session.peerConnection = undefined;
    }

    this.webrtcService.sendMessage(connectionId, { type: 'listening-stopped' });
  }

  private decodePCMU(payload: Buffer): Buffer | null {
    try {
      const pcmData = Buffer.alloc(payload.length * 2); // 16-bit PCM from 8-bit mu-law
      for (let i = 0; i < payload.length; i++) {
        const mulaw = ~payload[i]; // Invert bits
        const sign = mulaw & 0x80;
        const exponent = (mulaw & 0x70) >> 4;
        const mantissa = mulaw & 0x0F;
        let sample = (mantissa << 4) + 16;
        sample <<= exponent;
        sample = sign ? -sample : sample;
        pcmData.writeInt16LE(sample, i * 2);
      }
      return pcmData;
    } catch (error) {
      logger.error('PCMU decode error:', error);
      return null;
    }
  }

  private async streamResponseToClient(connectionId: string, requestId: string, text: string): Promise<void> {
    if (!this.webrtcService.isConnected(connectionId)) {
      logger.error(`[${requestId}] Cannot stream response: WebRTC not connected for ${connectionId}`);
      this.webrtcService.sendError(connectionId, 'WEBRTC_NOT_CONNECTED', 'WebRTC connection required for audio streaming');
      return;
    }
    
    try {
      logger.info(`[${requestId}] Streaming response: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      this.webrtcService.sendMessage(connectionId, { type: 'speaking-start' });
      
      return this.streamTTSOverWebRTC(connectionId, requestId, text);
      
    } catch (error) {
      logger.error(`[${requestId}] Error generating response for ${connectionId}:`, error);
      this.webrtcService.sendError(connectionId, 'TTS_ERROR', 'Failed to generate speech response');
    }
  }

  private async streamTTSOverWebRTC(connectionId: string, requestId: string, text: string): Promise<void> {
    if (!this.webrtcService.isConnected(connectionId)) return;
    
    return new Promise<void>((resolve, reject) => {
      try {
        let chunkCount = 0;
        
        this.cartesiaService.once('streamStart', () => {
          this.webrtcService.sendMessage(connectionId, { type: 'speaking-begin' });
        });
        
        this.cartesiaService.on('audioChunk', (data) => {
          const { audio, chunkIndex } = data;
          chunkCount++;
          
          try {
            const sent = this.webrtcService.sendData(connectionId, audio);
            
            if (!sent) {
              logger.warn(`[${requestId}] Failed to send audio chunk #${chunkIndex}`);
              
              if (!this.webrtcService.isConnected(connectionId)) {
                logger.warn(`[${requestId}] WebRTC disconnected during streaming`);
                this.cartesiaService.removeAllListeners('audioChunk');
                reject(new Error('WebRTC disconnected during streaming'));
                return;
              }
            }
            
            if (chunkIndex % 20 === 0) {
              logger.debug(`[${requestId}] Sent ${chunkIndex} audio chunks so far...`);
            }
          } catch (err) {
            logger.error(`[${requestId}] Error sending audio chunk #${chunkIndex}:`, err);
          }
        });
        
        this.cartesiaService.once('streamEnd', () => {
          logger.info(`[${requestId}] Completed streaming ${chunkCount} chunks to ${connectionId}`);
          this.webrtcService.sendMessage(connectionId, { type: 'speaking-end' });
          this.cartesiaService.removeAllListeners('audioChunk');
          resolve();
        });
        
        this.cartesiaService.once('streamError', (error) => {
          logger.error(`[${requestId}] Streaming error:`, error);
          this.cartesiaService.removeAllListeners('audioChunk');
          reject(error);
        });
        
        this.cartesiaService.streamTextToSpeech(text, {
          outputFormat: {
            container: 'raw',
            sampleRate: 16000,
            encoding: 'pcm_s16le'
          }
        }).catch(reject);
        
      } catch (error) {
        reject(error);
      }
    });
  }
}
