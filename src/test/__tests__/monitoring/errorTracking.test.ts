import { captureError, captureMessage } from '../../../utils/errorTracking';

describe('Error Tracking Utilities', () => {
  // Create spies to verify they were called
  let consoleErrorSpy: jest.SpyInstance;
  
  beforeEach(() => {
    // Mock console.error to capture calls
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore original console.error
    consoleErrorSpy.mockRestore();
  });
  
  describe('captureError', () => {
    it('should log error object with context', () => {
      // Arrange
      const error = new Error('Test error');
      const context = { path: '/api/test', method: 'GET', userId: '123' };
      
      // Act
      captureError(error, context);
      
      // Assert
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error captured');
      expect(consoleErrorSpy.mock.calls[0][1]).toBe(error);
      expect(consoleErrorSpy.mock.calls[0][2]).toBe(context);
    });
    
    it('should handle error without context', () => {
      // Arrange
      const error = new Error('Test error without context');
      
      // Act
      captureError(error);
      
      // Assert
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error captured');
      expect(consoleErrorSpy.mock.calls[0][1]).toBe(error);
    });
  });
  
  describe('captureMessage', () => {
    it('should log message with context', () => {
      // Arrange
      const message = 'Test message';
      const context = { path: '/api/test', method: 'GET', userId: '123' };
      
      // Act
      captureMessage(message, context);
      
      // Assert
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Message captured');
      expect(consoleErrorSpy.mock.calls[0][1]).toBe(message);
      expect(consoleErrorSpy.mock.calls[0][2]).toBe(context);
    });
    
    it('should handle message without context', () => {
      // Arrange
      const message = 'Test message without context';
      
      // Act
      captureMessage(message);
      
      // Assert
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Message captured');
      expect(consoleErrorSpy.mock.calls[0][1]).toBe(message);
    });
  });
}); 