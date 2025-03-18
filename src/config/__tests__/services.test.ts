import { OpenAIService } from '../../services/openai';

describe('Services Configuration', () => {
  const originalEnv = process.env;
  const MockOpenAIService = jest.fn().mockImplementation((config) => ({
    config
  }));

  beforeEach(() => {
    // Reset modules and environment
    jest.resetModules();
    process.env = { ...originalEnv };
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup fresh mock
    jest.mock('../../services/openai', () => ({
      OpenAIService: MockOpenAIService
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.unmock('../../services/openai');
  });

  describe('API Services', () => {
    it('should initialize openaiService with API key from environment', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      jest.isolateModules(() => {
        const { getOpenAIService } = require('../services');
        const service = getOpenAIService();
        
        expect(service).toBeDefined();
        expect(MockOpenAIService).toHaveBeenCalledWith({
          apiKey: 'test-api-key'
        });
      });
    });
  });

  describe('validateApiKeys', () => {
    it('should warn if OpenAI API key is not set', () => {
      delete process.env.OPENAI_API_KEY;
      const consoleSpy = jest.spyOn(console, 'warn');
      
      jest.isolateModules(() => {
        const { validateApiKeys } = require('../services');
        validateApiKeys();
        
        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: OPENAI_API_KEY is not set in environment variables.'
        );
      });
      
      consoleSpy.mockRestore();
    });
  });
}); 