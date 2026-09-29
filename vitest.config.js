import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Every test file shares one emulator, so run files one at a time.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
