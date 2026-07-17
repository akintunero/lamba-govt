import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    include: ['tests/**/*.test.{js,ts}'],
    environment: 'node'
  }
});
