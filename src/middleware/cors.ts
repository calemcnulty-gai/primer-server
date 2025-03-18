import cors from 'cors';
import { Request, Response, NextFunction } from 'express';

/**
 * CORS configuration options
 */
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', // Default to all origins if not specified
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

/**
 * CORS middleware
 * Configures Cross-Origin Resource Sharing for the API
 */
export const corsMiddleware = cors(corsOptions);

/**
 * Custom CORS error handler 
 * For when preflight requests fail
 */
export const corsErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err.name === 'CORSError') {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: 'CORS error: Request origin not allowed'
    });
  }
  next(err);
}; 