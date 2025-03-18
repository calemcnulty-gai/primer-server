import { StoryStateService } from '../StoryStateService';
import { StoryState, StorySegment } from '../../models/StoryState';
import { StoryTemplate } from '../../models/StoryTemplate';
import { GPTClient } from '../GPTClient';
import { InMemoryStateStorage } from '../persistence/InMemoryStateStorage';
import { StateStorageInterface } from '../persistence/StateStorageInterface';
import { PersonalizationManager } from '../PersonalizationManager';

// Mock dependencies
jest.mock('../GPTClient');
jest.mock('../../models/StoryState');
jest.mock('../../models/StoryTemplate');
jest.mock('../persistence/InMemoryStateStorage');

describe('StoryStateService', () => {
  let storyStateService: StoryStateService;
  let mockGptClient: jest.Mocked<GPTClient>;
  let mockStateStorage: jest.Mocked<StateStorageInterface>;
  let personalizationManager: PersonalizationManager;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up mock GPT client
    mockGptClient = {
      generateStorySegment: jest.fn(),
      generateStoryChoices: jest.fn(),
    } as unknown as jest.Mocked<GPTClient>;
    
    // Set up mock state storage
    mockStateStorage = {
      saveState: jest.fn().mockResolvedValue(undefined),
      loadState: jest.fn().mockResolvedValue(null),
      hasState: jest.fn().mockResolvedValue(false),
      deleteState: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<StateStorageInterface>;
    
    personalizationManager = new PersonalizationManager();
    
    // Create service instance with mocked dependencies
    storyStateService = new StoryStateService(mockGptClient, mockStateStorage, personalizationManager);
    
    // Mock template loading to return no templates
    storyStateService['storyTemplates'] = {};
  });
  
  describe('getOrCreateStoryState', () => {
    it('should return existing story state if found in memory', async () => {
      const userId = 'user123';
      const mockStoryState = new StoryState(userId);
      
      // Clear constructor calls from setup
      (StoryState as jest.MockedClass<typeof StoryState>).mockClear();
      
      // Mock the internal state map
      (storyStateService as any).storyStates = {
        [userId]: mockStoryState
      };
      
      const result = await storyStateService.getOrCreateStoryState(userId);
      
      expect(result).toBe(mockStoryState);
      expect(StoryState).not.toHaveBeenCalled();
      expect(mockStateStorage.loadState).not.toHaveBeenCalled();
    });
    
    it('should load state from storage if available', async () => {
      const userId = 'user123';
      const storedStateData = {
        userId,
        currentSegmentId: 'segment1',
        segments: { segment1: { id: 'segment1', content: 'test', choices: [] } },
        choiceHistory: [],
        contextualData: {}
      };
      
      const mockStoryState = new StoryState(userId);
      
      // Clear constructor calls from setup
      (StoryState as jest.MockedClass<typeof StoryState>).mockClear();
      
      // Mock storage to return data
      mockStateStorage.hasState.mockResolvedValue(true);
      mockStateStorage.loadState.mockResolvedValue(storedStateData);
      
      // Mock fromJSON static method
      (StoryState.fromJSON as jest.Mock).mockReturnValue(mockStoryState);
      
      const result = await storyStateService.getOrCreateStoryState(userId);
      
      expect(result).toBe(mockStoryState);
      expect(mockStateStorage.hasState).toHaveBeenCalledWith(userId);
      expect(mockStateStorage.loadState).toHaveBeenCalledWith(userId);
      expect(StoryState.fromJSON).toHaveBeenCalledWith(storedStateData);
      expect(StoryState).not.toHaveBeenCalled(); // Constructor should not be called
    });
    
    it('should create a new story state if not found anywhere', async () => {
      const userId = 'user123';
      const mockStoryState = new StoryState(userId);
      
      // Clear constructor calls from setup
      (StoryState as jest.MockedClass<typeof StoryState>).mockClear();
      
      // Mock storage to return no data
      mockStateStorage.hasState.mockResolvedValue(false);
      
      // Mock StoryState constructor
      (StoryState as jest.MockedClass<typeof StoryState>).mockImplementation(() => mockStoryState);
      
      // Mock initial story segment creation
      jest.spyOn(storyStateService, 'generateInitialStorySegment').mockResolvedValue({
        id: 'intro',
        content: 'Beginning of the story',
        choices: []
      });
      
      // Mock saveStoryState method
      jest.spyOn(storyStateService, 'saveStoryState').mockResolvedValue();
      
      const result = await storyStateService.getOrCreateStoryState(userId);
      
      expect(result).toBe(mockStoryState);
      expect(mockStateStorage.hasState).toHaveBeenCalledWith(userId);
      expect(StoryState).toHaveBeenCalledWith(userId);
      expect(storyStateService.generateInitialStorySegment).toHaveBeenCalledWith(userId);
      expect(mockStoryState.addSegment).toHaveBeenCalled();
      expect(storyStateService.saveStoryState).toHaveBeenCalledWith(userId);
    });
  });
  
  describe('generateInitialStorySegment', () => {
    it('should generate an initial story segment using a template', async () => {
      const userId = 'user123';
      const mockTemplate = new StoryTemplate({} as any);
      const mockSegment: StorySegment = {
        id: 'intro',
        content: 'Beginning of the story',
        choices: [{ id: 'choice1', text: 'Continue', nextSegmentId: 'next' }]
      };
      
      // Set up mocks
      jest.spyOn(storyStateService as any, 'getTemplateForUser').mockReturnValue(mockTemplate);
      mockTemplate.generateSegment = jest.fn().mockReturnValue(mockSegment);
      
      const result = await storyStateService.generateInitialStorySegment(userId);
      
      expect(result).toEqual(mockSegment);
      expect((storyStateService as any).getTemplateForUser).toHaveBeenCalledWith(userId);
      expect(mockTemplate.generateSegment).toHaveBeenCalledWith('intro', expect.any(Object));
    });
    
    it('should generate an initial story segment using GPT if no template', async () => {
      const userId = 'user123';
      const mockContent = 'AI generated story beginning';
      
      // Set up mocks
      jest.spyOn(storyStateService as any, 'getTemplateForUser').mockReturnValue(null);
      mockGptClient.generateStorySegment.mockResolvedValue(mockContent);
      mockGptClient.generateStoryChoices.mockResolvedValue([
        { id: 'choice1', text: 'Continue', nextSegmentId: 'next' }
      ]);
      
      const result = await storyStateService.generateInitialStorySegment(userId);
      
      expect(result.id).toBe('intro');
      expect(result.content).toBe(mockContent);
      expect(result.choices).toHaveLength(1);
      expect(mockGptClient.generateStorySegment).toHaveBeenCalled();
      expect(mockGptClient.generateStoryChoices).toHaveBeenCalled();
    });
    
    it('should use personalized context for story generation', async () => {
      const userId = 'test-user';
      const userPrefs = {
        tone: 'mysterious',
        genre: 'horror',
        audience: 'adults'
      };

      await personalizationManager.updateUserPreferences(userId, userPrefs);

      mockGptClient.generateStorySegment.mockResolvedValue('A dark and stormy night...');
      mockGptClient.generateStoryChoices.mockResolvedValue([
        { id: 'choice1', text: 'Investigate the noise', nextSegmentId: 'segment1' },
        { id: 'choice2', text: 'Hide under the covers', nextSegmentId: 'segment2' }
      ]);

      const segment = await storyStateService.generateInitialStorySegment(userId);

      expect(mockGptClient.generateStorySegment).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.any(String),
          context: expect.objectContaining({
            userId,
            tone: 'mysterious',
            genre: 'horror',
            audience: 'adults'
          })
        })
      );

      expect(segment).toEqual({
        id: 'intro',
        content: 'A dark and stormy night...',
        choices: [
          { id: 'choice1', text: 'Investigate the noise', nextSegmentId: 'segment1' },
          { id: 'choice2', text: 'Hide under the covers', nextSegmentId: 'segment2' }
        ]
      });
    });
  });
  
  describe('generateNextSegment', () => {
    it('should generate the next segment based on choice', async () => {
      const userId = 'user123';
      const choiceId = 'choice1';
      const nextSegmentId = 'next_segment';
      
      // Create mock story state
      const mockStoryState = new StoryState(userId);
      
      // Mock segments property with correct shape
      mockStoryState.segments = {};
      
      mockStoryState.getCurrentSegment = jest.fn().mockReturnValue({
        id: 'current',
        content: 'Current segment',
        choices: [{ id: choiceId, text: 'Go forward', nextSegmentId }]
      });
      
      // Mock making a choice
      mockStoryState.makeChoice = jest.fn();
      
      // Mock getOrCreateStoryState
      jest.spyOn(storyStateService, 'getOrCreateStoryState').mockResolvedValue(mockStoryState);
      
      // Mock saveStoryState
      jest.spyOn(storyStateService, 'saveStoryState').mockResolvedValue();
      
      // Mock the next segment generation
      const mockNextSegment: StorySegment = {
        id: nextSegmentId,
        content: 'Next part of the story',
        choices: []
      };
      mockGptClient.generateStorySegment.mockResolvedValue(mockNextSegment.content);
      mockGptClient.generateStoryChoices.mockResolvedValue([]);
      
      const result = await storyStateService.generateNextSegment(userId, choiceId);
      
      expect(result).toEqual(mockNextSegment);
      expect(storyStateService.getOrCreateStoryState).toHaveBeenCalledWith(userId);
      expect(mockStoryState.makeChoice).toHaveBeenCalledWith(choiceId);
      expect(mockStoryState.addSegment).toHaveBeenCalled();
      expect(storyStateService.saveStoryState).toHaveBeenCalledWith(userId);
      expect(mockGptClient.generateStorySegment).toHaveBeenCalled();
    });
    
    it('should reuse existing segment if available', async () => {
      const userId = 'user123';
      const choiceId = 'choice1';
      const nextSegmentId = 'next_segment';
      
      // Create mock story state with existing next segment
      const mockStoryState = new StoryState(userId);
      
      const mockCurrentSegment: StorySegment = {
        id: 'current',
        content: 'Current segment',
        choices: [{ id: choiceId, text: 'Go forward', nextSegmentId }]
      };
      
      const mockNextSegment: StorySegment = {
        id: nextSegmentId,
        content: 'Next part of the story',
        choices: []
      };
      
      // Set up segments
      mockStoryState.segments = {
        current: mockCurrentSegment,
        [nextSegmentId]: mockNextSegment
      };
      
      mockStoryState.getCurrentSegment = jest.fn().mockReturnValue(mockCurrentSegment);
      
      // Mock making a choice
      mockStoryState.makeChoice = jest.fn();
      
      // Mock getOrCreateStoryState
      jest.spyOn(storyStateService, 'getOrCreateStoryState').mockResolvedValue(mockStoryState);
      
      // Mock saveStoryState
      jest.spyOn(storyStateService, 'saveStoryState').mockResolvedValue();
      
      const result = await storyStateService.generateNextSegment(userId, choiceId);
      
      expect(result).toEqual(mockNextSegment);
      expect(mockStoryState.makeChoice).toHaveBeenCalledWith(choiceId);
      expect(mockGptClient.generateStorySegment).not.toHaveBeenCalled(); // Should not generate new content
      expect(storyStateService.saveStoryState).toHaveBeenCalledWith(userId);
    });
    
    it('should throw an error if current segment not found', async () => {
      const userId = 'user123';
      
      // Create mock story state with no current segment
      const mockStoryState = new StoryState(userId);
      mockStoryState.getCurrentSegment = jest.fn().mockReturnValue(null);
      
      // Mock getOrCreateStoryState
      jest.spyOn(storyStateService, 'getOrCreateStoryState').mockResolvedValue(mockStoryState);
      
      await expect(storyStateService.generateNextSegment(userId, 'choice1'))
        .rejects.toThrow('Current story segment not found');
    });
    
    it('should maintain personalization context between segments', async () => {
      const userId = 'test-user';
      const userPrefs = {
        tone: 'mysterious',
        genre: 'horror',
        audience: 'adults'
      };

      await personalizationManager.updateUserPreferences(userId, userPrefs);

      // Set up initial state with mock StoryState
      const initialSegment: StorySegment = {
        id: 'intro',
        content: 'It was a dark and stormy night...',
        choices: [
          { id: 'choice1', text: 'Investigate', nextSegmentId: 'next1' }
        ]
      };

      const mockStoryState = {
        userId,
        currentSegmentId: 'intro',
        segments: { intro: initialSegment } as Record<string, StorySegment>,
        getCurrentSegment: jest.fn().mockReturnValue(initialSegment),
        makeChoice: jest.fn(),
        addSegment: jest.fn(),
        contextualData: {},
        choiceHistory: [],
        readSegments: new Set<string>(),
        updateContextualData: jest.fn(),
        deepMerge: jest.fn(),
        isObject: jest.fn(),
        toJSON: jest.fn(),
        fromJSON: jest.fn()
      } as unknown as StoryState;

      // Set up the mock state in the service
      storyStateService['storyStates'][userId] = mockStoryState;

      mockGptClient.generateStorySegment.mockResolvedValue('You hear footsteps...');
      mockGptClient.generateStoryChoices.mockResolvedValue([
        { id: 'choice2', text: 'Run away', nextSegmentId: 'next2' }
      ]);

      await storyStateService.generateNextSegment(userId, 'choice1');

      expect(mockGptClient.generateStorySegment).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Continue the story based on the choice: "Investigate"'),
          context: expect.objectContaining({
            userId,
            tone: 'mysterious',
            genre: 'horror',
            audience: 'adults',
            previousSegment: 'It was a dark and stormy night...',
            choice: 'Investigate'
          })
        })
      );

      expect(mockStoryState.makeChoice).toHaveBeenCalledWith('choice1');
      expect(mockStoryState.addSegment).toHaveBeenCalledWith({
        id: 'next1',
        content: 'You hear footsteps...',
        choices: [
          { id: 'choice2', text: 'Run away', nextSegmentId: 'next2' }
        ]
      });
    });
  });
  
  describe('getCurrentStorySegment', () => {
    it('should return the current segment for a user', async () => {
      const userId = 'user123';
      const mockSegment: StorySegment = {
        id: 'current',
        content: 'Current segment',
        choices: []
      };
      
      // Create mock story state
      const mockStoryState = new StoryState(userId);
      mockStoryState.getCurrentSegment = jest.fn().mockReturnValue(mockSegment);
      
      // Mock getOrCreateStoryState
      jest.spyOn(storyStateService, 'getOrCreateStoryState').mockResolvedValue(mockStoryState);
      
      const result = await storyStateService.getCurrentStorySegment(userId);
      
      expect(result).toBe(mockSegment);
      expect(storyStateService.getOrCreateStoryState).toHaveBeenCalledWith(userId);
      expect(mockStoryState.getCurrentSegment).toHaveBeenCalled();
    });
    
    it('should throw an error if current segment not found', async () => {
      const userId = 'user123';
      
      // Create mock story state with no current segment
      const mockStoryState = new StoryState(userId);
      mockStoryState.getCurrentSegment = jest.fn().mockReturnValue(null);
      
      // Mock getOrCreateStoryState
      jest.spyOn(storyStateService, 'getOrCreateStoryState').mockResolvedValue(mockStoryState);
      
      await expect(storyStateService.getCurrentStorySegment(userId))
        .rejects.toThrow('Current story segment not found');
    });
  });
  
  describe('saveStoryState', () => {
    it('should save the story state to storage', async () => {
      const userId = 'user123';
      const serializedData = { userId, currentSegmentId: 'intro' };
      const mockStoryState = new StoryState(userId);
      
      // Mock JSON serialization
      mockStoryState.toJSON = jest.fn().mockReturnValue(serializedData);
      
      // Set internal state
      (storyStateService as any).storyStates = {
        [userId]: mockStoryState
      };
      
      await storyStateService.saveStoryState(userId);
      
      expect(mockStoryState.toJSON).toHaveBeenCalled();
      expect(mockStateStorage.saveState).toHaveBeenCalledWith(userId, serializedData);
    });
    
    it('should throw an error if story state not found', async () => {
      await expect(storyStateService.saveStoryState('nonexistent'))
        .rejects.toThrow('Story state not found for user');
    });
  });
  
  describe('clearUserState', () => {
    it('should remove state from memory and storage', async () => {
      const userId = 'user123';
      const mockStoryState = new StoryState(userId);
      
      // Set up internal state
      (storyStateService as any).storyStates = {
        [userId]: mockStoryState
      };
      
      await storyStateService.clearUserState(userId);
      
      // Check that state was removed from memory
      expect((storyStateService as any).storyStates[userId]).toBeUndefined();
      
      // Check that state was removed from storage
      expect(mockStateStorage.deleteState).toHaveBeenCalledWith(userId);
    });
  });
  
  describe('getUserChoiceHistory', () => {
    it('should return the user choice history', async () => {
      const userId = 'user123';
      const mockChoiceHistory = [
        { segmentId: 'intro', choiceId: 'choice1', timestamp: new Date() }
      ];
      
      // Create mock story state
      const mockStoryState = new StoryState(userId);
      mockStoryState.choiceHistory = mockChoiceHistory;
      
      // Mock getOrCreateStoryState
      jest.spyOn(storyStateService, 'getOrCreateStoryState').mockResolvedValue(mockStoryState);
      
      const result = await storyStateService.getUserChoiceHistory(userId);
      
      expect(result).toBe(mockChoiceHistory);
      expect(storyStateService.getOrCreateStoryState).toHaveBeenCalledWith(userId);
    });
  });
  
  describe('updateUserContext', () => {
    it('should update context data and save state', async () => {
      const userId = 'user123';
      const contextData = { preferences: { theme: 'dark' } };
      
      // Create mock story state
      const mockStoryState = new StoryState(userId);
      
      // Mock getOrCreateStoryState
      jest.spyOn(storyStateService, 'getOrCreateStoryState').mockResolvedValue(mockStoryState);
      
      // Mock saveStoryState
      jest.spyOn(storyStateService, 'saveStoryState').mockResolvedValue();
      
      await storyStateService.updateUserContext(userId, contextData);
      
      expect(mockStoryState.updateContextualData).toHaveBeenCalledWith(contextData);
      expect(storyStateService.saveStoryState).toHaveBeenCalledWith(userId);
    });
  });
}); 