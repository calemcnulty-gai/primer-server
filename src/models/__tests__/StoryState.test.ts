import { StoryState, StorySegment, UserChoice } from '../StoryState';

describe('StoryState', () => {
  describe('constructor', () => {
    it('should create a new story state with default values', () => {
      const userId = 'user123';
      const storyState = new StoryState(userId);
      
      expect(storyState.userId).toBe(userId);
      expect(storyState.currentSegmentId).toBe('intro');
      expect(storyState.segments).toEqual({});
      expect(storyState.choiceHistory).toEqual([]);
      expect(storyState.contextualData).toEqual({});
    });
    
    it('should create a story state with provided values', () => {
      const userId = 'user123';
      const currentSegmentId = 'segment2';
      const segments = {
        intro: { id: 'intro', content: 'Story begins...', choices: [] },
        segment2: { id: 'segment2', content: 'Next part...', choices: [] }
      };
      const choiceHistory = [{ segmentId: 'intro', choiceId: 'choice1', timestamp: new Date() }];
      const contextualData = { character: { name: 'Hero' } };
      
      const storyState = new StoryState(userId, currentSegmentId, segments, choiceHistory, contextualData);
      
      expect(storyState.userId).toBe(userId);
      expect(storyState.currentSegmentId).toBe(currentSegmentId);
      expect(storyState.segments).toEqual(segments);
      expect(storyState.choiceHistory).toEqual(choiceHistory);
      expect(storyState.contextualData).toEqual(contextualData);
    });
  });
  
  describe('addSegment', () => {
    it('should add a new segment to the story state', () => {
      const storyState = new StoryState('user123');
      const segment: StorySegment = {
        id: 'segment1',
        content: 'New content',
        choices: [
          { id: 'choice1', text: 'Go left', nextSegmentId: 'segment2' },
          { id: 'choice2', text: 'Go right', nextSegmentId: 'segment3' }
        ]
      };
      
      storyState.addSegment(segment);
      
      expect(storyState.segments[segment.id]).toEqual(segment);
    });
  });
  
  describe('getCurrentSegment', () => {
    it('should return the current segment', () => {
      const storyState = new StoryState('user123');
      const segment: StorySegment = {
        id: 'intro',
        content: 'Story begins...',
        choices: []
      };
      
      storyState.addSegment(segment);
      
      expect(storyState.getCurrentSegment()).toEqual(segment);
    });
    
    it('should return null if current segment does not exist', () => {
      const storyState = new StoryState('user123');
      
      expect(storyState.getCurrentSegment()).toBeNull();
    });
  });
  
  describe('makeChoice', () => {
    it('should update state based on user choice', () => {
      const storyState = new StoryState('user123');
      
      const introSegment: StorySegment = {
        id: 'intro',
        content: 'Story begins...',
        choices: [
          { id: 'choice1', text: 'Go left', nextSegmentId: 'segment2' }
        ]
      };
      
      const nextSegment: StorySegment = {
        id: 'segment2',
        content: 'You went left',
        choices: []
      };
      
      storyState.addSegment(introSegment);
      storyState.addSegment(nextSegment);
      
      const choice = introSegment.choices[0];
      storyState.makeChoice(choice.id);
      
      expect(storyState.currentSegmentId).toBe('segment2');
      expect(storyState.choiceHistory.length).toBe(1);
      expect(storyState.choiceHistory[0].segmentId).toBe('intro');
      expect(storyState.choiceHistory[0].choiceId).toBe('choice1');
    });
    
    it('should throw error for invalid choice ID', () => {
      const storyState = new StoryState('user123');
      const segment: StorySegment = {
        id: 'intro',
        content: 'Story begins...',
        choices: [{ id: 'choice1', text: 'Go left', nextSegmentId: 'segment2' }]
      };
      
      storyState.addSegment(segment);
      
      expect(() => storyState.makeChoice('invalid')).toThrow('Invalid choice ID');
    });
  });
  
  describe('updateContextualData', () => {
    it('should update contextual data with new values', () => {
      const storyState = new StoryState('user123');
      const newData = { character: { name: 'Hero', level: 2 } };
      
      storyState.updateContextualData(newData);
      
      expect(storyState.contextualData).toEqual(newData);
    });
    
    it('should merge contextual data with existing values', () => {
      const storyState = new StoryState('user123');
      const initialData = { character: { name: 'Hero', level: 1 }, location: 'Forest' };
      const updateData = { character: { level: 2 }, weather: 'Sunny' };
      
      storyState.updateContextualData(initialData);
      storyState.updateContextualData(updateData);
      
      expect(storyState.contextualData).toEqual({
        character: { name: 'Hero', level: 2 },
        location: 'Forest',
        weather: 'Sunny'
      });
    });
  });
  
  describe('toJSON', () => {
    it('should serialize the story state to a plain object', () => {
      const userId = 'user123';
      const storyState = new StoryState(userId);
      const segment: StorySegment = {
        id: 'intro',
        content: 'Story begins...',
        choices: []
      };
      
      storyState.addSegment(segment);
      
      const json = storyState.toJSON();
      
      expect(json).toEqual({
        userId,
        currentSegmentId: 'intro',
        segments: { intro: segment },
        choiceHistory: [],
        contextualData: {},
        readSegments: []
      });
    });
  });
  
  describe('fromJSON', () => {
    it('should create a story state from serialized data', () => {
      const serializedData = {
        userId: 'user123',
        currentSegmentId: 'segment1',
        segments: {
          intro: { id: 'intro', content: 'Story begins...', choices: [] },
          segment1: { id: 'segment1', content: 'Next part...', choices: [] }
        },
        choiceHistory: [{ segmentId: 'intro', choiceId: 'choice1', timestamp: new Date().toISOString() }],
        contextualData: { character: { name: 'Hero' } }
      };
      
      const storyState = StoryState.fromJSON(serializedData);
      
      expect(storyState.userId).toBe(serializedData.userId);
      expect(storyState.currentSegmentId).toBe(serializedData.currentSegmentId);
      expect(storyState.segments).toEqual(serializedData.segments);
      expect(storyState.contextualData).toEqual(serializedData.contextualData);
      // Check choiceHistory with timestamp conversion
      expect(storyState.choiceHistory.length).toBe(1);
      expect(storyState.choiceHistory[0].segmentId).toBe('intro');
      expect(storyState.choiceHistory[0].choiceId).toBe('choice1');
      expect(storyState.choiceHistory[0].timestamp).toBeInstanceOf(Date);
    });
  });
}); 