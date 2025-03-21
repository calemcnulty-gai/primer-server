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
   * Save audio data to file for debugging
   * @param audioData Audio buffer to save
   * @returns Path to saved file or null if saving failed
   */
  private saveAudioForDebug(audioData: Buffer): string | null {
    if (!this.debugMode) return null;
    
    try {
      // Generate a unique filename with timestamp and random string
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const randomId = crypto.randomBytes(4).toString('hex');
      const filename = `deepgram_audio_${timestamp}_${randomId}.pcm`;
      const filePath = path.join(this.debugDir, filename);
      
      // Write the audio buffer to file
      fs.writeFileSync(filePath, audioData);
      logger.info(`Saved audio sample to ${filePath} (${audioData.length} bytes)`);
      
      // Calculate and log audio duration (assuming 16kHz, 16-bit mono)
      const durationSeconds = audioData.length / (16000 * 2);
      logger.info(`Audio duration: ${durationSeconds.toFixed(2)} seconds (${(durationSeconds * 1000).toFixed(0)}ms)`);
      
      // Log first 32 bytes in hex for debugging
      const hex = audioData.slice(0, 32).toString('hex');
      logger.info(`First 32 bytes: ${hex.match(/../g)?.join(' ')}`);
      
      return filePath;
    } catch (error) {
      logger.error('Failed to save audio for debugging:', error);
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
    const durationMs = (samples / 16000) * 1000;
    
    // Calculate some basic audio stats
    let min = 0, max = 0, sumAbs = 0;
    let zeroCrossings = 0;
    let prevSample = 0;
    
    for (let i = 0; i < audioData.length; i += 2) {
      // Convert two bytes to a 16-bit sample (little-endian)
      const sample = audioData.readInt16LE(i);
      
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
      isSilence,
      possibleIssues: [
        isSilence ? "Audio appears to be silent or very quiet" : null,
        min > -100 && max < 100 ? "Extremely low amplitude - likely silence" : null,
        min === 0 && max === 0 ? "All zero values - invalid audio" : null
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
        logger.warn('Deepgram API key not configured, using mock transcription');
        // For testing without an API key, return a mock response
        return 'This is a simulated transcription for testing without an API key.';
      }
      
      // Debug info for audio format
      logger.info(`Transcribing audio with Deepgram: ${audioData.length} bytes`);
      
      // Save audio sample for debugging
      this.saveAudioForDebug(audioData);
      
      // Analyze audio for issues
      const analysis = this.analyzeAudio(audioData);
      logger.info(`Audio analysis: ${JSON.stringify(analysis, null, 2)}`);
      
      if (analysis.isSilence) {
        logger.warn(`Audio appears to be silent: ${analysis.avgDbFS}`);
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
      
      // For robustness in production, return a fallback rather than throwing
      return 'Sorry, I had trouble understanding that. Could you try again?';
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
      stream.close();
    }
  }
}