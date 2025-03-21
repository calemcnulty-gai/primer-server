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
      const buffer = Buffer.from(audioArrayBuffer);
      
      // Log audio metadata
      this.logAudioMetadata(buffer, {
        container: 'mp3',
        sampleRate: 16000,
        bitRate: 128000
      }, 'Non-streaming TTS');
      
      logger.info(`[${requestId}] [${endTime.toISOString()}] Successfully converted text to speech in ${duration}ms, audio size: ${audioArrayBuffer.byteLength} bytes`);
      
      // Convert ArrayBuffer to Buffer
      return buffer;
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
      const chunkStartTimes: number[] = [];
      
      // Process each chunk as it arrives
      for await (const chunk of stream) {
        // Handle the chunk based on what the API actually returns
        const audioData = (chunk as any)?.chunk?.audio || (chunk as any)?.audio;
        
        if (audioData) {
          chunkCount++;
          const chunkReceiveTime = Date.now();
          chunkStartTimes.push(chunkReceiveTime);
          
          const audioChunk = Buffer.from(audioData);
          totalBytes += audioChunk.length;
          
          // Calculate inter-chunk timing if we have more than one chunk
          if (chunkCount > 1) {
            const timeSinceLastChunk = chunkReceiveTime - chunkStartTimes[chunkCount - 2];
            logger.debug(`[${requestId}] Chunk #${chunkCount} received ${timeSinceLastChunk}ms after previous chunk`);
          }
          
          // Log audio metadata for this chunk
          this.logAudioMetadata(audioChunk, outputFormat, `Chunk #${chunkCount}`);
          
          // Emit audio chunk event
          this.emit('audioChunk', { 
            audio: audioChunk, 
            chunkIndex: chunkCount,
            timestamp: new Date().toISOString(),
            requestId,
            format: outputFormat
          });
          
          logger.debug(`[${requestId}] Received audio chunk #${chunkCount}, size: ${audioChunk.length} bytes`);
        }
      }
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // Calculate average chunk timing
      if (chunkCount > 1) {
        const totalTime = chunkStartTimes[chunkCount - 1] - chunkStartTimes[0];
        const avgChunkInterval = totalTime / (chunkCount - 1);
        logger.info(`[${requestId}] Average chunk interval: ${avgChunkInterval.toFixed(2)}ms`);
      }
      
      // Calculate expected audio duration based on format
      const expectedDurationMs = this.calculateExpectedAudioDuration(totalBytes, outputFormat);
      logger.info(`[${requestId}] Expected audio duration: ${expectedDurationMs.toFixed(2)}ms for ${totalBytes} bytes`);
      
      logger.info(`[${requestId}] [${endTime.toISOString()}] Streaming TTS completed in ${duration}ms, received ${chunkCount} chunks, total ${totalBytes} bytes`);
      
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
      logger.error(`[${errorTime.toISOString()}] Error streaming text to speech:`, error);
      
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
   * Log detailed audio metadata for debugging
   * @param audioBuffer Audio buffer to analyze
   * @param format Format information
   * @param source Source identifier (e.g., "Chunk #1")
   */
  private logAudioMetadata(audioBuffer: Buffer, format: any, source: string): void {
    // Basic metadata
    logger.info(`[AUDIO_METADATA] ${source} - Size: ${audioBuffer.length} bytes, Format: ${format.container}, Sample Rate: ${format.sampleRate}Hz`);
    
    if (format.container === 'raw' || format.container === 'wav') {
      logger.info(`[AUDIO_METADATA] ${source} - Encoding: ${format.encoding}`);
      
      // Additional PCM analysis for Raw and WAV
      if (format.encoding === 'pcm_s16le' && audioBuffer.length >= 100) {
        // Analyze first 50 samples (100 bytes for 16-bit)
        let samples = [];
        const offset = format.container === 'wav' ? 44 : 0; // Skip WAV header if needed
        for (let i = offset; i < Math.min(offset + 100, audioBuffer.length); i += 2) {
          samples.push(audioBuffer.readInt16LE(i));
        }
        
        // Calculate simple statistics
        const max = Math.max(...samples);
        const min = Math.min(...samples);
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        
        // Count zero crossings (rough frequency estimate)
        let crossings = 0;
        for (let i = 1; i < samples.length; i++) {
          if ((samples[i-1] < 0 && samples[i] >= 0) || (samples[i-1] >= 0 && samples[i] < 0)) {
            crossings++;
          }
        }
        
        logger.info(`[AUDIO_METADATA] ${source} - Sample analysis: Max: ${max}, Min: ${min}, Avg: ${avg.toFixed(2)}, Zero crossings: ${crossings}`);
      }
    } else if (format.container === 'mp3') {
      logger.info(`[AUDIO_METADATA] ${source} - Bit Rate: ${format.bitRate}bps`);
      
      // Look for MP3 frame headers (rough analysis)
      if (audioBuffer.length >= 100) {
        let frameCount = 0;
        for (let i = 0; i < audioBuffer.length - 2; i++) {
          // MP3 frames often start with 0xFF 0xFB (MPEG1 Layer 3)
          if (audioBuffer[i] === 0xFF && (audioBuffer[i+1] & 0xE0) === 0xE0) {
            frameCount++;
          }
        }
        logger.info(`[AUDIO_METADATA] ${source} - Detected ~${frameCount} possible MP3 frames`);
      }
    }
    
    // Calculate estimated duration
    const durationMs = this.calculateExpectedAudioDuration(audioBuffer.length, format);
    logger.info(`[AUDIO_METADATA] ${source} - Estimated duration: ${durationMs.toFixed(2)}ms`);
  }
}