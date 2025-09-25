import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/__tests__/**'
      ]
    },
    // Only run integration tests when explicitly requested
    include: ['**/*.integration.test.ts'],
    // Disable file parallelization for integration tests to avoid conflicts
    fileParallelism: false
  },
  resolve: {
    alias: {
      '@db-bridge/core': path.resolve(__dirname, '../../packages/core/src'),
      '@db-bridge/mysql': path.resolve(__dirname, '../../packages/mysql/src'),
      '@db-bridge/postgresql': path.resolve(__dirname, '../../packages/postgresql/src'),
      '@db-bridge/redis': path.resolve(__dirname, '../../packages/redis/src')
    }
  }
});