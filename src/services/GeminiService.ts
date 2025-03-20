import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('GeminiService');

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('GEMINI_API_KEY not set in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  }

  /**
   * Process user input through Gemini LLM
   * @param userInput The user's transcribed speech
   * @returns LLM-generated response
   */
  public async processText(userInput: string): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not configured');
      }

      logger.info(`Processing text with Gemini: "${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}"`);
      
      // For the echo server, we'll add a simple response wrapper
      // In a more complex implementation, you'd have proper prompting
      const prompt = `User said: "${userInput}"
      
      For this echo service, respond briefly to what the user said. Keep your response under 30 words.`;
      
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      
      logger.info(`Gemini response: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);
      
      return response;
    } catch (error) {
      logger.error('Error processing text with Gemini:', error);
      throw new Error(`LLM processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}