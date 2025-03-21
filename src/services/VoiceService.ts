import { EventEmitter } from 'events';
import { DeepgramService, DeepgramConnection } from './DeepgramService';
import { CartesiaService, CartesiaResponse } from './CartesiaService';
import { WebRTCService, WebRTCMessage } from './WebRTCService';
import { createLogger } from '../utils/logger';
import { AudioContext } from 'node-web-audio-api';

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
      logger.debug(`Storing stream but not processing yet for ${connectionId} - not in listening mode`);
      return; // Stream is already stored, wait for startListening
    }

    if (session.deepgramConnection) {
      logger.info(`Audio processing already active for ${connectionId}, skipping duplicate setup`);
      return; // Prevent multiple setups for the same stream
    }

    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        logger.warn(`No audio tracks found in stream from ${connectionId}`);
        return;
      }

      logger.info(`Processing audio stream for ${connectionId} with ${audioTracks.length} tracks`);
      logger.debug(`Audio track details: kind=${audioTracks[0].kind}, id=${audioTracks[0].id}, readyState=${audioTracks[0].readyState}, enabled=${audioTracks[0].enabled}`);

      // Create an AudioContext configured for headless operation
      const audioContext = new AudioContext({ 
        sampleRate: 16000,
        // Disable default output device to avoid ALSA errors
        outputDevice: 'null',
        // Configure for minimal audio processing
        latencyHint: 'playback',
        // Disable audio output
        sinkId: 'none'
      });
      logger.info(`AudioContext created for ${connectionId}, initial state: ${audioContext.state}`);

      // Resume the AudioContext to ensure it processes audio
      audioContext.resume().then(() => {
        logger.info(`AudioContext resumed for ${connectionId}, current state: ${audioContext.state}`);
      }).catch(err => {
        logger.error(`Failed to resume AudioContext for ${connectionId}:`, err);
        // Continue anyway since we don't need audio output
        logger.info(`Continuing despite AudioContext resume failure - output not needed`);
      });

      try {
        const source = audioContext.createMediaStreamSource(stream);
        logger.debug(`MediaStreamSource created for ${connectionId}, number of outputs: ${source.numberOfOutputs}`);

        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        logger.debug(`ScriptProcessor created for ${connectionId}, buffer size: 4096, inputs: ${processor.numberOfInputs}, outputs: ${processor.numberOfOutputs}`);

        // Don't connect to destination since we don't need audio output
        // Just connect source -> processor for PCM extraction
        source.connect(processor);
        
        // Create Deepgram connection with detailed logging
        logger.info(`Creating Deepgram connection for ${connectionId}...`);
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

        // Track audio processing metrics
        let processedChunks = 0;
        let totalBytesProcessed = 0;
        let lastProcessTime = Date.now();
        let silentChunksCount = 0;

        // Track transcription state
        let currentContext: string | null = null;
        let lastTranscript = '';
        let isFirstUtterance = true;

        // Handle Deepgram events with enhanced logging
        deepgramConnection.on('open', () => {
          logger.info(`Deepgram connection opened for ${connectionId}`);
        });

        deepgramConnection.on('close', () => {
          logger.info(`Deepgram connection closed for ${connectionId} after processing ${processedChunks} chunks (${totalBytesProcessed} bytes)`);
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

        // Process audio data into PCM chunks with enhanced diagnostics
        processor.onaudioprocess = (event) => {
          if (!session.isListening || !session.deepgramConnection) {
            logger.debug(`Skipping audio processing for ${connectionId} - not listening or no Deepgram connection`);
            return;
          }

          const now = Date.now();
          const timeSinceLastProcess = now - lastProcessTime;
          lastProcessTime = now;

          const inputBuffer = event.inputBuffer;
          const float32Data = inputBuffer.getChannelData(0);
          const pcmData = Buffer.alloc(float32Data.length * 2);

          // Audio level analysis
          let minSample = 0, maxSample = 0;
          let sumSquares = 0;

          // Convert Float32Array to 16-bit PCM with audio analysis
          for (let i = 0; i < float32Data.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Data[i]));
            const pcmSample = Math.round(sample * 32767);
            pcmData.writeInt16LE(pcmSample, i * 2);
            
            minSample = Math.min(minSample, sample);
            maxSample = Math.max(maxSample, sample);
            sumSquares += sample * sample;
          }

          // Calculate RMS (Root Mean Square) for volume level
          const rms = Math.sqrt(sumSquares / float32Data.length);
          const isSilent = rms < 0.001; // Adjust threshold as needed

          if (isSilent) {
            silentChunksCount++;
          } else {
            silentChunksCount = 0;
          }

          processedChunks++;
          totalBytesProcessed += pcmData.length;

          // Detailed diagnostic logging every second or if audio characteristics change significantly
          if (processedChunks % 4 === 0 || !isSilent) {
            logger.debug(`Audio processing stats for ${connectionId}:
              Chunk #${processedChunks}
              Size: ${pcmData.length} bytes
              Time since last: ${timeSinceLastProcess}ms
              RMS: ${rms.toFixed(6)}
              Range: ${minSample.toFixed(6)} to ${maxSample.toFixed(6)}
              Silent chunks: ${silentChunksCount}
              Total processed: ${totalBytesProcessed} bytes`);
          }

          // Send to Deepgram if not prolonged silence
          if (!isSilent || silentChunksCount < 20) { // Skip after 5 seconds of silence
            session.deepgramConnection.send(pcmData);
            session.totalAudioReceived += pcmData.length;
          }
        };

        // Connect the audio processing pipeline
        source.connect(processor);
        
        // Monitor AudioContext state
        const stateCheck = setInterval(() => {
          const state = audioContext.state;
          logger.debug(`AudioContext state for ${connectionId}: ${state}`);
          
          // Auto-resume if suspended
          if (state === 'suspended') {
            logger.warn(`AudioContext suspended for ${connectionId}, attempting to resume...`);
            audioContext.resume().catch(err => {
              logger.error(`Failed to auto-resume AudioContext for ${connectionId}:`, err);
            });
          }
          
          if (state === 'closed') {
            clearInterval(stateCheck);
          }
        }, 1000);

        // Clean up when the track ends
        audioTracks[0].onended = () => {
          logger.info(`Audio track ended for ${connectionId}. Stats:
            Total chunks processed: ${processedChunks}
            Total bytes processed: ${totalBytesProcessed}
            Processing duration: ${((Date.now() - lastProcessTime) / 1000).toFixed(1)}s`);

          if (session.deepgramConnection) {
            session.deepgramConnection.finish();
          }
          processor.disconnect();
          source.disconnect();
          audioContext.close();
          clearInterval(stateCheck);
          session.stream = undefined;
          session.deepgramConnection = undefined;
        };

        logger.info(`Audio processing pipeline established for ${connectionId}`);
      } catch (error) {
        logger.error(`Error setting up audio processing for ${connectionId}:`, error);
        if (session.deepgramConnection) {
          session.deepgramConnection.finish();
          session.deepgramConnection = undefined;
        }
        session.stream = undefined;
      }
    } catch (error) {
      logger.error(`Error setting up audio processing for ${connectionId}:`, error);
      if (session.deepgramConnection) {
        session.deepgramConnection.finish();
        session.deepgramConnection = undefined;
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
    session.audioBuffer = [];
    session.isListening = true;
    session.totalAudioReceived = 0;
    
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
