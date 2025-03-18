import { PromptConstructor } from '../PromptConstructor';
import { StoryContext } from '../../models/StoryContext';

describe('PromptConstructor', () => {
  let promptConstructor: PromptConstructor;

  beforeEach(() => {
    promptConstructor = new PromptConstructor();
  });

  describe('constructStorySegmentPrompt', () => {
    it('should create a basic prompt with minimal context', () => {
      const context: StoryContext = {
        userId: 'user123',
        genre: 'fantasy'
      };

      const prompt = promptConstructor.constructStorySegmentPrompt(context);
      
      expect(prompt).toContain('You are a creative storyteller');
      expect(prompt).toContain('genre: fantasy');
      expect(prompt).not.toContain('previousSegment');
      expect(prompt).not.toContain('choiceHistory');
    });

    it('should incorporate story history when available', () => {
      const context: StoryContext = {
        userId: 'user123',
        genre: 'fantasy',
        previousSegment: 'The hero entered the ancient temple.',
        choiceHistory: ['Enter temple', 'Light torch'],
        lastChoice: 'Light torch'
      };

      const prompt = promptConstructor.constructStorySegmentPrompt(context);
      
      expect(prompt).toContain('previousSegment: The hero entered the ancient temple');
      expect(prompt).toContain('lastChoice: Light torch');
      expect(prompt).toContain('choiceHistory:');
      expect(prompt).toContain('Enter temple');
      expect(prompt).toContain('Light torch');
    });

    it('should include character details when provided', () => {
      const context: StoryContext = {
        userId: 'user123',
        genre: 'fantasy',
        character: 'wizard',
        character_name: 'Merlin',
        age: 100
      };

      const prompt = promptConstructor.constructStorySegmentPrompt(context);
      
      expect(prompt).toContain('character: wizard');
      expect(prompt).toContain('character_name: Merlin');
      expect(prompt).toContain('age: 100');
    });

    it('should include style preferences when provided', () => {
      const context: StoryContext = {
        userId: 'user123',
        genre: 'fantasy',
        tone: 'mysterious',
        audience: 'young adult',
        setting: 'medieval kingdom',
        location: 'enchanted forest'
      };

      const prompt = promptConstructor.constructStorySegmentPrompt(context);
      
      expect(prompt).toContain('tone: mysterious');
      expect(prompt).toContain('audience: young adult');
      expect(prompt).toContain('setting: medieval kingdom');
      expect(prompt).toContain('location: enchanted forest');
    });
  });

  describe('constructChoicesPrompt', () => {
    it('should create a basic choices prompt with minimal context', () => {
      const context: StoryContext = {
        userId: 'user123',
        genre: 'fantasy'
      };
      const currentSegment = 'The hero stands before three doors.';
      const numChoices = 3;

      const prompt = promptConstructor.constructChoicesPrompt(context, currentSegment, numChoices);
      
      expect(prompt).toContain(`generate exactly ${numChoices} interesting choices for the reader`);
      expect(prompt).toContain('The hero stands before three doors');
      expect(prompt).toContain('genre: fantasy');
    });

    it('should incorporate previous choices for continuity', () => {
      const context: StoryContext = {
        userId: 'user123',
        genre: 'fantasy',
        choiceHistory: ['Enter temple', 'Light torch'],
        lastChoice: 'Light torch'
      };
      const currentSegment = 'The flickering torch reveals ancient symbols on the walls.';
      const numChoices = 2;

      const prompt = promptConstructor.constructChoicesPrompt(context, currentSegment, numChoices);
      
      expect(prompt).toContain('choiceHistory:');
      expect(prompt).toContain('Enter temple');
      expect(prompt).toContain('Light torch');
      expect(prompt).toContain('lastChoice: Light torch');
    });

    it('should include style guidance for choice generation', () => {
      const context: StoryContext = {
        userId: 'user123',
        genre: 'fantasy',
        tone: 'mysterious',
        audience: 'young adult'
      };
      const currentSegment = 'A strange mist fills the chamber.';
      const numChoices = 2;

      const prompt = promptConstructor.constructChoicesPrompt(context, currentSegment, numChoices);
      
      expect(prompt).toContain('tone: mysterious');
      expect(prompt).toContain('audience: young adult');
      expect(prompt).toContain('Ensure choices are appropriate for young adult audience');
      expect(prompt).toContain('Maintain mysterious tone in choice descriptions');
    });
  });
}); 