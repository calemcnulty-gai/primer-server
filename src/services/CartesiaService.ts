import { CartesiaClient } from '@cartesia/cartesia-js';
import { createLogger } from '../utils/logger';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

// Load environment variables
dotenv.config();

const logger = createLogger('CartesiaService');

export interface StreamingTtsOptions {
  modelId?: string;
  voice?: {
    mode: 'id';
    id: string;
  };
  language?: string;
  outputFormat?: {
    container: 'mp3' | 'wav' | 'raw';
    sampleRate: number;
    encoding?: string;
    bitRate?: number;
  };
}

// Define the interface that matches what the Cartesia SDK actually returns
interface ChunkData {
  chunk?: {
    audio: Uint8Array;
  };
}

export class CartesiaService extends EventEmitter {
  private client: CartesiaClient;
  private apiKey: string;
  private modelId: string;
  private defaultVoiceId: string;

  constructor() {
    super();
    this.apiKey = process.env.CARTESIA_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('CARTESIA_API_KEY not set in environment variables');
    }
    
    this.modelId = process.env.CARTESIA_MODEL_ID || 'sonic-2';
    this.defaultVoiceId = process.env.CARTESIA_DEFAULT_VOICE_ID || 'c99d36f3-5ffd-4253-803a-535c1bc9c306';
    
    // Initialize Cartesia client
    this.client = new CartesiaClient({
      apiKey: this.apiKey
    });
    
    logger.info('CartesiaService initialized');
  }

  /**
   * Convert text to speech using Cartesia SDK
   * @param text Text to convert to speech
   * @returns Audio buffer
   */
  public async textToSpeech(text: string): Promise<Buffer> {
    try {
      if (!this.apiKey) {
        throw new Error('Cartesia API key not configured');
      }

      const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      const startTime = new Date();
      logger.info(`[${requestId}] [${startTime.toISOString()}] Converting text to speech: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      
      // Create TTS request using the SDK
      const audioArrayBuffer = await this.client.tts.bytes({
        modelId: this.modelId,
        transcript: text,
        voice: {
          mode: 'id',
          id: this.defaultVoiceId
        },
        outputFormat: {
          container: 'mp3',
          sampleRate: 16000, // Match client-side expectation: 16kHz
          bitRate: 128000
        },
        language: 'en'
      });
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      logger.info(`[${requestId}] [${endTime.toISOString()}] Successfully converted text to speech in ${duration}ms, audio size: ${audioArrayBuffer.byteLength} bytes`);
      
      // Convert ArrayBuffer to Buffer
      return Buffer.from(audioArrayBuffer);
    } catch (error) {
      const errorTime = new Date();
      logger.error(`[${errorTime.toISOString()}] Error converting text to speech:`, error);
      throw new Error(`Text-to-speech failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stream text to speech using Cartesia's SSE streaming capability
   * @param text Text to convert to speech
   * @param options Streaming options
   */
  public async streamTextToSpeech(text: string, options: StreamingTtsOptions = {}): Promise<void> {
    try {
      if (!this.apiKey) {
        throw new Error('Cartesia API key not configured');
      }

      const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      const startTime = new Date();
      logger.info(`[${requestId}] [${startTime.toISOString()}] Starting streaming TTS: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      
      // Default options optimized for PCM streaming (Linear16)
      const defaultOptions: StreamingTtsOptions = {
        modelId: this.modelId,
        voice: {
          mode: 'id',
          id: this.defaultVoiceId
        },
        language: 'en',
        outputFormat: {
          container: 'raw',
          sampleRate: 16000, // Match client-side expectation: 16kHz
          encoding: 'pcm_s16le' // 16-bit PCM, little-endian (Linear16)
        }
      };

      // Merge with user options
      const mergedOptions = { ...defaultOptions, ...options };
      
      // Create TTS streaming request using the SDK
      // @ts-ignore - Ignore type mismatch which we'll handle in the processing
      const stream = await this.client.tts.sse({
        modelId: mergedOptions.modelId || this.modelId,
        transcript: text,
        voice: mergedOptions.voice || {
          mode: 'id',
          id: this.defaultVoiceId
        },
        outputFormat: mergedOptions.outputFormat || {
          container: 'raw',
          sampleRate: 16000,
          encoding: 'pcm_s16le'
        },
        language: mergedOptions.language || 'en'
      });

      // Emit the stream start event
      this.emit('streamStart', { requestId, timestamp: new Date().toISOString() });
      
      let chunkCount = 0;
      let totalBytes = 0;
      
      // Process each chunk as it arrives
      for await (const chunk of stream) {
        // Handle the chunk based on what the API actually returns
        const audioData = (chunk as any)?.chunk?.audio || (chunk as any)?.audio;
        
        if (audioData) {
          chunkCount++;
          const audioChunk = Buffer.from(audioData);
          totalBytes += audioChunk.length;
          
          // Emit audio chunk event
          this.emit('audioChunk', { 
            audio: audioChunk, 
            chunkIndex: chunkCount,
            timestamp: new Date().toISOString(),
            requestId
          });
          
          logger.debug(`[${requestId}] Received audio chunk #${chunkCount}, size: ${audioChunk.length} bytes`);
        }
      }
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      logger.info(`[${requestId}] [${endTime.toISOString()}] Streaming TTS completed in ${duration}ms, received ${chunkCount} chunks, total ${totalBytes} bytes`);
      
      // Emit the stream end event
      this.emit('streamEnd', { 
        requestId, 
        duration, 
        chunkCount, 
        totalBytes,
        timestamp: endTime.toISOString() 
      });
      
    } catch (error) {
      const errorTime = new Date();
      logger.error(`[${errorTime.toISOString()}] Error streaming text to speech:`, error);
      
      // Emit the error event
      this.emit('streamError', { 
        error, 
        timestamp: errorTime.toISOString() 
      });
      
      throw new Error(`Streaming TTS failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}