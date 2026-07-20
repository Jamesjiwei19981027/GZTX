## Task 1: P0 鈥?Vite React 鑴氭墜鏋?+ Tailwind + Ant Design

**Files:**
- Create: `frontend/package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `src/main.tsx`, `src/App.tsx`, `src/assets/main.css`
- Modify: root Docker only later (Task 12)

**Interfaces:**
- Produces: `npm run dev` / `npm run build` 鍙敤鐨勭┖澹?
- [ ] **Step 1: 鍒濆鍖?Vite React-TS**

```bash
cd /path/to/repo
# 鍦ㄧ┖ frontend 涓剼鎵嬫灦锛堣嫢鐩綍闈炵┖锛屽厛绉昏蛋 README锛?npm create vite@5 . -- --template react-ts
npm install
npm install react-router-dom zustand axios antd @ant-design/icons dayjs
npm install -D tailwindcss@3 postcss autoprefixer @types/node
npx tailwindcss init -p
```

- [ ] **Step 2: Vite 鍒悕涓庢彃浠?*

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
```

- [ ] **Step 3: Tailwind 鎵弿璺緞**

```js
// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
  corePlugins: {
    // 鑻ヤ笌 antd 鍐茬獊鍙寜闇€ preflight 璋冩暣
  },
}
```

浠?`frontend-vue-archive/src/assets/main.css` 澶嶅埗 CSS 鍙橀噺 / MD3 token 鍒?`frontend/src/assets/main.css`锛屽苟鍦ㄦ枃浠堕《鍔犲叆锛?
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: main 鍏ュ彛**

```tsx
// frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
```

```tsx
// frontend/src/App.tsx
export default function App() {
  return <div className="p-8 font-sans">WorkTodo React shell</div>
}
```

- [ ] **Step 5: 楠岃瘉**

```bash
cd frontend
npm run build
```

Expected: 闆?error銆?
- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold Vite React + Tailwind + Ant Design"
```

---

