import request from 'supertest';
import express, { Router, Request, Response } from 'express';
import { createBaseRouter } from '../../routes/baseRouter';

describe('Base Router', () => {
  let app: express.Express;
  let testRouter: Router;
  
  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    
    // Create a test router
    testRouter = Router();
    testRouter.get('/test', (req: Request, res: Response) => {
      res.json({ message: 'Test endpoint', version: req.baseUrl });
    });
  });
  
  describe('API Versioning', () => {
    it('should prefix routes with the correct version', async () => {
      // Arrange
      const v1Router = createBaseRouter('v1');
      v1Router.use(testRouter);
      app.use((v1Router as any).mainRouter);
      
      // Act
      const response = await request(app)
        .get('/api/v1/test')
        .expect(200);
      
      // Assert
      expect(response.body.version).toBe('/api/v1');
    });
    
    it('should support multiple API versions simultaneously', async () => {
      // Arrange
      const v1Router = createBaseRouter('v1');
      const v2Router = createBaseRouter('v2');
      
      // Create a v2-specific route
      const v2TestRouter = Router();
      v2TestRouter.get('/test', (req: Request, res: Response) => {
        res.json({ message: 'V2 Test endpoint', version: req.baseUrl });
      });
      
      v1Router.use(testRouter);
      v2Router.use(v2TestRouter);
      
      app.use((v1Router as any).mainRouter);
      app.use((v2Router as any).mainRouter);
      
      // Act & Assert
      const v1Response = await request(app)
        .get('/api/v1/test')
        .expect(200);
      
      const v2Response = await request(app)
        .get('/api/v2/test')
        .expect(200);
      
      // Assert
      expect(v1Response.body.version).toBe('/api/v1');
      expect(v2Response.body.version).toBe('/api/v2');
      expect(v2Response.body.message).toBe('V2 Test endpoint');
    });
    
    it('should return 404 for non-existent versions', async () => {
      // Arrange
      const v1Router = createBaseRouter('v1');
      v1Router.use(testRouter);
      app.use((v1Router as any).mainRouter);
      
      // Act & Assert
      await request(app)
        .get('/api/v3/test')
        .expect(404);
    });
  });
  
  describe('Route Grouping', () => {
    it('should allow grouping routes by feature', async () => {
      // Arrange
      const v1Router = createBaseRouter('v1');
      
      // Create feature routers
      const usersRouter = Router();
      usersRouter.get('/profile', (req: Request, res: Response) => {
        res.json({ feature: 'users', endpoint: 'profile' });
      });
      
      const productsRouter = Router();
      productsRouter.get('/list', (req: Request, res: Response) => {
        res.json({ feature: 'products', endpoint: 'list' });
      });
      
      // Mount feature routers
      v1Router.use('/users', usersRouter);
      v1Router.use('/products', productsRouter);
      
      app.use((v1Router as any).mainRouter);
      
      // Act & Assert
      const usersResponse = await request(app)
        .get('/api/v1/users/profile')
        .expect(200);
      
      const productsResponse = await request(app)
        .get('/api/v1/products/list')
        .expect(200);
      
      // Assert
      expect(usersResponse.body.feature).toBe('users');
      expect(usersResponse.body.endpoint).toBe('profile');
      expect(productsResponse.body.feature).toBe('products');
      expect(productsResponse.body.endpoint).toBe('list');
    });
    
    it('should properly handle nested routes', async () => {
      // Arrange
      const v1Router = createBaseRouter('v1');
      
      // Create nested routers
      const usersRouter = Router();
      const userSettingsRouter = Router();
      
      userSettingsRouter.get('/preferences', (req: Request, res: Response) => {
        res.json({ 
          path: req.baseUrl + req.path,
          feature: 'users',
          subfeature: 'settings',
          endpoint: 'preferences'
        });
      });
      
      // Mount nested routers
      usersRouter.use('/settings', userSettingsRouter);
      v1Router.use('/users', usersRouter);
      app.use((v1Router as any).mainRouter);
      
      // Act
      const response = await request(app)
        .get('/api/v1/users/settings/preferences')
        .expect(200);
      
      // Assert
      expect(response.body.path).toBe('/api/v1/users/settings/preferences');
      expect(response.body.feature).toBe('users');
      expect(response.body.subfeature).toBe('settings');
      expect(response.body.endpoint).toBe('preferences');
    });
  });
}); 