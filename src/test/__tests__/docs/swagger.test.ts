import request from 'supertest';
import app from '../../../app';

describe('API Documentation', () => {
  describe('GET /api-docs', () => {
    it('should serve Swagger UI', async () => {
      const response = await request(app).get('/api-docs').redirects(1);
      expect(response.status).toBe(200);
      expect(response.text).toContain('swagger-ui');
    });
  });

  describe('GET /api-docs/swagger.json', () => {
    it('should serve OpenAPI specification', async () => {
      const response = await request(app).get('/api-docs/swagger.json');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
    });
  });
}); 