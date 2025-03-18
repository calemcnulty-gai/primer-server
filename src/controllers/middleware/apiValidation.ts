import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

type RequestLocation = 'body' | 'query' | 'params';
type ValidationError = { path: string; message: string };

/**
 * Controller class for handling API request validation
 * Provides middleware for validating request data against Zod schemas
 */
export class ApiValidation {
  /**
   * Creates a middleware function that validates a specific part of a request
   * @param location Where to find the data to validate ('body', 'query', or 'params')
   * @param schema Zod schema to validate against
   * @returns Express middleware function
   */
  validate(location: RequestLocation, schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Get the data to validate from the request
        const dataToValidate = req[location];
        
        // Validate the data against the schema
        const validatedData = await schema.parseAsync(dataToValidate);
        
        // Replace the original data with the validated (and potentially transformed) data
        req[location] = validatedData;
        
        // Continue to the next middleware/controller
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          // Format the error response
          this.handleValidationError(res, error);
          return;
        }
        
        // For any other type of error, pass to the next error handler
        next(error);
      }
    };
  }
  
  /**
   * Formats and sends validation error responses
   * @param res Express response object
   * @param error Zod validation error
   */
  private handleValidationError(res: Response, error: ZodError): void {
    // Format the errors into a more readable structure
    const formattedErrors: ValidationError[] = error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message
    }));
    
    // Send the error response
    res.status(400).json({
      error: 'Validation failed',
      errors: formattedErrors
    });
  }
} 