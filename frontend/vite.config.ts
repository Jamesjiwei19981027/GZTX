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
  build: {
    rollupOptions: {
      output: {
        // 只拆 React 运行时：它本来就在首屏关键路径上，单独成 chunk 后应用代码
        // 每次发版不会让这 180KB 一起失效（长期缓存）。
        // 入口走 react-dom/client 与 jsx-runtime，只写裸包名会得到空 chunk。
        //
        // recharts / @xyflow/react 故意**不**写进来：它们只被懒加载视图引用，
        // 一旦声明成 manualChunk，Rollup 会把它提升为入口依赖并写进 index.html
        // 的 modulepreload，反而把 400KB+ 拽回首屏。
        manualChunks: {
          'vendor-react': ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
        },
      },
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
