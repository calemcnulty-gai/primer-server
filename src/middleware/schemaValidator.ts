import { Request, Response, NextFunction, RequestHandler } from 'express';
import { OpenAPIV3 } from 'openapi-types';
import Ajv from 'ajv';
import { ApiError } from './errorHandler';
import { generateApiDocs } from '../test/docs/api.docs';

function isReferenceObject(obj: any): obj is OpenAPIV3.ReferenceObject {
  return obj && typeof obj === 'object' && '$ref' in obj;
}

function isRequestBodyObject(obj: any): obj is OpenAPIV3.RequestBodyObject {
  return obj && typeof obj === 'object' && 'content' in obj;
}

export function getOpenApiSchema(): OpenAPIV3.Document {
  return generateApiDocs();
}

export async function validateAgainstSchema(
  operation: OpenAPIV3.OperationObject,
  req: Request
): Promise<string[]> {
  const errors: string[] = [];

  // Validate request body if present
  if (operation.requestBody) {
    if (isReferenceObject(operation.requestBody)) {
      // Skip validation for reference objects for now
      // In a complete implementation we would resolve the reference and validate against it
      console.warn(`Reference object found in requestBody: ${operation.requestBody.$ref}. Validation skipped.`);
      return [];
    } else if (isRequestBodyObject(operation.requestBody)) {
      const contentType = Object.keys(operation.requestBody.content || {})[0] || 'application/json';
      const schema = operation.requestBody.content?.[contentType]?.schema;

      if (schema) {
        if (isReferenceObject(schema)) {
          console.warn(`Reference object found in schema: ${schema.$ref}. Validation skipped.`);
          return [];
        }

        try {
          const ajv = new Ajv({ allErrors: true, coerceTypes: true });
          const validate = ajv.compile(schema);
          const valid = validate(req.body);

          if (!valid && validate.errors) {
            errors.push(...validate.errors.map(err => `Body validation error: ${err.message}`));
          }
        } catch (error: any) {
          errors.push(`Validation error: ${error?.message || 'Unknown error'}`);
        }
      }
    }
  }

  // Validate parameters if present (headers, query params, etc.)
  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (isReferenceObject(param)) {
        console.warn(`Reference object found in parameter: ${param.$ref}. Validation skipped.`);
        continue;
      }

      if (param.schema) {
        if (isReferenceObject(param.schema)) {
          console.warn(`Reference object found in parameter schema: ${param.schema.$ref}. Validation skipped.`);
          continue;
        }

        try {
          const ajv = new Ajv({ allErrors: true, coerceTypes: true });
          const validate = ajv.compile(param.schema);
          let paramValue;
          
          // Get parameter value based on the 'in' property
          switch (param.in) {
            case 'query':
              paramValue = req.query[param.name];
              break;
            case 'header':
              // Handle case-insensitive headers
              paramValue = req.headers[param.name.toLowerCase()];
              break;
            case 'path':
              paramValue = req.params[param.name];
              break;
            default:
              continue; // Skip other parameter types for now
          }

          if (param.required && paramValue === undefined) {
            errors.push(`Required ${param.in} parameter '${param.name}' is missing`);
          } else if (paramValue !== undefined) {
            const valid = validate(paramValue);
            if (!valid && validate.errors) {
              errors.push(...validate.errors.map(err => `${param.in} parameter '${param.name}' validation error: ${err.message}`));
            }
          }
        } catch (error: any) {
          errors.push(`Validation error for parameter '${param.name}': ${error?.message || 'Unknown error'}`);
        }
      }
    }
  }

  return errors;
}

export function schemaValidationMiddleware(path: string, method: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = getOpenApiSchema();
      const pathItem = schema.paths?.[path] as OpenAPIV3.PathItemObject | undefined;
      const operation = pathItem?.[method.toLowerCase() as OpenAPIV3.HttpMethods];

      if (!operation) {
        return next();
      }

      const errors = await validateAgainstSchema(operation, req);

      if (errors.length > 0) {
        // Create the error with the correct parameter order
        const error = new ApiError(
          400,                // statusCode
          errors.join(', '),  // message
          'VALIDATION_ERROR'  // code
        );
        return next(error);
      } else {
        return next();
      }
    } catch (error: any) {
      // Create the error with the correct parameter order
      const internalError = new ApiError(
        500,                                                            // statusCode
        error?.message || 'An unexpected error occurred during validation', // message
        'INTERNAL_ERROR'                                                // code
      );
      return next(internalError);
    }
  };
} 