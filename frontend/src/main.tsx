import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
// 自托管字体/图标（替代原 Google Fonts 外链，保证离线可用；类名 material-symbols-outlined 不变）
import 'material-symbols/outlined.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-sc';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
