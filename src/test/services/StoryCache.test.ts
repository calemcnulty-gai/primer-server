import { StoryCache } from '../../services/StoryCache';
import { StoryContext } from '../../models/StoryContext';

describe('StoryCache', () => {
  let cache: StoryCache;

  beforeEach(() => {
    cache = new StoryCache();
  });

  describe('story segment caching', () => {
    const mockContext: StoryContext = {
      userId: 'test-user-1',
      genre: 'fantasy',
      tone: 'adventurous',
      character: 'wizard',
      setting: 'magical forest'
    };

    const mockSegment = 'The wizard ventured deeper into the magical forest...';

    it('should store and retrieve story segments', () => {
      cache.setStorySegment(mockContext, mockSegment);
      const retrieved = cache.getStorySegment(mockContext);
      expect(retrieved).toBe(mockSegment);
    });

    it('should return null for non-existent segments', () => {
      const differentContext: StoryContext = { ...mockContext, genre: 'sci-fi' };
      const result = cache.getStorySegment(differentContext);
      expect(result).toBeNull();
    });

    it('should handle cache invalidation after TTL expires', async () => {
      cache = new StoryCache(100); // 100ms TTL
      cache.setStorySegment(mockContext, mockSegment);
      
      // Verify immediate retrieval works
      expect(cache.getStorySegment(mockContext)).toBe(mockSegment);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify entry is invalidated
      expect(cache.getStorySegment(mockContext)).toBeNull();
    });
  });

  describe('story choices caching', () => {
    const mockContext: StoryContext = {
      userId: 'test-user-2',
      genre: 'mystery',
      tone: 'suspenseful',
      character: 'detective',
      setting: 'mansion'
    };

    const mockChoices = [
      'Investigate the library',
      'Question the butler',
      'Search the garden'
    ];

    it('should store and retrieve story choices', () => {
      cache.setChoices(mockContext, mockChoices);
      const retrieved = cache.getChoices(mockContext);
      expect(retrieved).toEqual(mockChoices);
    });

    it('should return null for non-existent choices', () => {
      const differentContext: StoryContext = { ...mockContext, genre: 'horror' };
      const result = cache.getChoices(differentContext);
      expect(result).toBeNull();
    });

    it('should handle cache invalidation after TTL expires', async () => {
      cache = new StoryCache(100); // 100ms TTL
      cache.setChoices(mockContext, mockChoices);
      
      // Verify immediate retrieval works
      expect(cache.getChoices(mockContext)).toEqual(mockChoices);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify entry is invalidated
      expect(cache.getChoices(mockContext)).toBeNull();
    });
  });

  describe('cache management', () => {
    it('should clear all cached entries', () => {
      const context1: StoryContext = { userId: 'test-user-3', genre: 'fantasy', character: 'warrior' };
      const context2: StoryContext = { userId: 'test-user-4', genre: 'sci-fi', character: 'astronaut' };
      
      cache.setStorySegment(context1, 'segment1');
      cache.setStorySegment(context2, 'segment2');
      cache.setChoices(context1, ['choice1', 'choice2']);
      
      cache.clear();
      
      expect(cache.getStorySegment(context1)).toBeNull();
      expect(cache.getStorySegment(context2)).toBeNull();
      expect(cache.getChoices(context1)).toBeNull();
    });

    it('should enforce maximum cache size', () => {
      cache = new StoryCache(1000, 2); // TTL 1000ms, max 2 entries
      
      const contexts = Array.from({ length: 3 }).map((_, i) => ({
        userId: `test-user-${i+5}`,
        genre: `genre${i}`,
        character: `character${i}`
      }));
      
      // Add 3 entries to a cache that only holds 2
      contexts.forEach((ctx, i) => {
        cache.setStorySegment(ctx, `segment${i}`);
      });
      
      // First entry should be evicted
      expect(cache.getStorySegment(contexts[0])).toBeNull();
      
      // Later entries should still be present
      expect(cache.getStorySegment(contexts[1])).toBe('segment1');
      expect(cache.getStorySegment(contexts[2])).toBe('segment2');
    });
  });
}); 