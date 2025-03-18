import { Request, Response, NextFunction } from 'express';

interface SecurityHeadersOptions {
  contentSecurityPolicy?: string;
  permissionsPolicy?: string;
  strictTransportSecurity?: string;
  referrerPolicy?: string;
}

/**
 * Middleware to set security headers for HTTP responses
 * 
 * @param options - Custom security header options
 * @returns Express middleware function
 */
export const securityHeaders = (options?: SecurityHeadersOptions) => {
  // Default values for security headers
  const defaultCSP = "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'";
  const defaultPermissions = "geolocation=(), microphone=(), camera=(), payment=(), accelerometer=(), gyroscope=()";
  const defaultHSTS = "max-age=31536000; includeSubDomains";
  const defaultReferrerPolicy = "strict-origin-when-cross-origin";

  // Return middleware function
  return (req: Request, res: Response, next: NextFunction) => {
    // Basic security headers
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-XSS-Protection', '1; mode=block');
    res.set('X-Frame-Options', 'DENY');
    
    // Content-Security-Policy
    res.set('Content-Security-Policy', options?.contentSecurityPolicy || defaultCSP);
    
    // HTTP Strict Transport Security
    res.set('Strict-Transport-Security', options?.strictTransportSecurity || defaultHSTS);
    
    // Referrer Policy
    res.set('Referrer-Policy', options?.referrerPolicy || defaultReferrerPolicy);
    
    // Permissions Policy
    res.set('Permissions-Policy', options?.permissionsPolicy || defaultPermissions);
    
    next();
  };
};

// Export a default instance with default options
export default securityHeaders(); 