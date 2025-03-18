import { StateStorageInterface } from './StateStorageInterface';

/**
 * In-memory implementation of the state storage interface for development and testing
 */
export class InMemoryStateStorage implements StateStorageInterface {
  private stateStore: Map<string, Record<string, any>> = new Map();
  
  /**
   * Saves state data for a user in memory
   */
  async saveState(userId: string, data: Record<string, any>): Promise<void> {
    // Create a deep copy to avoid reference issues
    const dataCopy = JSON.parse(JSON.stringify(data));
    this.stateStore.set(userId, dataCopy);
  }
  
  /**
   * Retrieves state data for a user from memory
   */
  async loadState(userId: string): Promise<Record<string, any> | null> {
    const data = this.stateStore.get(userId);
    
    if (!data) {
      return null;
    }
    
    // Return a deep copy to avoid reference issues
    return JSON.parse(JSON.stringify(data));
  }
  
  /**
   * Checks if state exists for a user in memory
   */
  async hasState(userId: string): Promise<boolean> {
    return this.stateStore.has(userId);
  }
  
  /**
   * Deletes state for a user from memory
   */
  async deleteState(userId: string): Promise<void> {
    this.stateStore.delete(userId);
  }
  
  /**
   * Clears all state data (useful for testing)
   */
  clearAll(): void {
    this.stateStore.clear();
  }
} 