export interface StateStorageInterface {
  /**
   * Saves state data for a user
   * @param userId User identifier
   * @param data The data to store
   */
  saveState(userId: string, data: Record<string, any>): Promise<void>;
  
  /**
   * Retrieves state data for a user
   * @param userId User identifier
   * @returns The stored data or null if not found
   */
  loadState(userId: string): Promise<Record<string, any> | null>;
  
  /**
   * Checks if state exists for a user
   * @param userId User identifier
   * @returns True if state exists
   */
  hasState(userId: string): Promise<boolean>;
  
  /**
   * Deletes state for a user
   * @param userId User identifier
   */
  deleteState(userId: string): Promise<void>;
} 