import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright 套件由 npm run test:e2e 单独执行，不归 vitest 收集
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
