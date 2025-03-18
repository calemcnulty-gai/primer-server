import { StoryContext } from '../models/StoryContext';

interface UserPreferences {
  tone?: string;
  genre?: string;
  audience?: string;
  [key: string]: any;
}

export class PersonalizationManager {
  private userPreferences: Record<string, UserPreferences> = {};
  
  private readonly DEFAULT_PREFERENCES: UserPreferences = {
    tone: 'neutral',
    audience: 'general',
    genre: 'adventure'
  };
  
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const storedPrefs = this.userPreferences[userId] || {};
    return {
      ...this.DEFAULT_PREFERENCES,
      ...storedPrefs
    };
  }
  
  async updateUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    this.userPreferences[userId] = {
      ...(this.userPreferences[userId] || {}),
      ...preferences
    };
  }
  
  async enrichContext(baseContext: StoryContext): Promise<StoryContext> {
    const { userId } = baseContext;
    if (!userId) {
      return baseContext;
    }
    
    const userPrefs = await this.getUserPreferences(userId);
    
    return {
      ...userPrefs,
      ...baseContext // Base context overrides preferences
    };
  }
} 