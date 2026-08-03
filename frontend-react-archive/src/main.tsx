import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './hooks/useTheme'
import './assets/main.css'

// Apply saved theme/accent before first paint of app shell
initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
