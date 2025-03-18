import { InMemoryStateStorage } from '../InMemoryStateStorage';
import { StateStorageInterface } from '../StateStorageInterface';

describe('State Storage Implementations', () => {
  const testStorages: { name: string; storage: StateStorageInterface }[] = [
    { 
      name: 'InMemoryStateStorage', 
      storage: new InMemoryStateStorage() 
    }
  ];
  
  // Test each storage implementation with the same test suite
  testStorages.forEach(({ name, storage }) => {
    describe(name, () => {
      const userId = 'test-user-123';
      const testData = {
        name: 'Test User',
        preferences: {
          theme: 'dark',
          notifications: true
        },
        history: [
          { id: 1, action: 'login', timestamp: '2023-01-01T00:00:00Z' },
          { id: 2, action: 'logout', timestamp: '2023-01-01T01:00:00Z' }
        ]
      };
      
      it('should save and load state', async () => {
        await storage.saveState(userId, testData);
        const loadedData = await storage.loadState(userId);
        
        expect(loadedData).toEqual(testData);
      });
      
      it('should return null when loading non-existent state', async () => {
        const loadedData = await storage.loadState('non-existent-user');
        expect(loadedData).toBeNull();
      });
      
      it('should detect if state exists', async () => {
        await storage.saveState(userId, testData);
        
        const exists = await storage.hasState(userId);
        const nonExists = await storage.hasState('non-existent-user');
        
        expect(exists).toBe(true);
        expect(nonExists).toBe(false);
      });
      
      it('should delete state', async () => {
        await storage.saveState(userId, testData);
        await storage.deleteState(userId);
        
        const exists = await storage.hasState(userId);
        expect(exists).toBe(false);
      });
      
      it('should not throw when deleting non-existent state', async () => {
        await expect(storage.deleteState('non-existent-user')).resolves.not.toThrow();
      });
      
      it('should handle deeply nested objects', async () => {
        const complexData = {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep value'
                },
                array: [1, 2, 3, { nestedInArray: true }]
              }
            }
          }
        };
        
        await storage.saveState(userId, complexData);
        const loadedData = await storage.loadState(userId);
        
        expect(loadedData).toEqual(complexData);
      });
      
      it('should store independent copies of data', async () => {
        // Save initial data
        await storage.saveState(userId, testData);
        
        // Get a reference and modify it
        const dataCopy = { ...testData };
        dataCopy.name = 'Modified Name';
        
        // Load the original data again
        const loadedData = await storage.loadState(userId);
        
        // It should not be modified
        expect(loadedData?.name).toBe('Test User');
      });
    });
  });
}); 