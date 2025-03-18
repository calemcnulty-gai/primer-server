import fs from 'fs';
import path from 'path';

describe('Deployment Scripts', () => {
  const scriptsPath = path.join(process.cwd(), 'scripts');

  describe('Deployment Script Structure', () => {
    it('should have a scripts directory', () => {
      expect(fs.existsSync(scriptsPath)).toBe(true);
    });

    it('should have a deploy.sh script', () => {
      const deployScriptPath = path.join(scriptsPath, 'deploy.sh');
      expect(fs.existsSync(deployScriptPath)).toBe(true);
    });

    it('should have executable permissions on deploy.sh', () => {
      const deployScriptPath = path.join(scriptsPath, 'deploy.sh');
      const stats = fs.statSync(deployScriptPath);
      expect(stats.mode & fs.constants.S_IXUSR).toBeTruthy();
    });
  });

  describe('Deployment Script Content', () => {
    it('should have a shebang line', () => {
      const deployScriptPath = path.join(scriptsPath, 'deploy.sh');
      const content = fs.readFileSync(deployScriptPath, 'utf-8');
      expect(content).toMatch(/^#!\/bin\/bash/);
    });

    it('should contain environment variable checks', () => {
      const deployScriptPath = path.join(scriptsPath, 'deploy.sh');
      const content = fs.readFileSync(deployScriptPath, 'utf-8');
      expect(content).toContain('ENV=');
    });

    it('should contain build commands', () => {
      const deployScriptPath = path.join(scriptsPath, 'deploy.sh');
      const content = fs.readFileSync(deployScriptPath, 'utf-8');
      expect(content).toMatch(/npm (run )?build/);
    });

    it('should handle errors', () => {
      const deployScriptPath = path.join(scriptsPath, 'deploy.sh');
      const content = fs.readFileSync(deployScriptPath, 'utf-8');
      expect(content).toContain('set -e');
    });
  });

  describe('Environment Configuration', () => {
    it('should have environment-specific configuration files', () => {
      expect(fs.existsSync(path.join(process.cwd(), '.env.development'))).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), '.env.production'))).toBe(true);
    });

    it('should have appropriate environment variables in each config', () => {
      const devEnv = fs.readFileSync(path.join(process.cwd(), '.env.development'), 'utf-8');
      const prodEnv = fs.readFileSync(path.join(process.cwd(), '.env.production'), 'utf-8');

      expect(devEnv).toContain('NODE_ENV=development');
      expect(prodEnv).toContain('NODE_ENV=production');
    });
  });
}); 