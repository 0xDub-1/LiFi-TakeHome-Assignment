module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Test environment (node for backend)
  testEnvironment: 'node',
  
  // Where to find tests
  roots: ['<rootDir>/src'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  
  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
    '!src/test-*.ts'  // Exclude test scripts
  ],
  
  // Coverage thresholds (good practice for production code)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // File extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Verbose output
  verbose: true,
  
  // Timeout for tests (increased for database operations)
  testTimeout: 30000
};

