import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

// 创建 Vue 应用
const app = createApp(App)

// 创建 Pinia 实例
const pinia = createPinia()
app.use(pinia)

// 初始化认证状态
const authStore = useAuthStore()
authStore.init()

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 使用路由
app.use(router)

// 使用 Element Plus
app.use(ElementPlus)

// 挂载应用
app.mount('#app')

// 如果是 https 环境，注册 Service Worker
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service Worker 注册失败，忽略
    })
  })
}