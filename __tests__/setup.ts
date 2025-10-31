/**
 * Jest Setup File
 * Runs once before all tests
 */

// Increase timeout for all tests (mongodb-memory-server can be slow on first run)
jest.setTimeout(60000)

// Suppress console output during tests (optional, uncomment if needed)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// }

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'error' // Reduce log noise during tests

