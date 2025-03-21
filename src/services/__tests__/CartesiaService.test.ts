import { CartesiaService } from '../CartesiaService';
import { CartesiaClient } from '@cartesia/cartesia-js';

// Mock the CartesiaClient
jest.mock('@cartesia/cartesia-js');

describe('CartesiaService', () => {
  let cartesiaService: CartesiaService;
  let mockBytesMethod: jest.Mock;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock implementation for CartesiaClient
    mockBytesMethod = jest.fn().mockResolvedValue(new ArrayBuffer(10));
    (CartesiaClient as jest.Mock).mockImplementation(() => ({
      tts: {
        bytes: mockBytesMethod
      }
    }));
    
    // Create a new instance of CartesiaService
    cartesiaService = new CartesiaService();
  });
  
  it('should initialize with default settings', () => {
    expect(CartesiaClient).toHaveBeenCalledWith({
      apiKey: expect.any(String)
    });
  });
  
  it('should convert text to speech successfully', async () => {
    const text = 'Hello, world!';
    const audioBuffer = await cartesiaService.textToSpeech(text);
    
    expect(mockBytesMethod).toHaveBeenCalledWith({
      modelId: expect.any(String),
      transcript: 'Hello, world!',
      voice: {
        mode: 'id',
        id: expect.any(String)
      },
      outputFormat: {
        container: 'mp3',
        sampleRate: 24000,
        bitRate: 128000
      },
      language: 'en'
    });
    
    expect(audioBuffer).toBeInstanceOf(Buffer);
    expect(audioBuffer.length).toBeGreaterThan(0);
  });
  
  it('should throw an error when text-to-speech fails', async () => {
    mockBytesMethod.mockRejectedValue(new Error('API error'));
    
    await expect(cartesiaService.textToSpeech('Hello')).rejects.toThrow('Text-to-speech failed: API error');
  });
  
  it('should throw an error when API key is not set', async () => {
    // Create a service with missing API key
    const originalEnv = process.env.CARTESIA_API_KEY;
    process.env.CARTESIA_API_KEY = '';
    
    const serviceWithoutApiKey = new CartesiaService();
    
    // @ts-ignore: Access private property for testing
    serviceWithoutApiKey.apiKey = '';
    
    await expect(serviceWithoutApiKey.textToSpeech('Hello')).rejects.toThrow('Cartesia API key not configured');
    
    // Restore the original environment
    process.env.CARTESIA_API_KEY = originalEnv;
  });
});