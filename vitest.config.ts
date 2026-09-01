import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@zl3avr/avr-core': resolve(__dirname, 'packages/avr-core/src/index.ts'),
      '@zl3avr/board': resolve(__dirname, 'packages/board/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environmentMatchGlobs: [],
    environment: 'node',
    testTimeout: 120_000,
  },
})
