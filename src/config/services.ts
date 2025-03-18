import { OpenAIService } from '../services/openai';

// Default model to use for OpenAI completions
export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4';

// Initialize OpenAI service
let _openaiService: OpenAIService | null = null;

export function getOpenAIService(): OpenAIService {
  if (!_openaiService) {
    _openaiService = new OpenAIService({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
  }
  return _openaiService;
}

// For backward compatibility
export const openaiService = getOpenAIService();

// Validate API keys
export function validateApiKeys() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Warning: OPENAI_API_KEY is not set in environment variables.');
  }
} 