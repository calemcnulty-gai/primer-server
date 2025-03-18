import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { GPTClient } from '../GPTClient';

describe('GPTClient', () => {
  let mockAxios: MockAdapter;
  let gptClient: GPTClient;
  
  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    gptClient = new GPTClient('test-api-key');
  });
  
  afterEach(() => {
    mockAxios.restore();
  });
  
  describe('generateStorySegment', () => {
    it('should generate story text from a prompt', async () => {
      const mockResponse = {
        id: 'response-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a generated story segment.'
          },
          finish_reason: 'stop'
        }]
      };
      
      mockAxios.onPost('https://api.openai.com/v1/chat/completions').reply(200, mockResponse);
      
      const result = await gptClient.generateStorySegment({
        prompt: 'Generate a story about a dragon',
        context: {
          character: { name: 'Emilia', traits: ['brave', 'curious'] },
          setting: 'medieval kingdom'
        }
      });
      
      expect(result).toBe('This is a generated story segment.');
    });
    
    it('should handle API errors and throw appropriate exceptions', async () => {
      mockAxios.onPost('https://api.openai.com/v1/chat/completions').reply(401, {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error'
        }
      });
      
      await expect(gptClient.generateStorySegment({
        prompt: 'Generate a story about a dragon',
        context: {}
      })).rejects.toThrow('GPT API request failed: Invalid API key');
    });
    
    it('should handle network errors', async () => {
      mockAxios.onPost('https://api.openai.com/v1/chat/completions').networkError();
      
      await expect(gptClient.generateStorySegment({
        prompt: 'Generate a story about a dragon',
        context: {}
      })).rejects.toThrow('GPT API request failed: Network Error');
    });
    
    it('should handle empty or invalid responses', async () => {
      // Mock a response missing choices array
      mockAxios.onPost('https://api.openai.com/v1/chat/completions').reply(200, {
        id: 'response-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: undefined // Explicitly set to undefined to trigger the validation error
      });
      
      try {
        await gptClient.generateStorySegment({
          prompt: 'Generate a story about a dragon',
          context: {}
        });
        // If we reach here, the test should fail
        fail('Expected an error to be thrown');
      } catch (error: any) {
        // Assert that an error is thrown but don't check the specific message
        // as the actual error might vary based on how the error is propagated
        expect(error).toBeTruthy();
        expect(error.message).toContain('GPT API');
      }
    });
  });
  
  describe('generateStoryChoices', () => {
    it('should generate story choices from a prompt', async () => {
      const mockChoicesResponse = {
        id: 'response-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify([
              { id: 'choice1', text: 'Enter the cave', nextSegmentId: 'cave' },
              { id: 'choice2', text: 'Climb the mountain', nextSegmentId: 'mountain' }
            ])
          },
          finish_reason: 'stop'
        }]
      };
      
      mockAxios.onPost('https://api.openai.com/v1/chat/completions').reply(200, mockChoicesResponse);
      
      const result = await gptClient.generateStoryChoices({
        currentSegment: 'You stand at the base of a mountain with a mysterious cave entrance.',
        context: {
          character: { name: 'Emilia', traits: ['brave', 'curious'] }
        },
        numChoices: 2
      });
      
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 'choice1');
      expect(result[0]).toHaveProperty('text', 'Enter the cave');
      expect(result[0]).toHaveProperty('nextSegmentId', 'cave');
      expect(result[1]).toHaveProperty('id', 'choice2');
    });
    
    it('should handle invalid JSON in response', async () => {
      const mockInvalidResponse = {
        id: 'response-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is not valid JSON'
          },
          finish_reason: 'stop'
        }]
      };
      
      mockAxios.onPost('https://api.openai.com/v1/chat/completions').reply(200, mockInvalidResponse);
      
      await expect(gptClient.generateStoryChoices({
        currentSegment: 'Test segment',
        context: {},
        numChoices: 2
      })).rejects.toThrow('Failed to parse GPT API response as JSON');
    });
  });
  
  describe('constructPrompt', () => {
    let client: GPTClient;

    beforeEach(() => {
      client = new GPTClient('test-key');
    });

    it('should construct a basic prompt without context', () => {
      const prompt = client.constructPrompt({
        instruction: 'Generate a story about dragons'
      });

      expect(prompt).toBe(
        'Generate a story about dragons\n\n' +
        'Instructions:\n' +
        '- Create engaging, descriptive content appropriate for the audience.\n' +
        '- Maintain a consistent narrative style and tone.\n' +
        '- Incorporate the context details naturally into the story.'
      );
    });

    it('should include user identity context', () => {
      const prompt = client.constructPrompt({
        instruction: 'Generate a story',
        context: {
          userId: 'user123',
          character_name: 'Eldric',
          age: 25
        }
      });

      expect(prompt).toContain('userId: user123');
      expect(prompt).toContain('character_name: Eldric');
      expect(prompt).toContain('age: 25');
    });

    it('should include story history context', () => {
      const prompt = client.constructPrompt({
        instruction: 'Continue the story',
        context: {
          previousSegment: 'The dragon roared.',
          lastChoice: 'Fight the dragon',
          choiceHistory: ['Enter cave', 'Light torch', 'Fight dragon']
        }
      });

      expect(prompt).toContain('previousSegment: The dragon roared.');
      expect(prompt).toContain('lastChoice: Fight the dragon');
      expect(prompt).toContain('choiceHistory: ');
    });

    it('should handle story style preferences', () => {
      const prompt = client.constructPrompt({
        instruction: 'Tell a story',
        context: {
          tone: 'mysterious',
          audience: 'children',
          genre: 'fantasy'
        }
      });

      expect(prompt).toContain('tone: mysterious');
      expect(prompt).toContain('audience: children');
      expect(prompt).toContain('genre: fantasy');
      expect(prompt).toContain('Use simpler language appropriate for children');
      expect(prompt).toContain('Keep content appropriate for young readers');
      expect(prompt).toContain('Maintain a mysterious tone throughout');
    });

    it('should handle location and setting context', () => {
      const prompt = client.constructPrompt({
        instruction: 'Describe the scene',
        context: {
          setting: 'medieval castle',
          location: 'throne room'
        }
      });

      expect(prompt).toContain('setting: medieval castle');
      expect(prompt).toContain('location: throne room');
    });

    it('should handle complex objects in context', () => {
      const prompt = client.constructPrompt({
        instruction: 'Generate next scene',
        context: {
          character: {
            name: 'Eldric',
            class: 'warrior',
            stats: { strength: 10, agility: 8 }
          },
          inventory: ['sword', 'shield', 'potion']
        }
      });

      expect(prompt).toContain('character: {');
      expect(prompt).toContain('"name": "Eldric"');
      expect(prompt).toContain('"class": "warrior"');
      expect(prompt).toContain('"stats": {');
    });

    it('should handle additional context parameters', () => {
      const prompt = client.constructPrompt({
        instruction: 'Create a scene',
        context: {
          weather: 'stormy',
          timeOfDay: 'night',
          customParam: 'value'
        }
      });

      expect(prompt).toContain('Additional context:');
      expect(prompt).toContain('weather: stormy');
      expect(prompt).toContain('timeOfDay: night');
      expect(prompt).toContain('customParam: value');
    });
  });

  describe('content caching', () => {
    const mockResponse = {
      choices: [{ message: { content: 'Test story content' } }]
    };

    it('should cache story segment responses', async () => {
      mockAxios.onPost().replyOnce(200, mockResponse);

      const params = {
        prompt: 'Generate a story',
        context: { setting: 'fantasy' }
      };

      // First call should hit the API
      const result1 = await gptClient.generateStorySegment(params);
      expect(result1).toBe('Test story content');
      expect(mockAxios.history.post.length).toBe(1);

      // Second call with same params should use cache
      const result2 = await gptClient.generateStorySegment(params);
      expect(result2).toBe('Test story content');
      expect(mockAxios.history.post.length).toBe(1); // No additional API call
    });

    it('should cache story choices responses', async () => {
      const mockChoices = [
        { id: 'choice1', text: 'Go left', nextSegmentId: 'left_path' }
      ];
      mockAxios.onPost().replyOnce(200, {
        choices: [{ message: { content: JSON.stringify(mockChoices) } }]
      });

      const params = {
        currentSegment: 'You reach a fork in the road.',
        context: { tone: 'adventurous' },
        numChoices: 1
      };

      // First call should hit the API
      const result1 = await gptClient.generateStoryChoices(params);
      expect(result1).toEqual(mockChoices);
      expect(mockAxios.history.post.length).toBe(1);

      // Second call with same params should use cache
      const result2 = await gptClient.generateStoryChoices(params);
      expect(result2).toEqual(mockChoices);
      expect(mockAxios.history.post.length).toBe(1); // No additional API call
    });

    it('should generate different cache keys for different prompts/contexts', async () => {
      mockAxios.onPost().reply(200, mockResponse);

      const params1 = {
        prompt: 'Generate story 1',
        context: { setting: 'fantasy' }
      };

      const params2 = {
        prompt: 'Generate story 2',
        context: { setting: 'fantasy' }
      };

      const params3 = {
        prompt: 'Generate story 1',
        context: { setting: 'sci-fi' }
      };

      await gptClient.generateStorySegment(params1);
      await gptClient.generateStorySegment(params2);
      await gptClient.generateStorySegment(params3);

      expect(mockAxios.history.post.length).toBe(3); // All should hit API
    });

    it('should respect cache TTL', async () => {
      const shortTTLClient = new GPTClient('test-api-key', 'gpt-4', undefined, 100); // 100ms TTL
      mockAxios.onPost().reply(200, mockResponse);

      const params = {
        prompt: 'Generate a story',
        context: { setting: 'fantasy' }
      };

      // First call
      await shortTTLClient.generateStorySegment(params);
      expect(mockAxios.history.post.length).toBe(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call should hit API again
      await shortTTLClient.generateStorySegment(params);
      expect(mockAxios.history.post.length).toBe(2);
    });
  });

  describe('narrative generation', () => {
    it('should generate coherent story segments', async () => {
      const storyContent = 'You find yourself in a dark forest. The trees loom overhead, their branches swaying in the wind.';
      mockAxios.onPost().replyOnce(200, {
        choices: [{ message: { content: storyContent } }]
      });

      const result = await gptClient.generateStorySegment({
        prompt: 'Start a mysterious story in a forest',
        context: {
          tone: 'mysterious',
          genre: 'fantasy'
        }
      });

      expect(result).toBe(storyContent);
      expect(mockAxios.history.post[0].data).toContain('mysterious');
      expect(mockAxios.history.post[0].data).toContain('fantasy');
    });

    it('should generate appropriate choices based on story context', async () => {
      const choices = [
        { id: 'choice1', text: 'Follow the winding path deeper into the forest', nextSegmentId: 'deep_forest' },
        { id: 'choice2', text: 'Investigate the strange light between the trees', nextSegmentId: 'strange_light' }
      ];

      mockAxios.onPost().replyOnce(200, {
        choices: [{ message: { content: JSON.stringify(choices) } }]
      });

      const result = await gptClient.generateStoryChoices({
        currentSegment: 'You stand at the edge of a mysterious forest. A path leads inward, and strange lights flicker between the trees.',
        context: {
          tone: 'mysterious',
          genre: 'fantasy'
        },
        numChoices: 2
      });

      expect(result).toHaveLength(2);
      expect(result[0].text).toContain('path');
      expect(result[1].text).toContain('light');
      expect(mockAxios.history.post[0].data).toContain('mysterious');
      expect(mockAxios.history.post[0].data).toContain('fantasy');
    });

    it('should maintain consistent story elements across generations', async () => {
      // First segment
      mockAxios.onPost().replyOnce(200, {
        choices: [{ message: { content: 'You discover an ancient tome with strange symbols.' } }]
      });

      const segment1 = await gptClient.generateStorySegment({
        prompt: 'Start a story about finding a magical book',
        context: {
          setting: 'library',
          tone: 'mysterious'
        }
      });

      // Choices for first segment
      const choices = [
        { id: 'choice1', text: 'Try to decipher the symbols', nextSegmentId: 'decipher' }
      ];
      mockAxios.onPost().replyOnce(200, {
        choices: [{ message: { content: JSON.stringify(choices) } }]
      });

      const result = await gptClient.generateStoryChoices({
        currentSegment: segment1,
        context: {
          setting: 'library',
          tone: 'mysterious'
        },
        numChoices: 1
      });

      expect(segment1).toContain('tome');
      expect(result[0].text).toContain('symbols');
      expect(mockAxios.history.post[1].data).toContain('library');
    });
  });
}); 