import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ToastProvider} from './components/toast/ToastProvider.tsx';
// 自托管字体/图标（替代原 Google Fonts 外链，保证离线可用；类名 material-symbols-outlined 不变）
// 图标用子集字体（npm run icons:subset 生成），整包 3.9MB -> 子集 <100KB
import './assets/material-symbols-subset.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-sc';
import './index.css';
import './mobile/mobile.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
