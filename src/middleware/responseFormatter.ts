import { Request, Response, NextFunction } from 'express';

// Types for response formatter options
export interface ResponseFormatterOptions {
  successKey?: string;
  errorKey?: string;
  includeTimestamp?: boolean;
}

// Default options
const defaultOptions: ResponseFormatterOptions = {
  successKey: 'success',
  errorKey: 'error',
  includeTimestamp: true
};

// Success response data type
export interface SuccessResponse {
  data?: any;
  message?: string;
  [key: string]: any;
}

// Error response data type
export interface ErrorResponse {
  message: string;
  code?: string;
  details?: any;
  [key: string]: any;
}

// Pagination data type
export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Paginated response data type
export interface PaginatedResponse {
  data: any[];
  pagination: PaginationData;
  message?: string;
}

// Response formatter methods
export interface ResponseFormatter {
  success: (data: SuccessResponse, statusCode?: number) => void;
  error: (error: ErrorResponse, statusCode?: number) => void;
  paginated: (data: PaginatedResponse, statusCode?: number) => void;
}

// Extend Express Response interface
declare global {
  namespace Express {
    interface Response {
      formatter: ResponseFormatter;
    }
  }
}

/**
 * Middleware to standardize API responses
 * 
 * @param options Configuration options
 * @returns Express middleware
 */
export const responseFormatter = (options: ResponseFormatterOptions = {}) => {
  // Merge default options with provided options
  const config = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Create timestamp if enabled
    const timestamp = config.includeTimestamp ? new Date().toISOString() : undefined;

    // Define formatter object
    const formatter: ResponseFormatter = {
      // Success response formatter
      success: (data: SuccessResponse, statusCode = 200) => {
        const response: any = {
          [config.successKey!]: true
        };

        // Add data if provided
        if (data !== undefined) {
          if (data.data !== undefined) {
            response.data = data.data;
          } else if (typeof data === 'object' && !Array.isArray(data)) {
            // If data is an object but doesn't have a data property, 
            // treat the whole object as data except for specific properties
            response.data = {};
            Object.keys(data).forEach(key => {
              if (key !== 'message') {
                response.data[key] = data[key];
              }
            });
          }
        }

        // Add message if provided
        if (data && data.message !== undefined) {
          response.message = data.message;
        }

        // Add timestamp if enabled
        if (timestamp) {
          response.timestamp = timestamp;
        }

        res.status(statusCode).json(response);
      },

      // Error response formatter
      error: (error: ErrorResponse, statusCode = 500) => {
        const response: any = {
          [config.successKey!]: false,
          [config.errorKey!]: {
            message: error.message
          }
        };

        // Add error code if provided
        if (error.code) {
          response[config.errorKey!].code = error.code;
        }

        // Add error details if provided
        if (error.details) {
          response[config.errorKey!].details = error.details;
        }

        // Add any other properties
        Object.keys(error).forEach(key => {
          if (key !== 'message' && key !== 'code' && key !== 'details') {
            response[config.errorKey!][key] = error[key];
          }
        });

        // Add timestamp if enabled
        if (timestamp) {
          response.timestamp = timestamp;
        }

        res.status(statusCode).json(response);
      },

      // Paginated response formatter
      paginated: (data: PaginatedResponse, statusCode = 200) => {
        const response: any = {
          [config.successKey!]: true,
          data: data.data,
          pagination: data.pagination
        };

        // Add message if provided
        if (data.message) {
          response.message = data.message;
        }

        // Add timestamp if enabled
        if (timestamp) {
          response.timestamp = timestamp;
        }

        res.status(statusCode).json(response);
      }
    };

    // Attach formatter methods to response object
    res.formatter = formatter;
    
    // Continue to next middleware
    next();
  };
}; 