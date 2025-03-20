import axios from 'axios';
import { createLogger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('DeepgramService');

export class DeepgramService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('DEEPGRAM_API_KEY not set in environment variables');
    }
    this.apiUrl = 'https://api.deepgram.com/v1/listen';
  }

  /**
   * Transcribe audio data to text
   * @param audioData Audio buffer to transcribe
   * @returns Transcribed text
   */
  public async transcribeAudio(audioData: Buffer): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error('Deepgram API key not configured');
      }

      logger.info('Transcribing audio with Deepgram');
      
      // Send audio to Deepgram for transcription
      const response = await axios.post(
        `${this.apiUrl}?model=nova-2&smart_format=true&language=en-US`,
        audioData,
        {
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'audio/webm',
          },
        }
      );

      // Get the transcript from the response
      const transcript = response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      logger.info(`Transcription result: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
      
      return transcript;
    } catch (error) {
      logger.error('Error transcribing audio:', error);
      throw new Error(`Speech-to-text failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}