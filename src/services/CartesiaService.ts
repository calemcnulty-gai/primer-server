import { CartesiaClient } from '@cartesia/cartesia-js';
import { createLogger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('CartesiaService');

export class CartesiaService {
  private client: CartesiaClient;
  private apiKey: string;
  private modelId: string;
  private defaultVoiceId: string;

  constructor() {
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

      logger.info(`Converting text to speech: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      
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
          sampleRate: 24000,
          bitRate: 128000
        },
        language: 'en'
      });
      
      logger.info('Successfully converted text to speech');
      
      // Convert ArrayBuffer to Buffer
      return Buffer.from(audioArrayBuffer);
    } catch (error) {
      logger.error('Error converting text to speech:', error);
      throw new Error(`Text-to-speech failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}