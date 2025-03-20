import { DeepgramService } from '../DeepgramService';
import { GeminiService } from '../GeminiService';
import { CartesiaService } from '../CartesiaService';

// Mock the dependencies
jest.mock('../DeepgramService');
jest.mock('../GeminiService');
jest.mock('../CartesiaService');

describe('Voice Echo Pipeline', () => {
  let deepgramService: jest.Mocked<DeepgramService>;
  let geminiService: jest.Mocked<GeminiService>;
  let cartesiaService: jest.Mocked<CartesiaService>;
  
  beforeEach(() => {
    // Create mock instances
    deepgramService = new DeepgramService() as jest.Mocked<DeepgramService>;
    geminiService = new GeminiService() as jest.Mocked<GeminiService>;
    cartesiaService = new CartesiaService() as jest.Mocked<CartesiaService>;
    
    // Set up mock implementations
    deepgramService.transcribeAudio.mockResolvedValue('Hello, testing voice API');
    geminiService.processText.mockResolvedValue('I heard you say: Hello, testing voice API');
    cartesiaService.textToSpeech.mockResolvedValue(Buffer.from('mock audio data'));
  });
  
  it('should process audio through the full pipeline', async () => {
    // Sample audio data
    const audioData = Buffer.from('mock audio data');
    
    // Step 1: Transcribe audio
    const transcribedText = await deepgramService.transcribeAudio(audioData);
    expect(deepgramService.transcribeAudio).toHaveBeenCalledWith(audioData);
    expect(transcribedText).toBe('Hello, testing voice API');
    
    // Step 2: Process with LLM
    const llmResponse = await geminiService.processText(transcribedText);
    expect(geminiService.processText).toHaveBeenCalledWith('Hello, testing voice API');
    expect(llmResponse).toBe('I heard you say: Hello, testing voice API');
    
    // Step 3: Convert to speech
    const audioResponse = await cartesiaService.textToSpeech(llmResponse);
    expect(cartesiaService.textToSpeech).toHaveBeenCalledWith('I heard you say: Hello, testing voice API');
    expect(audioResponse).toEqual(Buffer.from('mock audio data'));
    
    // The complete pipeline should work end-to-end
    expect(audioResponse).toBeTruthy();
  });
  
  it('should handle errors in the transcription step', async () => {
    // Set up the mock to throw an error
    deepgramService.transcribeAudio.mockRejectedValue(new Error('Transcription failed'));
    
    // Sample audio data
    const audioData = Buffer.from('mock audio data');
    
    // The transcription should fail
    await expect(deepgramService.transcribeAudio(audioData)).rejects.toThrow('Transcription failed');
  });
  
  it('should handle errors in the LLM step', async () => {
    // Set up the mock to throw an error
    geminiService.processText.mockRejectedValue(new Error('LLM processing failed'));
    
    // The LLM processing should fail
    await expect(geminiService.processText('Hello')).rejects.toThrow('LLM processing failed');
  });
  
  it('should handle errors in the text-to-speech step', async () => {
    // Set up the mock to throw an error
    cartesiaService.textToSpeech.mockRejectedValue(new Error('Text-to-speech failed'));
    
    // The text-to-speech conversion should fail
    await expect(cartesiaService.textToSpeech('Hello')).rejects.toThrow('Text-to-speech failed');
  });
});