import { AuthenticatedUser } from '../models/Auth';
import { ResponseFormatter } from '../middleware/responseFormatter';
import { Request } from 'express';

// Add RequestWithUser interface
export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
    interface Response {
      formatter: ResponseFormatter;
    }
  }
}

export {}; 