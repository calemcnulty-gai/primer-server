import fs from 'fs';
import path from 'path';

describe('Environment Configuration', () => {
  const envFiles = {
    development: '.env.development',
    production: '.env.production'
  };

  describe('Environment Files', () => {
    it('should have all required environment files', () => {
      Object.values(envFiles).forEach(file => {
        expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
      });
    });

    it('should have valid environment variables in development', () => {
      const devEnv = fs.readFileSync(path.join(process.cwd(), envFiles.development), 'utf-8');
      expect(devEnv).toContain('NODE_ENV=development');
      expect(devEnv).not.toContain('NODE_ENV=production');
    });

    it('should have valid environment variables in production', () => {
      const prodEnv = fs.readFileSync(path.join(process.cwd(), envFiles.production), 'utf-8');
      expect(prodEnv).toContain('NODE_ENV=production');
      expect(prodEnv).not.toContain('NODE_ENV=development');
    });

    it('should have consistent variable names across environments', () => {
      const devEnv = fs.readFileSync(path.join(process.cwd(), envFiles.development), 'utf-8');
      const prodEnv = fs.readFileSync(path.join(process.cwd(), envFiles.production), 'utf-8');

      const devVars = devEnv.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      const prodVars = prodEnv.split('\n').filter(line => line.trim() && !line.startsWith('#'));

      const devVarNames = devVars.map(line => line.split('=')[0]);
      const prodVarNames = prodVars.map(line => line.split('=')[0]);

      expect(devVarNames.sort()).toEqual(prodVarNames.sort());
    });
  });
}); 