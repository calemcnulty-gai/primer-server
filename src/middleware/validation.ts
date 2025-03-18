import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

// Type definition for schema validation options
interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Middleware factory for validating request data against zod schemas
 * 
 * @param schemas Object containing zod schemas for body, query, and/or params
 * @returns Express middleware function
 */
export const validate = (schemas: ValidationSchemas) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request body if schema is provided
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      // Validate request query if schema is provided
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }

      // Validate request params if schema is provided
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
        return;
      }

      // For any other type of error, pass to the next error handler
      next(error);
    }
  };
}; 