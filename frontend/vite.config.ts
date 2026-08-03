import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// DEV_API_TARGET：本机；VITE_PROXY_TARGET：docker-compose 内指向 backend 容器
const apiProxy = {
  '/api': {
    target:
      process.env.DEV_API_TARGET ||
      process.env.VITE_PROXY_TARGET ||
      'http://127.0.0.1:8010',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR === 'true' ? false : true,
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    host: '0.0.0.0',
    proxy: apiProxy,
  },
})
