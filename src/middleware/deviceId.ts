import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedUser } from '../models/Auth';

/**
 * Middleware to handle device ID
 * For demo purposes, this simply attaches the device ID from headers to the request
 */
export const attachDeviceId: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const deviceId = req.headers['x-device-id'] as string;
  
  // For demo purposes, we'll use a placeholder if no device ID is provided
  const user: AuthenticatedUser = {
    id: deviceId || 'demo-device',
    metadata: {}
  };
  
  req.user = user;
  next();
}; 