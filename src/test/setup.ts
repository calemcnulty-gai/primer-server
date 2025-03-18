import { Express } from 'express';

declare global {
  namespace NodeJS {
    interface Global {
      app: Express;
    }
  }
}

// Increase timeout for async tests
jest.setTimeout(10000);

// Add custom matchers if needed
expect.extend({
  // Add custom matchers here
}); 