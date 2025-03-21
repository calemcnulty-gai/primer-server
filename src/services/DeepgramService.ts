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
        logger.warn('Deepgram API key not configured, using mock transcription');
        // For testing without an API key, return a mock response
        return 'This is a simulated transcription for testing without an API key.';
      }
      
      // Debug info for audio format
      logger.info(`Transcribing audio with Deepgram: ${audioData.length} bytes`);
      logger.info(`Audio data header: ${audioData.slice(0, 20).toString('hex')}`);
      
      // WebRTC audio is typically raw PCM (or Opus in WebM container)
      // Adjust content type and parameters for the expected audio format
      const contentType = 'audio/webm';
      
      // Trying to determine if we're dealing with raw PCM or a container format
      let encoding = '';
      if (audioData[0] === 0x52 && audioData[1] === 0x49 && audioData[2] === 0x46 && audioData[3] === 0x46) {
        // RIFF header - likely WAV
        logger.info('Detected possible WAV format in audio data');
        encoding = '&encoding=linear16';
      } else if (audioData[0] === 0x1A && audioData[1] === 0x45 && audioData[2] === 0xDF && audioData[3] === 0xA3) {
        // EBML header - likely WebM
        logger.info('Detected possible WebM format in audio data');
        encoding = '&encoding=webm';
      } else {
        // Assume raw PCM for other formats
        logger.info('No container format detected, treating as raw PCM');
        encoding = '&encoding=linear16&sample_rate=48000';
      }
      
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
      logger.info(`Deepgram response type: ${typeof response.data}`);
      
      // Get the transcript from the response
      const transcript = response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      logger.info(`Transcription result: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
      
      // If no transcript was generated but the API call was successful
      if (transcript === '') {
        logger.warn('Deepgram returned empty transcript, using fallback text');
        return 'I heard something but couldn\'t make out the words. Could you speak louder or more clearly?';
      }
      
      return transcript;
    } catch (error) {
      logger.error('Error transcribing audio:', error);
      
      // For robustness in production, return a fallback rather than throwing
      return 'Sorry, I had trouble understanding that. Could you try again?';
    }
  }
}