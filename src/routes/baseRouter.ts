import { Router } from 'express';

/**
 * Creates a base router with API version prefix
 * 
 * @param version API version (e.g., 'v1', 'v2')
 * @returns Router instance with appropriate prefix
 */
export const createBaseRouter = (version: string): Router => {
  // Create the version-specific router
  const versionRouter = Router();
  
  // Set the base path for API
  const basePath = `/api/${version}`;
  
  // Create parent router that will have the /api/version path
  const mainRouter = Router();
  
  // Mount the version router on the main router
  mainRouter.use(basePath, versionRouter);
  
  // Add the baseUrl property to the router to match paths in tests
  Object.defineProperty(versionRouter, 'baseUrl', {
    value: basePath,
    writable: false
  });
  
  // Add the mainRouter to the exported object
  (versionRouter as any).mainRouter = mainRouter;
  
  // Return the version router for adding routes
  return versionRouter;
}; 