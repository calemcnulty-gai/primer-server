import { startTimer, recordResponseTime } from '../../../utils/performance';

describe('Performance Tracking Utilities', () => {
  describe('startTimer', () => {
    it('should return a function to get elapsed time', () => {
      // Arrange & Act
      const endTimer = startTimer();
      
      // Assert
      expect(typeof endTimer).toBe('function');
    });
    
    it('should measure elapsed time', async () => {
      // Arrange
      const endTimer = startTimer();
      
      // Act - wait a small amount of time
      await new Promise(resolve => setTimeout(resolve, 10));
      const elapsedMs = endTimer();
      
      // Assert
      expect(elapsedMs).toBeGreaterThan(0);
      expect(typeof elapsedMs).toBe('number');
    });
  });
  
  describe('recordResponseTime', () => {
    // Create a spy to verify it was called
    const originalConsoleLog = console.log;
    let consoleLogSpy: jest.SpyInstance;
    
    beforeEach(() => {
      // Mock console.log to capture calls
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    
    afterEach(() => {
      // Restore original console.log
      consoleLogSpy.mockRestore();
    });
    
    it('should record response time with path and method', () => {
      // Arrange
      const path = '/api/test';
      const method = 'GET';
      const time = 123.45;
      
      // Act
      recordResponseTime(path, method, time);
      
      // Assert
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0][0];
      expect(logCall).toContain(path);
      expect(logCall).toContain(method);
      expect(logCall).toContain(time.toString());
    });
    
    it('should handle zero and very small times', () => {
      // Arrange & Act
      recordResponseTime('/api/test', 'GET', 0);
      recordResponseTime('/api/test2', 'POST', 0.001);
      
      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });
  });
}); 