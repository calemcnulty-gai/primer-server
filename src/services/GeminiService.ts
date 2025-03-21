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
   * Generate a response to the user's input using Gemini LLM
   * @param userInput The user's transcribed speech
   * @returns LLM-generated response
   */
  public async generateResponse(userInput: string): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not configured');
      }

      logger.info(`Generating response with Gemini: "${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}"`);
      
      // Create a conversation-style prompt
      const prompt = `User said: "${userInput}"
      
      Respond conversationally to what the user said. Keep your response concise and natural-sounding for speech.`;
      
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      
      logger.info(`Gemini response: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);
      
      return response;
    } catch (error) {
      logger.error('Error generating response with Gemini:', error);
      throw new Error(`LLM processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}