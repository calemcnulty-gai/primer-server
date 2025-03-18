import request from 'supertest';
import app from '../../app';

describe('Health Check API', () => {
  describe('GET /health', () => {
    it('should return 200 OK with status and timestamp', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data.status', 'ok');
      expect(response.body.data.timestamp).toBeDefined();
    });

    it('should return a current timestamp', async () => {
      const before = new Date();
      
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      const after = new Date();

      const responseTime = new Date(response.body.data.timestamp);
      expect(responseTime).toBeInstanceOf(Date);
      expect(responseTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(responseTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
}); 