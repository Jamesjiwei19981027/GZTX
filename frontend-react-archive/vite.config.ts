import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// DEV_API_TARGET：本地进程模式；VITE_PROXY_TARGET：docker-compose 内指向 backend 容器
const apiProxy = {
  '/api': {
    target:
      process.env.DEV_API_TARGET ||
      process.env.VITE_PROXY_TARGET ||
      'http://127.0.0.1:8000',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  // `vite preview` 不读 server.proxy，必须单独声明；
  // 否则用构建产物跑 E2E 时 /api 全部 404。
  preview: {
    port: 5173,
    proxy: apiProxy,
  },
})
