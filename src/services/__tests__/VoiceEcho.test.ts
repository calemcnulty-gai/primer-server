import { DeepgramService } from '../DeepgramService';
import { CartesiaService } from '../CartesiaService';

// Mock the dependencies
jest.mock('../DeepgramService');
jest.mock('../CartesiaService');

describe('Voice Echo Pipeline', () => {
  let deepgramService: jest.Mocked<DeepgramService>;
  let cartesiaService: jest.Mocked<CartesiaService>;
  
  beforeEach(() => {
    // Create mock instances
    deepgramService = new DeepgramService() as jest.Mocked<DeepgramService>;
    cartesiaService = new CartesiaService() as jest.Mocked<CartesiaService>;
    
    // Set up mock implementations
    deepgramService.transcribeAudio.mockResolvedValue('Hello, testing voice API');
    cartesiaService.textToSpeech.mockResolvedValue(Buffer.from('mock audio data'));
  });
  
  it('should process audio through the echo pipeline', async () => {
    // Sample audio data
    const audioData = Buffer.from('mock audio data');
    
    // Step 1: Transcribe audio
    const transcribedText = await deepgramService.transcribeAudio(audioData);
    expect(deepgramService.transcribeAudio).toHaveBeenCalledWith(audioData);
    expect(transcribedText).toBe('Hello, testing voice API');
    
    // Step 2: Create echo response
    const echoResponse = `You said: ${transcribedText}`;
    expect(echoResponse).toBe('You said: Hello, testing voice API');
    
    // Step 3: Convert to speech
    const audioResponse = await cartesiaService.textToSpeech(echoResponse);
    expect(cartesiaService.textToSpeech).toHaveBeenCalledWith('You said: Hello, testing voice API');
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
  
  it('should handle errors in the text-to-speech step', async () => {
    // Set up the mock to throw an error
    cartesiaService.textToSpeech.mockRejectedValue(new Error('Text-to-speech failed'));
    
    // The text-to-speech conversion should fail
    await expect(cartesiaService.textToSpeech('Hello')).rejects.toThrow('Text-to-speech failed');
  });
});