import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { StoryChoice } from '../models/StoryState';
import crypto from 'crypto';

interface GenerateStorySegmentParams {
  prompt: string;
  context: Record<string, any>;
}

interface StreamStorySegmentParams {
  prompt: string;
  context: Record<string, any>;
  onChunk: (chunk: string) => void;
}

interface GenerateStoryChoicesParams {
  currentSegment: string;
  context: Record<string, any>;
  numChoices: number;
}

interface ConstructPromptParams {
  instruction: string;
  context?: Record<string, any>;
}

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: string;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
}

interface OpenAIErrorResponse {
  error?: {
    message?: string;
    type?: string;
  }
}

// Cache interfaces
interface CacheEntry<T> {
  content: T;
  timestamp: number;
  expiresAt: number;
}

export class GPTClient {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private contentCache: Map<string, CacheEntry<string>> = new Map();
  private choicesCache: Map<string, CacheEntry<StoryChoice[]>> = new Map();
  private cacheTTL: number = 3600000; // 1 hour in milliseconds
  
  constructor(
    apiKey: string, 
    model: string = 'gpt-4', 
    apiUrl: string = 'https://api.openai.com/v1/chat/completions',
    cacheTTL: number = 3600000
  ) {
    this.apiKey = apiKey;
    // Always use the env var model if available, otherwise use the passed model
    const envModel = process.env.OPENAI_MODEL;
    this.model = envModel || model;
    this.apiUrl = apiUrl;
    this.cacheTTL = cacheTTL;
    console.log(`[GPTClient] Initialized with model: ${this.model} (env var OPENAI_MODEL=${process.env.OPENAI_MODEL || 'not set'})`);
  }
  
  async generateStorySegment(params: GenerateStorySegmentParams): Promise<string> {
    const startTime = Date.now();
    console.log(`[GPTClient] Starting generateStorySegment`);
    
    const { prompt, context = {} } = params;
    const cacheKey = this.generateCacheKey(prompt, context);
    
    // Check cache first
    const cachedContent = this.contentCache.get(cacheKey);
    if (cachedContent && cachedContent.expiresAt > Date.now()) {
      console.log(`[GPTClient] Using cached story segment (cached ${Date.now() - cachedContent.timestamp}ms ago)`);
      console.log(`[GPTClient] generateStorySegment completed in ${Date.now() - startTime}ms (from cache)`);
      return cachedContent.content;
    }
    
    console.log(`[GPTClient] No cached content found, generating new content`);
    
    // Generate prompt with context
    const promptStart = Date.now();
    const finalPrompt = this.constructPrompt({
      instruction: prompt,
      context
    });
    console.log(`[GPTClient] Prompt construction completed in ${Date.now() - promptStart}ms`);
    
    // Prepare messages for API call
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: 'You are a creative writing assistant.' },
      { role: 'user', content: finalPrompt }
    ];
    
    try {
      // Make API call
      console.log(`[GPTClient] Starting API call to ${this.model}`);
      const apiCallStart = Date.now();
      const response = await this.callChatCompletionAPI(messages, context.userId || 'system');
      console.log(`[GPTClient] API call completed in ${Date.now() - apiCallStart}ms`);
      
      // Extract and validate the story text
      if (!response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('Invalid response from GPT API');
      }
      
      const storyText = response.choices[0].message.content.trim();
      const responseLength = storyText.length;
      console.log(`[GPTClient] Received story text of ${responseLength} characters`);
      
      // Cache the result
      this.contentCache.set(cacheKey, {
        content: storyText,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.cacheTTL
      });
      console.log(`[GPTClient] Content cached with key: ${cacheKey.substring(0, 8)}...`);
      
      console.log(`[GPTClient] generateStorySegment completed in ${Date.now() - startTime}ms`);
      return storyText;
    } catch (error: any) {
      console.error(`[GPTClient] Error in generateStorySegment (${Date.now() - startTime}ms):`, error);
      
      if (error.message === 'Invalid response from GPT API') {
        throw error; // Rethrow specific validation errors
      }
      this.handleApiError(error);
    }
  }
  
  async generateStoryChoices(params: GenerateStoryChoicesParams): Promise<StoryChoice[]> {
    const startTime = Date.now();
    console.log(`[GPTClient] Starting generateStoryChoices`);
    
    // Generate a cache key based on the segment and context
    const cacheKey = this.generateCacheKey(params.currentSegment, params.context);
    
    // Check if we have a cached response
    const cachedChoices = this.choicesCache.get(cacheKey);
    if (cachedChoices && cachedChoices.expiresAt > Date.now()) {
      console.log(`[GPTClient] Using cached story choices (cached ${Date.now() - cachedChoices.timestamp}ms ago)`);
      console.log(`[GPTClient] generateStoryChoices completed in ${Date.now() - startTime}ms (from cache)`);
      return cachedChoices.content;
    }
    
    console.log(`[GPTClient] No cached choices found, generating new choices`);
    
    try {
      const promptStart = Date.now();
      const messages: ChatCompletionMessage[] = [
        {
          role: 'system',
          content: `You are a creative storyteller. Generate exactly ${params.numChoices} choices for an interactive narrative. 
                    IMPORTANT: Return ONLY raw JSON without any markdown formatting, code blocks, or explanations.
                    Return a valid JSON array of choice objects, each with 'id', 'text', and 'nextSegmentId' properties.
                    Example response format: [{"id":"choice1","text":"Go left","nextSegmentId":"left_path"}]`
        },
        {
          role: 'user',
          content: this.constructPrompt({
            instruction: `Based on the following story segment, generate ${params.numChoices} interesting choices for the reader:
                        ${params.currentSegment}`,
            context: params.context
          })
        }
      ];
      console.log(`[GPTClient] Messages prepared in ${Date.now() - promptStart}ms`);
      
      console.log(`[GPTClient] Starting API call to ${this.model} for choices`);
      const apiCallStart = Date.now();
      const response = await this.callChatCompletionAPI(messages);
      console.log(`[GPTClient] API call for choices completed in ${Date.now() - apiCallStart}ms`);
      
      if (!response.choices || response.choices.length === 0) {
        throw new Error('Invalid response from GPT API');
      }
      
      try {
        console.log(`[GPTClient] Parsing choices JSON response`);
        const parseStart = Date.now();
        
        // Extract the JSON content from potential markdown code blocks
        let contentToProcess = response.choices[0].message.content.trim();
        
        // If content is wrapped in markdown code blocks (```json ... ```), extract the JSON
        if (contentToProcess.startsWith('```')) {
          // Find the first ``` and the last ```
          const startJsonIndex = contentToProcess.indexOf('\n') + 1;
          const endJsonIndex = contentToProcess.lastIndexOf('```');
          
          if (startJsonIndex > 0 && endJsonIndex > startJsonIndex) {
            contentToProcess = contentToProcess.substring(startJsonIndex, endJsonIndex).trim();
          }
        }
        
        const choices = JSON.parse(contentToProcess) as StoryChoice[];
        
        // Validate the parsed data has the expected structure
        if (!Array.isArray(choices)) {
          throw new Error('GPT API response is not a valid array');
        }
        
        // Validate each choice has the required properties
        for (const choice of choices) {
          if (!choice.id || !choice.text || !choice.nextSegmentId) {
            throw new Error('GPT API response contains invalid choice objects');
          }
        }
        
        console.log(`[GPTClient] JSON parsing completed in ${Date.now() - parseStart}ms, found ${choices.length} choices`);
        
        // Cache the response
        this.choicesCache.set(cacheKey, {
          content: choices,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.cacheTTL
        });
        console.log(`[GPTClient] Choices cached with key: ${cacheKey.substring(0, 8)}...`);
        
        console.log(`[GPTClient] generateStoryChoices completed in ${Date.now() - startTime}ms`);
        return choices;
      } catch (parseError) {
        const responseContent = response.choices[0].message.content;
        console.error(`[GPTClient] JSON parsing error: ${parseError}`);
        console.error(`[GPTClient] Raw response content: ${responseContent.substring(0, 100)}...`);
        throw new Error('Failed to parse GPT API response as JSON');
      }
    } catch (error) {
      console.error(`[GPTClient] Error in generateStoryChoices (${Date.now() - startTime}ms):`, error);
      this.handleApiError(error);
    }
  }
  
  constructPrompt(params: ConstructPromptParams): string {
    let prompt = params.instruction;
    
    // Add user context information
    if (params.context && Object.keys(params.context).length > 0) {
      // Extract specific context values that are important for storytelling
      const storyContext: Record<string, any> = {};
      
      // User identity and preferences
      if (params.context.userId) storyContext.userId = params.context.userId;
      if (params.context.character) {
        storyContext.character = params.context.character;
      } else if (params.context.character_name) {
        storyContext.character_name = params.context.character_name;
      }
      if (params.context.age) storyContext.age = params.context.age;
      
      // Story context and history
      if (params.context.previousSegment) storyContext.previousSegment = params.context.previousSegment;
      if (params.context.choice) storyContext.lastChoice = params.context.choice;
      if (params.context.choiceHistory) storyContext.choiceHistory = params.context.choiceHistory;
      
      // Story style preferences
      if (params.context.tone) storyContext.tone = params.context.tone;
      if (params.context.audience) storyContext.audience = params.context.audience;
      if (params.context.genre) storyContext.genre = params.context.genre;
      
      // Location and setting
      if (params.context.setting) storyContext.setting = params.context.setting;
      if (params.context.location) storyContext.location = params.context.location;
      
      // Format specific context as part of the prompt
      prompt += '\n\nContext:';
      
      for (const key of Object.keys(storyContext)) {
        // Format complex objects more readably
        const value = typeof storyContext[key] === 'object' 
          ? JSON.stringify(storyContext[key], null, 2)
          : storyContext[key];
        
        prompt += `\n${key}: ${value}`;
      }
      
      // Add any remaining context parameters
      const extraContext = { ...params.context };
      for (const key of Object.keys(storyContext)) {
        delete extraContext[key];
      }
      
      if (Object.keys(extraContext).length > 0) {
        prompt += '\n\nAdditional context:';
        for (const key of Object.keys(extraContext)) {
          // Skip complex objects to keep prompt concise
          if (typeof extraContext[key] !== 'object') {
            prompt += `\n${key}: ${extraContext[key]}`;
          }
        }
      }
    }
    
    // Add instructions for formatting and style
    prompt += '\n\nInstructions:';
    prompt += '\n- Create engaging, descriptive content appropriate for the audience.';
    prompt += '\n- Maintain a consistent narrative style and tone.';
    prompt += '\n- Incorporate the context details naturally into the story.';
    
    if (params.context?.audience === 'children') {
      prompt += '\n- Use simpler language appropriate for children.';
      prompt += '\n- Keep content appropriate for young readers.';
    }
    
    if (params.context?.tone) {
      prompt += `\n- Maintain a ${params.context.tone} tone throughout.`;
    }
    
    return prompt;
  }
  
  private async callChatCompletionAPI(messages: ChatCompletionMessage[], 
    userId: string = 'system'
  ): Promise<ChatCompletionResponse> {
    // Import here to avoid circular dependencies
    const { storyMonitoring } = require('../utils/storyMonitoring');
    
    const startTime = Date.now();
    console.log(`[GPTClient] Starting API call to ${this.model}`);
    const requestId = `gpt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      // Estimate prompt tokens (very rough estimate)
      const promptString = JSON.stringify(messages);
      const promptTokens = Math.ceil(promptString.length / 4);
      console.log(`[GPTClient] Request to ${this.model} with ~${promptTokens} tokens`);
      
      const networkStart = Date.now();
      console.log(`[GPTClient] Sending request to OpenAI API using model: ${this.model}`);
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`[GPTClient] Network request completed in ${Date.now() - networkStart}ms for model: ${this.model}`);
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // Estimate completion tokens (very rough estimate)
      const completionString = JSON.stringify(response.data.choices[0].message.content);
      const completionTokens = Math.ceil(completionString.length / 4);
      
      console.log(`[GPTClient] API call to ${this.model} completed in ${latency}ms, received ~${completionTokens} tokens`);
      
      // Log the request
      storyMonitoring.logGPTRequest({
        requestId,
        userId,
        endpoint: 'chat/completions',
        model: this.model,
        latency,
        promptTokens,
        completionTokens,
        success: true
      });
      
      return response.data as ChatCompletionResponse;
    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      console.error(`[GPTClient] API call to ${this.model} failed after ${latency}ms:`, error);
      
      // Log the failed request
      storyMonitoring.logGPTRequest({
        requestId,
        userId,
        endpoint: 'chat/completions',
        model: this.model,
        latency,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      this.handleApiError(error);
    }
  }
  
  private handleApiError(error: any): never {
    // Check if this is our specific validation error
    if (error.message === 'Invalid response from GPT API') {
      throw error; // Rethrow without modification
    }
    
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const responseData = axiosError.response.data as OpenAIErrorResponse;
        const errorMessage = responseData?.error?.message || axiosError.message;
        throw new Error(`GPT API request failed: ${errorMessage}`);
      } else if (axiosError.request) {
        // The request was made but no response was received
        throw new Error(`GPT API request failed: No response received`);
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new Error(`GPT API request failed: ${axiosError.message}`);
      }
    }
    
    // For non-Axios errors
    throw new Error(`GPT API request failed: ${error.message || 'Unknown error'}`);
  }
  
  /**
   * Stream story segment generation with real-time chunks
   * @param params Parameters including prompt, context, and callback for chunks
   */
  async streamStorySegment(params: StreamStorySegmentParams): Promise<void> {
    // Import here to avoid circular dependencies
    const { storyMonitoring } = require('../utils/storyMonitoring');
    
    const startTime = Date.now();
    console.log(`[GPTClient] Starting streamStorySegment`);
    const requestId = `gpt_stream_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      const { prompt, context = {}, onChunk } = params;
      
      // Generate prompt with context
      const promptStart = Date.now();
      const finalPrompt = this.constructPrompt({
        instruction: prompt,
        context
      });
      console.log(`[GPTClient] Prompt construction completed in ${Date.now() - promptStart}ms`);
      
      // Prepare messages for API call
      const messages: ChatCompletionMessage[] = [
        { role: 'system', content: 'You are a creative writing assistant.' },
        { role: 'user', content: finalPrompt }
      ];
      
      // Make API call with streaming
      console.log(`[GPTClient] Starting streaming API call to ${this.model}`);
      const apiCallStart = Date.now();
      
      // Configure axios for streaming response
      const config: AxiosRequestConfig = {
        method: 'post',
        url: this.apiUrl,
        data: {
          model: this.model,
          messages,
          temperature: 0.7,
          stream: true,
          max_tokens: 1000
        },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        responseType: 'stream'
      };
      
      const response = await axios(config);
      
      let buffer = '';
      
      // Process the stream
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const jsonStr = line.replace('data: ', '');
              const json = JSON.parse(jsonStr);
              
              if (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
                const content = json.choices[0].delta.content;
                buffer += content;
                onChunk(content);
              }
            } catch (e) {
              // Skip parsing errors for incomplete chunks
              console.warn('[GPTClient] Failed to parse streaming chunk:', e);
            }
          }
        }
      });
      
      // Wait for the stream to finish
      await new Promise<void>((resolve) => {
        response.data.on('end', () => {
          console.log(`[GPTClient] Streaming completed in ${Date.now() - apiCallStart}ms`);
          
          // Log the completed streaming request
          storyMonitoring.logGPTRequest({
            requestId,
            userId: context.userId || 'system',
            endpoint: 'chat/completions/stream',
            model: this.model,
            latency: Date.now() - startTime,
            promptTokens: Math.ceil(JSON.stringify(messages).length / 4),
            completionTokens: Math.ceil(buffer.length / 4),
            success: true
          });
          
          resolve();
        });
      });
      
    } catch (error) {
      console.error(`[GPTClient] Streaming error:`, error);
      
      // Log the failed request
      storyMonitoring.logGPTRequest({
        requestId,
        userId: params.context.userId || 'system',
        endpoint: 'chat/completions/stream',
        model: this.model,
        latency: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      this.handleApiError(error);
    }
  }
  
  /**
   * Clear all cached content
   */
  clearCache(): void {
    this.contentCache.clear();
    this.choicesCache.clear();
    console.log(`[GPTClient] Cache cleared for model: ${this.model}`);
  }
  
  /**
   * Generate a cache key from a prompt and context
   */
  private generateCacheKey(prompt: string, context: Record<string, any>): string {
    const data = JSON.stringify({ prompt, context });
    return crypto.createHash('md5').update(data).digest('hex');
  }
} 