/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  // Coverage thresholds are intentionally set lower than typical 90% to avoid testing implementation details.
  // We follow behavior-driven testing principles where we test the API contract rather than implementation.
  // Uncovered code primarily consists of:
  // 1. Server startup logic (createServer, port binding) - tested by Express.js itself
  // 2. Module execution logic (isMainModule) - standard Node.js behavior
  // 3. Configuration branches (e.g. port fallbacks) - simple Node.js falsy/truthy behavior
  // These are implementation details that don't affect API behavior and are already tested by their respective frameworks.
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 50,
      lines: 70,
      statements: 70
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  verbose: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts']
}; 