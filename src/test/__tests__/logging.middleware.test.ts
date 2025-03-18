import { Request, Response, NextFunction } from 'express';
import { loggingMiddleware } from '../../middleware/logging';

describe('Logging Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;
  let consoleLogSpy: jest.SpyInstance;
  let originalConsoleLog: any;

  beforeEach(() => {
    // Save original console.log
    originalConsoleLog = console.log;
    
    // Mock console.log for testing
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Setup mock request, response, and next function
    mockRequest = {
      method: 'GET',
      path: '/test',
      url: '/test',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      }
    };
    
    mockResponse = {
      statusCode: 200,
      on: jest.fn()
    };
    
    nextFunction = jest.fn();
  });

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog;
    jest.clearAllMocks();
  });

  it('should log request information when a request is received', () => {
    // Arrange
    const expectedLogPattern = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] GET \/test/;

    // Act
    loggingMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toMatch(expectedLogPattern);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should include user agent in the log', () => {
    // Act
    loggingMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('test-agent');
  });

  it('should log response information when response is finished', () => {
    // Arrange
    const responseOnMock = mockResponse.on as jest.Mock;
    let responseCallback: Function;

    // Act
    loggingMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(responseOnMock).toHaveBeenCalledWith('finish', expect.any(Function));
    
    // Get the callback passed to response.on('finish', callback)
    responseCallback = responseOnMock.mock.calls[0][1];
    
    // Trigger the response finish event
    responseCallback();
    
    // Verify response logging
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy.mock.calls[1][0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] Response: 200/);
  });

  it('should log the response time', () => {
    // Arrange
    const responseOnMock = mockResponse.on as jest.Mock;
    let responseCallback: Function;

    // Act
    loggingMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

    // Assert
    expect(responseOnMock).toHaveBeenCalledWith('finish', expect.any(Function));
    
    // Get the callback passed to response.on('finish', callback)
    responseCallback = responseOnMock.mock.calls[0][1];
    
    // Trigger the response finish event
    responseCallback();
    
    // Verify response logging includes response time
    expect(consoleLogSpy.mock.calls[1][0]).toMatch(/time: \d+ms/);
  });

  it('should work with requests that have no user-agent header', () => {
    // Arrange
    mockRequest.headers = {};
    
    // Act
    loggingMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    // Assert
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(nextFunction).toHaveBeenCalled();
  });
}); 