import { PersonalizationManager } from '../PersonalizationManager';
import { StoryContext } from '../../models/StoryContext';

describe('PersonalizationManager', () => {
  let manager: PersonalizationManager;

  beforeEach(() => {
    manager = new PersonalizationManager();
  });

  describe('getUserPreferences', () => {
    it('should return default preferences for new user', async () => {
      const userId = 'new-user-123';
      const preferences = await manager.getUserPreferences(userId);
      
      expect(preferences).toEqual({
        tone: 'neutral',
        audience: 'general',
        genre: 'adventure'
      });
    });

    it('should merge stored preferences with defaults', async () => {
      const userId = 'existing-user-123';
      const storedPrefs = {
        tone: 'dark',
        customSetting: 'space'
      };
      
      await manager.updateUserPreferences(userId, storedPrefs);
      const preferences = await manager.getUserPreferences(userId);
      
      expect(preferences).toEqual({
        tone: 'dark', // From stored
        audience: 'general', // From default
        genre: 'adventure', // From default
        customSetting: 'space' // From stored
      });
    });
  });

  describe('updateUserPreferences', () => {
    it('should update specific preferences while preserving others', async () => {
      const userId = 'user-456';
      
      // Set initial preferences
      await manager.updateUserPreferences(userId, {
        tone: 'light',
        genre: 'mystery',
        audience: 'young adults'
      });

      // Update just one preference
      await manager.updateUserPreferences(userId, {
        tone: 'dark'
      });

      const preferences = await manager.getUserPreferences(userId);
      expect(preferences).toEqual({
        tone: 'dark', // Updated
        genre: 'mystery', // Preserved
        audience: 'young adults' // Preserved
      });
    });
  });

  describe('enrichContext', () => {
    it('should enrich story context with user preferences', async () => {
      const userId = 'user-789';
      const baseContext: StoryContext = {
        userId,
        character_name: 'Alex',
        location: 'Mystery Manor'
      };

      await manager.updateUserPreferences(userId, {
        tone: 'mysterious',
        genre: 'horror',
        audience: 'adults'
      });

      const enrichedContext = await manager.enrichContext(baseContext);
      expect(enrichedContext).toEqual({
        userId,
        character_name: 'Alex',
        location: 'Mystery Manor',
        tone: 'mysterious',
        genre: 'horror',
        audience: 'adults'
      });
    });

    it('should prioritize explicit context over preferences', async () => {
      const userId = 'user-101';
      const baseContext: StoryContext = {
        userId,
        tone: 'happy', // Explicit in context
        location: 'Beach'
      };

      await manager.updateUserPreferences(userId, {
        tone: 'dark', // Should not override explicit
        genre: 'romance',
        audience: 'young adults'
      });

      const enrichedContext = await manager.enrichContext(baseContext);
      expect(enrichedContext).toEqual({
        userId,
        tone: 'happy', // Kept from explicit context
        location: 'Beach',
        genre: 'romance', // From preferences
        audience: 'young adults' // From preferences
      });
    });
  });
}); 