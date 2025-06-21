// Jest setup file

// Mock console.log to reduce noise in tests
const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
});

// Test utilities (can be imported in individual test files if needed)
export const testUtils = {
  // Helper to wait for a specific time
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to create mock orders
  createMockOrder: (tokenIn: string, tokenOut: string, amount: number) => ({
    tokenIn,
    tokenOut,
    amount,
    timestamp: new Date()
  })
}; 