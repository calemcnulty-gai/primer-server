import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { 
  OpenAIConfig, 
  OpenAICompletionRequest, 
  OpenAICompletionResponse,
  OpenAIErrorResponse
} from '../../types/openai';

export class OpenAIService {
  private config: OpenAIConfig;
  private baseURL: string;

  constructor(config: OpenAIConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.config = config;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
  }

  async createCompletion(request: OpenAICompletionRequest): Promise<OpenAICompletionResponse> {
    try {
      const axiosConfig: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        timeout: this.config.timeout || 30000,
      };

      if (this.config.organization) {
        axiosConfig.headers = {
          ...axiosConfig.headers,
          'OpenAI-Organization': this.config.organization,
        };
      }

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        request,
        axiosConfig
      );

      return response.data as OpenAICompletionResponse;
    } catch (error) {
      // Check if it's an Axios error
      const axiosError = error as any;
      if (axiosError.isAxiosError && axiosError.response?.data) {
        const errorData = axiosError.response.data as OpenAIErrorResponse;
        throw new Error(`OpenAI API Error: ${errorData.error.message}`);
      } 
      
      // Re-throw other errors (network errors, timeouts, etc.)
      throw error;
    }
  }
} 