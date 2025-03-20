import axios from 'axios';
import { createLogger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('CartesiaService');

export class CartesiaService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.CARTESIA_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('CARTESIA_API_KEY not set in environment variables');
    }
    this.apiUrl = process.env.CARTESIA_API_URL || 'https://api.cartesia.ai/v1/text-to-speech';
  }

  /**
   * Convert text to speech using Cartesia
   * @param text Text to convert to speech
   * @returns Audio buffer
   */
  public async textToSpeech(text: string): Promise<Buffer> {
    try {
      if (!this.apiKey) {
        throw new Error('Cartesia API key not configured');
      }

      logger.info(`Converting text to speech: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      
      // Request parameters for Cartesia
      const requestData = {
        text,
        voice: 'en-US-Neural2-F', // Default voice, can be configurable
        format: 'webm',  // or 'mp3' depending on what works best with WebRTC
        speed: 1.0,
        pitch: 1.0
      };
      
      // Make request to Cartesia API
      const response = await axios.post(this.apiUrl, requestData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'audio/webm' // Match the format in the request
        },
        responseType: 'arraybuffer'
      });
      
      logger.info('Successfully converted text to speech');
      
      // Return the audio as a buffer
      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Error converting text to speech:', error);
      throw new Error(`Text-to-speech failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}