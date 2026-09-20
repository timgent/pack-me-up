import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      // Only the VitePWA plugin (vite.config.ts) resolves this specifier,
      // and this config doesn't load it — see src/test-utils/virtualPwaRegisterStub.ts.
      'virtual:pwa-register': path.resolve(__dirname, 'src/test-utils/virtualPwaRegisterStub.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    exclude: ['node_modules', 'dist', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.{js,ts}',
        '**/*.test.{js,ts,jsx,tsx}',
      ],
    },
  },
})
