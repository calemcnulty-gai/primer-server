import axios from 'axios';
import { createLogger } from '../utils/logger';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const logger = createLogger('DeepgramService');

export interface DeepgramStreamingOptions {
  language?: string;
  model?: string;
  smartFormat?: boolean;
  interimResults?: boolean;
  encoding?: string;
  sampleRate?: number;
  channels?: number;
}

export class DeepgramService extends EventEmitter {
  private apiKey: string;
  private apiUrl: string;
  private streamingUrl: string;
  private debugMode: boolean;
  private debugDir: string;
  private audioBuffer: Buffer | null = null;
  private bufferSize: number = 0;
  private minDurationForSave: number = 2000; // 2 seconds in ms
  private sampleRate: number = 16000;
  private channels: number = 1;
  private bytesPerSample: number = 2;  // 16-bit PCM
  
  constructor() {
    super();
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('DEEPGRAM_API_KEY not set in environment variables');
    }
    this.apiUrl = 'https://api.deepgram.com/v1/listen';
    this.streamingUrl = 'wss://api.deepgram.com/v1/listen';
    
    // Enable debug mode (can set to false in production)
    this.debugMode = process.env.DEBUG_DEEPGRAM === 'true' || true;
    this.debugDir = path.join(process.cwd(), 'debug_audio');
    
    // Create debug directory if it doesn't exist
    if (this.debugMode) {
      try {
        if (!fs.existsSync(this.debugDir)) {
          fs.mkdirSync(this.debugDir, { recursive: true });
          logger.info(`Created debug directory at ${this.debugDir}`);
        }
      } catch (error) {
        logger.error('Failed to create debug directory:', error);
        this.debugMode = false;
      }
    }
  }

  /**
   * Convert PCM data to WAV format with proper headers
   * @param pcmData PCM audio buffer (16-bit, little-endian)
   * @param sampleRate Sample rate in Hz (default: 16000)
   * @param channels Number of channels (default: 1)
   * @returns WAV formatted buffer
   */
  private pcmToWav(pcmData: Buffer, sampleRate: number = 16000, channels: number = 1): Buffer {
    // WAV header is 44 bytes
    const headerSize = 44;
    const dataSize = pcmData.length;
    const fileSize = headerSize + dataSize;
    const wavBuffer = Buffer.alloc(fileSize);
    
    // Write WAV header
    // RIFF header
    wavBuffer.write('RIFF', 0);                                // ChunkID
    wavBuffer.writeUInt32LE(fileSize - 8, 4);                  // ChunkSize
    wavBuffer.write('WAVE', 8);                                // Format
    
    // fmt sub-chunk
    wavBuffer.write('fmt ', 12);                               // Subchunk1ID
    wavBuffer.writeUInt32LE(16, 16);                           // Subchunk1Size (16 for PCM)
    wavBuffer.writeUInt16LE(1, 20);                            // AudioFormat (1 for PCM)
    wavBuffer.writeUInt16LE(channels, 22);                     // NumChannels
    wavBuffer.writeUInt32LE(sampleRate, 24);                   // SampleRate
    wavBuffer.writeUInt32LE(sampleRate * channels * 2, 28);    // ByteRate (SampleRate * NumChannels * BytesPerSample)
    wavBuffer.writeUInt16LE(channels * 2, 32);                 // BlockAlign (NumChannels * BytesPerSample)
    wavBuffer.writeUInt16LE(16, 34);                           // BitsPerSample
    
    // data sub-chunk
    wavBuffer.write('data', 36);                               // Subchunk2ID
    wavBuffer.writeUInt32LE(dataSize, 40);                     // Subchunk2Size
    
    // Copy PCM data
    pcmData.copy(wavBuffer, headerSize);
    
    return wavBuffer;
  }

  /**
   * Calculate the duration of PCM audio in milliseconds
   * @param pcmData PCM audio buffer
   * @param bytesPerSample Bytes per sample (2 for 16-bit)
   * @param sampleRate Sample rate in Hz
   * @param channels Number of channels
   * @returns Duration in milliseconds
   */
  private calculatePcmDuration(
    pcmData: Buffer, 
    bytesPerSample: number = 2,
    sampleRate: number = 16000,
    channels: number = 1
  ): number {
    const samples = pcmData.length / (bytesPerSample * channels);
    return (samples / sampleRate) * 1000;
  }

  /**
   * Add audio data to the buffer and save if threshold is reached
   * @param audioData New audio data to buffer
   * @param forceWrite Force write to disk even if below threshold
   * @returns Path to saved file or null
   */
  private bufferAudioForDebug(audioData: Buffer, forceWrite: boolean = false): string | null {
    if (!this.debugMode) return null;
    
    try {
      // Initialize buffer if needed
      if (!this.audioBuffer) {
        this.audioBuffer = audioData;
        this.bufferSize = audioData.length;
      } else {
        // Append to existing buffer
        const newBuffer = Buffer.alloc(this.bufferSize + audioData.length);
        this.audioBuffer.copy(newBuffer, 0);
        audioData.copy(newBuffer, this.bufferSize);
        this.audioBuffer = newBuffer;
        this.bufferSize += audioData.length;
      }
      
      // Calculate current buffer duration
      const bufferDuration = this.calculatePcmDuration(
        this.audioBuffer, 
        this.bytesPerSample,
        this.sampleRate,
        this.channels
      );
      
      logger.debug(`Audio buffer: ${this.bufferSize} bytes, ${bufferDuration.toFixed(1)}ms`);
      
      // Save to disk if exceeds minimum duration or force write
      if (bufferDuration >= this.minDurationForSave || forceWrite) {
        // Generate a unique filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomId = crypto.randomBytes(4).toString('hex');
        const filename = `deepgram_audio_${timestamp}_${randomId}.wav`;
        const filePath = path.join(this.debugDir, filename);
        
        // Convert PCM to WAV
        const wavBuffer = this.pcmToWav(this.audioBuffer, this.sampleRate, this.channels);
        
        // Write to file
        fs.writeFileSync(filePath, wavBuffer);
        
        logger.info(`Saved audio sample to ${filePath} (${this.bufferSize} bytes PCM, ${bufferDuration.toFixed(1)}ms)`);
        
        // Analyze first 32 bytes of PCM data
        if (this.audioBuffer.length >= 32) {
          const hex = this.audioBuffer.slice(0, 32).toString('hex');
          logger.info(`First 32 bytes of PCM: ${hex.match(/../g)?.join(' ')}`);
        }
        
        // Reset buffer
        this.audioBuffer = null;
        this.bufferSize = 0;
        
        return filePath;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to buffer audio for debugging:', error);
      this.audioBuffer = null;
      this.bufferSize = 0;
      return null;
    }
  }

  /**
   * Analyze audio buffer for diagnostic information
   * @param audioData Audio buffer to analyze
   * @returns Details about the audio data
   */
  private analyzeAudio(audioData: Buffer): any {
    if (audioData.length < 100) {
      return { valid: false, reason: 'Buffer too small' };
    }
    
    // Assuming 16-bit PCM (linear16)
    const samples = audioData.length / 2;
    const durationMs = (samples / this.sampleRate) * 1000;
    
    // Calculate some basic audio stats
    let min = 0, max = 0, sumAbs = 0;
    let zeroCrossings = 0;
    let prevSample = 0;
    let zeroCount = 0;
    let nonZeroSamplesCount = 0;
    
    for (let i = 0; i < audioData.length; i += 2) {
      // Convert two bytes to a 16-bit sample (little-endian)
      const sample = audioData.readInt16LE(i);
      
      // Track zero vs non-zero
      if (sample === 0) {
        zeroCount++;
      } else {
        nonZeroSamplesCount++;
      }
      
      // Update stats
      min = Math.min(min, sample);
      max = Math.max(max, sample);
      sumAbs += Math.abs(sample);
      
      // Count zero crossings (sign changes)
      if ((prevSample >= 0 && sample < 0) || (prevSample < 0 && sample >= 0)) {
        zeroCrossings++;
      }
      prevSample = sample;
    }
    
    const avgAbs = sumAbs / samples;
    const avgDbFS = 20 * Math.log10(avgAbs / 32768); // Reference level is 16-bit max
    
    // Check for potential silence (very low amplitude)
    const isSilence = avgDbFS < -45; // -45 dBFS is very quiet
    const isAllZeros = zeroCount === samples;
    const zeroPercentage = (zeroCount / samples) * 100;
    
    return {
      valid: true,
      samples,
      durationMs,
      minSample: min,
      maxSample: max,
      avgAbs,
      avgDbFS: avgDbFS.toFixed(2) + " dBFS",
      zeroCrossings,
      zeroCrossingRate: (zeroCrossings / (durationMs / 1000)).toFixed(2) + " Hz",
      zeroSamples: zeroCount,
      zeroPercentage: zeroPercentage.toFixed(1) + "%",
      isSilence,
      isAllZeros,
      possibleIssues: [
        isSilence ? "Audio appears to be silent or very quiet" : null,
        min > -100 && max < 100 ? "Extremely low amplitude - likely silence" : null,
        zeroPercentage > 50 ? `High percentage of zero samples (${zeroPercentage.toFixed(1)}%)` : null,
        isAllZeros ? "All samples are zero - invalid audio" : null
      ].filter(Boolean)
    };
  }

  /**
   * Transcribe audio data to text (non-streaming method)
   * @param audioData Audio buffer to transcribe
   * @returns Transcribed text
   */
  public async transcribeAudio(audioData: Buffer): Promise<string> {
    try {
      if (!this.apiKey) {
        logger.error('Deepgram API key not configured');
        throw new Error('Deepgram API key not configured');
      }
      
      // Debug info for audio format
      logger.info(`Transcribing audio with Deepgram: ${audioData.length} bytes`);
      
      // Save audio sample for debugging - force write to ensure we capture this sample
      this.bufferAudioForDebug(audioData, true);
      
      // Analyze audio for issues
      const analysis = this.analyzeAudio(audioData);
      logger.info(`Audio analysis: ${JSON.stringify(analysis, null, 2)}`);
      
      if (analysis.isSilence) {
        logger.warn(`Audio appears to be silent: ${analysis.avgDbFS}`);
      }
      
      if (analysis.isAllZeros) {
        logger.error(`Audio contains all zeros - completely invalid`);
        return 'I couldn\'t hear anything. Please check your microphone.';
      }
      
      // Optimize for PCM audio (linear16)
      // Consistently use 16kHz, mono, 16-bit PCM to match client settings
      const encoding = '&encoding=linear16&sample_rate=16000&channels=1';
      const contentType = 'audio/L16; rate=16000';
      
      // Send audio to Deepgram for transcription
      const response = await axios.post(
        `${this.apiUrl}?model=nova-2&smart_format=true&language=en-US${encoding}`,
        audioData,
        {
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': contentType,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      // Log the raw response for debugging
      logger.info(`Deepgram response status: ${response.status}`);
      logger.debug(`Deepgram full response: ${JSON.stringify(response.data)}`);
      
      // Get the transcript from the response
      const transcript = response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      logger.info(`Transcription result: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
      
      // If no transcript was generated but the API call was successful
      if (transcript === '') {
        const confidence = response.data?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;
        logger.warn(`Deepgram returned empty transcript with confidence: ${confidence}`);
        
        if (analysis.isSilence) {
          return 'I didn\'t hear anything. Please speak into your microphone.';
        } else {
          return 'I heard something but couldn\'t make out the words. Could you speak louder or more clearly?';
        }
      }
      
      return transcript;
    } catch (error) {
      logger.error('Error transcribing audio:', error);
      if (error.response?.data) {
        logger.error('Deepgram error response:', error.response.data);
      }
      
      // Throw the error instead of returning a fallback response
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a streaming connection to Deepgram for real-time transcription
   * @param options Streaming options
   * @returns WebSocket connection
   */
  public createStream(options: DeepgramStreamingOptions = {}): WebSocket {
    // Create options object with sensible defaults
    // Optimized for PCM audio (linear16) at 16kHz to match client settings
    const defaultOptions: DeepgramStreamingOptions = {
      language: 'en-US',
      model: 'nova-2',
      smartFormat: true,
      interimResults: true,
      encoding: 'linear16',
      sampleRate: 16000,  // Match client-side: 16kHz
      channels: 1
    };

    const mergedOptions = { ...defaultOptions, ...options };
    
    // Store sample rate and channels for buffer calculations
    this.sampleRate = mergedOptions.sampleRate || 16000;
    this.channels = mergedOptions.channels || 1;
    
    // Build query parameters
    const params = new URLSearchParams({
      language: mergedOptions.language || 'en-US',
      model: mergedOptions.model || 'nova-2', 
      smart_format: String(mergedOptions.smartFormat || true),
      interim_results: String(mergedOptions.interimResults || true),
    });

    if (mergedOptions.encoding) {
      params.append('encoding', mergedOptions.encoding);
    }
    
    if (mergedOptions.sampleRate) {
      params.append('sample_rate', String(mergedOptions.sampleRate));
    }
    
    if (mergedOptions.channels) {
      params.append('channels', String(mergedOptions.channels));
    }

    const url = `${this.streamingUrl}?${params.toString()}`;
    logger.info(`Creating Deepgram streaming connection: ${url}`);

    // Create WebSocket connection
    const socket = new WebSocket(url, {
      headers: {
        Authorization: `Token ${this.apiKey}`,
      },
    });

    // Set up event handlers
    socket.on('open', () => {
      logger.info('Deepgram WebSocket connection established');
      this.emit('streamOpen', socket);
    });

    socket.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        
        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript || '';
          const isFinal = response.is_final || false;
          
          logger.debug(`Transcript ${isFinal ? '(final)' : '(interim)'}: ${transcript}`);
          
          this.emit('transcription', {
            transcript,
            isFinal,
            rawResponse: response
          });
        }
      } catch (err) {
        logger.error('Error parsing Deepgram message:', err);
      }
    });

    socket.on('error', (error) => {
      logger.error('Deepgram WebSocket error:', error);
      this.emit('streamError', error);
    });

    socket.on('close', (code, reason) => {
      logger.info(`Deepgram WebSocket closed: ${code} - ${reason}`);
      
      // Write any remaining buffered audio to disk
      if (this.audioBuffer && this.bufferSize > 0) {
        this.bufferAudioForDebug(Buffer.alloc(0), true);
      }
      
      this.emit('streamClose', { code, reason });
    });

    return socket;
  }

  /**
   * Send audio data to an active Deepgram stream
   * @param stream WebSocket stream from createStream
   * @param audioData Audio buffer to send
   */
  public sendAudioToStream(stream: WebSocket, audioData: Buffer): void {
    if (stream.readyState !== WebSocket.OPEN) {
      logger.warn('Attempted to send audio to closed Deepgram stream');
      return;
    }
    
    // Buffer audio for debugging
    this.bufferAudioForDebug(audioData);

    try {
      stream.send(audioData);
    } catch (error) {
      logger.error('Error sending audio to Deepgram stream:', error);
      this.emit('streamError', error);
    }
  }

  /**
   * Close an active Deepgram stream
   * @param stream WebSocket stream to close
   */
  public closeStream(stream: WebSocket): void {
    if (stream.readyState === WebSocket.OPEN || stream.readyState === WebSocket.CONNECTING) {
      logger.info('Closing Deepgram stream');
      
      // Write any remaining buffered audio to disk
      if (this.audioBuffer && this.bufferSize > 0) {
        this.bufferAudioForDebug(Buffer.alloc(0), true);
      }
      
      stream.close();
    }
  }
}