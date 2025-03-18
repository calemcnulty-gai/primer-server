import { Request, Response } from 'express';
import { securityHeaders } from '../securityHeaders.middleware';

describe('Security Headers Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  const mockNext = jest.fn();

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      setHeader: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
    mockNext.mockClear();
  });

  it('should set security headers', () => {
    // Get the middleware function
    const middleware = securityHeaders();
    
    // Execute the middleware
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    // Check that the critical security headers are set
    expect(mockResponse.set).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(mockResponse.set).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(mockResponse.set).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(mockResponse.set).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    expect(mockResponse.set).toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
    expect(mockResponse.set).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect(mockResponse.set).toHaveBeenCalledWith('Permissions-Policy', expect.any(String));
    
    // Check that the next middleware is called
    expect(mockNext).toHaveBeenCalled();
  });

  it('should set appropriate Content-Security-Policy', () => {
    const middleware = securityHeaders();
    
    middleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    // Get the CSP value that was set
    const cspValue = (mockResponse.set as jest.Mock).mock.calls.find(
      call => call[0] === 'Content-Security-Policy'
    )[1];

    // Verify CSP contains essential directives
    expect(cspValue).toContain("default-src 'self'");
    expect(cspValue).toContain("script-src");
    expect(cspValue).toContain("img-src");
    expect(cspValue).toContain("connect-src");
    expect(cspValue).toContain("style-src");
    expect(cspValue).toContain("frame-ancestors 'none'");
  });

  it('should set appropriate Permissions-Policy', () => {
    const middleware = securityHeaders();
    
    middleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    // Get the Permissions Policy value that was set
    const permissionsValue = (mockResponse.set as jest.Mock).mock.calls.find(
      call => call[0] === 'Permissions-Policy'
    )[1];

    // Verify Permissions Policy contains essential restrictions
    expect(permissionsValue).toContain('geolocation=()');
    expect(permissionsValue).toContain('microphone=()');
    expect(permissionsValue).toContain('camera=()');
  });

  it('should allow custom CSP settings when provided', () => {
    // Create middleware with custom settings
    const customMiddleware = securityHeaders({
      contentSecurityPolicy: "default-src 'self' custom-domain.com"
    });
    
    customMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    // Get the CSP value that was set
    const cspValue = (mockResponse.set as jest.Mock).mock.calls.find(
      call => call[0] === 'Content-Security-Policy'
    )[1];

    // Verify CSP contains custom domain
    expect(cspValue).toContain("custom-domain.com");
  });
}); 