import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

describe('CI Configuration', () => {
  describe('GitHub Actions Workflow', () => {
    const workflowPath = path.join(process.cwd(), '.github/workflows/ci.yml');
    
    it('should have a valid GitHub Actions workflow file', () => {
      expect(fs.existsSync(workflowPath)).toBe(true);
    });

    it('should have a valid YAML structure', () => {
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      expect(() => yaml.load(workflowContent)).not.toThrow();
    });

    it('should run on push to main and pull requests', () => {
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      const config = yaml.load(workflowContent) as any;
      
      expect(config.on.push.branches).toContain('main');
      expect(config.on).toHaveProperty('pull_request');
    });

    it('should include node.js testing jobs', () => {
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      const config = yaml.load(workflowContent) as any;
      
      expect(config.jobs).toHaveProperty('test');
      expect(config.jobs.test.steps.some((step: any) => 
        step.run && step.run.includes('npm test')
      )).toBe(true);
    });

    it('should enforce code coverage thresholds', () => {
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      const config = yaml.load(workflowContent) as any;
      
      const coverageStep = config.jobs.test.steps.find((step: any) => 
        step.run && step.run.includes('npm run test:coverage')
      );
      
      expect(coverageStep).toBeDefined();
    });
  });

  describe('CI Environment Configuration', () => {
    it('should have a test environment configuration file', () => {
      const envPath = path.join(process.cwd(), '.env.ci');
      expect(fs.existsSync(envPath)).toBe(true);
    });
    
    it('should have required environment variables for CI', () => {
      const envPath = path.join(process.cwd(), '.env.ci');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      
      expect(envContent).toContain('NODE_ENV=test');
      expect(envContent).toContain('LOG_LEVEL=');
      expect(envContent).not.toContain('API_KEY=');
    });
  });
}); 