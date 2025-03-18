import axios, { AxiosError } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { OpenAIService } from '../openai.service';
import { OpenAICompletionRequest, OpenAICompletionResponse, OpenAIErrorResponse } from '../../../types/openai';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;
const mock = new MockAdapter(mockAxios);

describe('OpenAIService', () => {
  let openAIService: OpenAIService;
  const mockConfig = {
    apiKey: 'test-api-key',
    organization: 'test-org',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    openAIService = new OpenAIService(mockConfig);
  });

  afterEach(() => {
    mock.reset();
  });

  describe('constructor', () => {
    it('should initialize with the provided config', () => {
      expect(openAIService).toBeDefined();
      // @ts-ignore - accessing private property for testing
      expect(openAIService.config).toEqual(mockConfig);
    });

    it('should throw an error if no API key is provided', () => {
      expect(() => new OpenAIService({ apiKey: '' })).toThrow('OpenAI API key is required');
    });
  });

  describe('createCompletion', () => {
    const mockRequest: OpenAICompletionRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const mockResponse: OpenAICompletionResponse = {
      id: 'test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello there!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      },
    };

    it('should send a request to OpenAI API and return the response', async () => {
      // Setup mock response
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await openAIService.createCompletion(mockRequest);

      // Verify axios was called with correct parameters
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        mockRequest,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockConfig.apiKey}`,
            'OpenAI-Organization': mockConfig.organization,
          }),
          timeout: 30000,
        })
      );

      // Verify the response was properly returned
      expect(result).toEqual(mockResponse);
    });

    it('should throw an error when API request fails', async () => {
      const mockError: OpenAIErrorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      };

      // Create a proper AxiosError
      const axiosError = {
        isAxiosError: true,
        response: {
          data: mockError,
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
        }
      } as AxiosError;

      // Setup mock to return an error
      mockAxios.post.mockRejectedValueOnce(axiosError);

      await expect(openAIService.createCompletion(mockRequest)).rejects.toThrow('OpenAI API Error: Invalid API key');
    });

    it('should handle network errors', async () => {
      // Create a proper AxiosError for network error
      const networkError = new Error('Network Error') as AxiosError;
      networkError.isAxiosError = true;
      networkError.message = 'Network Error';
      networkError.code = 'ECONNABORTED';

      // Setup mock to simulate network error
      mockAxios.post.mockRejectedValueOnce(networkError);

      await expect(openAIService.createCompletion(mockRequest)).rejects.toThrow('Network Error');
    });

    it('should handle timeout errors', async () => {
      // Create a proper AxiosError for timeout
      const timeoutError = new Error('timeout of 30000ms exceeded') as AxiosError;
      timeoutError.isAxiosError = true;
      timeoutError.message = 'timeout of 30000ms exceeded';
      timeoutError.code = 'ECONNABORTED';

      // Setup mock to simulate timeout
      mockAxios.post.mockRejectedValueOnce(timeoutError);

      await expect(openAIService.createCompletion(mockRequest)).rejects.toThrow('timeout of 30000ms exceeded');
    });
  });
}); 