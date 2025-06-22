import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5433';
process.env.DB_NAME = process.env.DB_NAME || 'order_execution_test';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// Global test timeout
jest.setTimeout(30000);

// Mock console for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
(global as any).sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cleanup function for tests
global.afterEach(async () => {
  // Add any global cleanup here
});

export {}; 