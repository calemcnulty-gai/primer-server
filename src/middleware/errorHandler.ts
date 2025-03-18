import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: any;
  
  constructor(statusCode: number, message: string, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`Error: ${err.message}`);
  
  // Log stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // If response formatter is available, use it
  if (res.formatter) {
    // If it's our custom API error
    if (err instanceof ApiError) {
      return res.formatter.error({
        message: err.message,
        code: err.code,
        details: err.details
      }, err.statusCode);
    }

    // For unknown errors
    return res.formatter.error({
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    }, 500);
  }
  
  // Fallback if formatter is not available (should not happen)
  // If it's our custom API error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code || 'API_ERROR',
        details: err.details
      }
    });
  }

  // For unknown errors
  return res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    }
  });
}; 