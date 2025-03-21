import { CartesiaClient } from '@cartesia/cartesia-js';
import { createLogger } from '../utils/logger';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

// Load environment variables
dotenv.config();

const logger = createLogger('CartesiaService');

type RawEncoding = 'pcm_f32le' | 'pcm_s16le' | 'pcm_mulaw' | 'pcm_alaw';
type SupportedLanguage = 'en' | 'fr' | 'de' | 'es' | 'pt' | 'zh' | 'ja' | 'hi' | 'it' | 'ko' | 'nl' | 'pl' | 'ru' | 'sv' | 'tr';

export interface StreamingTtsOptions {
  modelId?: string;
  voice?: {
    mode: 'id';
    id: string;
  };
  language?: SupportedLanguage;
  outputFormat?: {
    container: 'raw' | 'wav' | 'mp3';
    sampleRate: number;
    encoding?: RawEncoding;
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
      logger.info(`[${requestId}] Converting text to speech: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      
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
      const buffer = Buffer.from(audioArrayBuffer);
      
      // Log essential audio metadata
      this.logAudioMetadata(buffer, {
        container: 'mp3',
        sampleRate: 16000,
        bitRate: 128000
      });
      
      logger.info(`[${requestId}] Successfully converted text to speech in ${duration}ms, audio size: ${buffer.length} bytes`);
      
      // Convert ArrayBuffer to Buffer
      return buffer;
    } catch (error) {
      const errorTime = new Date();
      logger.error('Error converting text to speech:', error);
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
      logger.info(`[${requestId}] Starting streaming TTS: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      
      // Create base request object
      const ttsRequest: any = {
        modelId: options.modelId || this.modelId,
        transcript: text,
        voice: options.voice || {
          mode: 'id',
          id: this.defaultVoiceId
        },
        language: options.language || 'en'
      };
      
      // Add output format based on container type
      let outputFormat: any;
      
      if (options.outputFormat?.container === 'mp3') {
        outputFormat = {
          container: 'mp3',
          sampleRate: options.outputFormat.sampleRate || 16000,
          bitRate: options.outputFormat.bitRate || 128000
        };
      } else if (options.outputFormat?.container === 'wav') {
        outputFormat = {
          container: 'wav',
          encoding: options.outputFormat.encoding || 'pcm_s16le',
          sampleRate: options.outputFormat.sampleRate || 16000
        };
      } else {
        // Default to raw PCM
        outputFormat = {
          container: 'raw',
          encoding: options.outputFormat?.encoding || 'pcm_s16le',
          sampleRate: options.outputFormat?.sampleRate || 16000
        };
      }
      
      // Log chosen format
      logger.info(`[${requestId}] TTS format: ${JSON.stringify(outputFormat)}`);
      
      ttsRequest.outputFormat = outputFormat;
      
      // Create TTS streaming request using the SDK
      const stream = await this.client.tts.sse(ttsRequest);

      // Emit the stream start event
      this.emit('streamStart', { requestId, timestamp: new Date().toISOString() });
      
      let chunkCount = 0;
      let totalBytes = 0;
      let firstChunkTime = 0;
      let lastChunkTime = 0;
      
      // Process each chunk as it arrives
      for await (const chunk of stream) {
        // Handle the chunk based on what the API actually returns
        const audioData = (chunk as any)?.chunk?.audio || (chunk as any)?.audio;
        
        if (audioData) {
          chunkCount++;
          const now = Date.now();
          
          if (chunkCount === 1) {
            firstChunkTime = now;
          }
          lastChunkTime = now;
          
          const audioChunk = Buffer.from(audioData);
          totalBytes += audioChunk.length;
          
          // Emit audio chunk event
          this.emit('audioChunk', { 
            audio: audioChunk, 
            chunkIndex: chunkCount,
            timestamp: new Date().toISOString(),
            requestId,
            format: outputFormat
          });
          
          // Log every 5th chunk to reduce verbosity
          if (chunkCount === 1 || chunkCount % 5 === 0) {
            logger.info(`[${requestId}] Received audio chunk #${chunkCount}, size: ${audioChunk.length} bytes`);
          }
        }
      }
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // Calculate expected audio duration based on format
      const expectedDurationMs = this.calculateExpectedAudioDuration(totalBytes, outputFormat);
      
      // Calculate average chunk arrival rate
      let chunkRate = 0;
      if (chunkCount > 1 && lastChunkTime > firstChunkTime) {
        const streamingDuration = lastChunkTime - firstChunkTime;
        chunkRate = streamingDuration / (chunkCount - 1);
      }
      
      // Log audio summary information
      logger.info(`[${requestId}] Audio summary: Format=${outputFormat.container}, SampleRate=${outputFormat.sampleRate}Hz, Expected Duration=${expectedDurationMs.toFixed(0)}ms, Total Size=${totalBytes} bytes`);
      logger.info(`[${requestId}] Streaming stats: Chunks=${chunkCount}, Avg Chunk Size=${(totalBytes/chunkCount).toFixed(0)} bytes, Avg Chunk Interval=${chunkRate.toFixed(1)}ms`);
      logger.info(`[${requestId}] Streaming TTS completed in ${duration}ms (expected playback: ${expectedDurationMs.toFixed(0)}ms)`);
      
      // Emit the stream end event
      this.emit('streamEnd', { 
        requestId, 
        duration, 
        chunkCount, 
        totalBytes,
        timestamp: endTime.toISOString(),
        expectedAudioDuration: expectedDurationMs
      });
      
    } catch (error) {
      const errorTime = new Date();
      logger.error('Error streaming text to speech:', error);
      
      // Emit the error event
      this.emit('streamError', { 
        error, 
        timestamp: errorTime.toISOString() 
      });
      
      throw new Error(`Streaming TTS failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Calculate expected audio duration based on format and byte count
   * @param byteCount Total bytes of audio data
   * @param format Audio format information
   * @returns Expected duration in milliseconds
   */
  private calculateExpectedAudioDuration(byteCount: number, format: any): number {
    let durationMs = 0;
    
    if (format.container === 'raw') {
      // For raw PCM, duration depends on encoding
      // pcm_s16le = 2 bytes per sample, pcm_f32le = 4 bytes per sample
      const bytesPerSample = format.encoding === 'pcm_f32le' ? 4 : 2;
      const samplesCount = byteCount / bytesPerSample;
      durationMs = (samplesCount / format.sampleRate) * 1000;
    } else if (format.container === 'wav') {
      // WAV has headers, but we'll approximate
      const bytesPerSample = format.encoding === 'pcm_f32le' ? 4 : 2;
      // Subtract ~44 bytes for WAV header
      const samplesCount = (byteCount - 44) / bytesPerSample;
      durationMs = (samplesCount / format.sampleRate) * 1000;
    } else if (format.container === 'mp3') {
      // For MP3, we can estimate based on bitrate
      // Duration (seconds) = Bytes * 8 / bitRate
      durationMs = (byteCount * 8 / format.bitRate) * 1000;
    }
    
    return durationMs;
  }
  
  /**
   * Log essential audio metadata for debugging
   * @param audioBuffer Audio buffer to analyze
   * @param format Audio format information
   */
  private logAudioMetadata(audioBuffer: Buffer, format: any): void {
    // Calculate estimated duration
    const durationMs = this.calculateExpectedAudioDuration(audioBuffer.length, format);
    
    // Log just the essential info for debugging audio speed
    logger.info(`Audio metadata: Size=${audioBuffer.length} bytes, Format=${format.container}, SampleRate=${format.sampleRate}Hz, Duration=${durationMs.toFixed(0)}ms`);
  }
}