import fs from 'fs';
import path from 'path';

describe('Monitoring Configuration', () => {
  const monitoringConfigPath = path.join(process.cwd(), 'src/config/monitoring.ts');
  
  describe('Monitoring Config Structure', () => {
    it('should have a monitoring configuration file', () => {
      expect(fs.existsSync(monitoringConfigPath)).toBe(true);
    });

    it('should export monitoring configuration', () => {
      // We need to require the file to check its exports
      const monitoringConfig = require(monitoringConfigPath);
      expect(monitoringConfig).toBeDefined();
      expect(monitoringConfig.default).toBeDefined();
    });
  });

  describe('Health Check Configuration', () => {
    it('should configure health check endpoint', () => {
      const monitoringConfig = require(monitoringConfigPath);
      expect(monitoringConfig.default.healthCheck).toBeDefined();
      expect(monitoringConfig.default.healthCheck.enabled).toBe(true);
      expect(monitoringConfig.default.healthCheck.path).toBe('/health');
    });
  });

  describe('Performance Monitoring', () => {
    it('should configure performance monitoring', () => {
      const monitoringConfig = require(monitoringConfigPath);
      expect(monitoringConfig.default.performance).toBeDefined();
      expect(monitoringConfig.default.performance.enabled).toBeDefined();
    });
    
    it('should have response time tracking', () => {
      const monitoringConfig = require(monitoringConfigPath);
      expect(monitoringConfig.default.performance.responseTime).toBeDefined();
      expect(monitoringConfig.default.performance.responseTime.enabled).toBeDefined();
    });
  });

  describe('Error Tracking', () => {
    it('should configure error tracking', () => {
      const monitoringConfig = require(monitoringConfigPath);
      expect(monitoringConfig.default.errorTracking).toBeDefined();
      expect(monitoringConfig.default.errorTracking.enabled).toBeDefined();
    });
  });
}); 