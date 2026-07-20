<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWebPush } from '@/composables/useWebPush'
import { sendTestPush } from '@/api/notifications'
import { getErrorMessage } from '@/api/request'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { subscribe, isSupported, permissionState } = useWebPush()
const testingPush = ref(false)

onMounted(async () => {
  // 每次页面加载都尝试 subscribe()，确保后端重启后重新注册订阅
  // subscribe() 内部会复用已有的 PushManager 订阅，只重新发送到后端
  if (isSupported.value) {
    try {
      await subscribe()
    } catch (e) {
      console.warn('Web Push 自动订阅失败:', e)
    }
  }
})

async function testPushNotification() {
  // 如果权限被拒绝，直接提示
  if (permissionState.value === 'denied') {
    ElMessage.warning('通知权限已被浏览器拒绝，请在地址栏左侧点击锁图标手动开启通知权限。')
    return
  }

  testingPush.value = true
  try {
    // 先确保已订阅（处理后端重启后订阅丢失的情况）
    await subscribe()
    await sendTestPush()
    ElMessage.success('测试通知已发送，请查看浏览器通知')
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '发送失败，请打开 F12 控制台查看详细错误'))
    console.error('[WebPush] test-push 失败:', e)
  } finally {
    testingPush.value = false
  }
}

const currentRoute = computed(() => route.name as string)

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', label: '仪表盘', activeIcon: 'dashboard' },
  { name: 'TaskList', path: '/tasks', icon: 'checklist', label: '我的任务', activeIcon: 'checklist' },
  { name: 'ProjectList', path: '/projects', icon: 'account_tree', label: '项目', activeIcon: 'account_tree' },
  { name: 'Calendar', path: '/calendar', icon: 'calendar_month', label: '日历', activeIcon: 'calendar_month' },
]

const bottomItems = [
  { name: 'CompanySettings', path: '/company/settings', icon: 'apartment', label: '公司' },
  { name: 'Settings', path: '/settings', icon: 'settings', label: '设置' },
]

function isActive(item: { name: string; path: string }) {
  if (item.name === 'TaskList') {
    return currentRoute.value === 'TaskList' || currentRoute.value === 'TaskDetail' || currentRoute.value === 'TaskCreate'
  }
  if (item.name === 'ProjectList') {
    return currentRoute.value === 'ProjectList' || currentRoute.value === 'ProjectDetail'
  }
  if (item.name === 'CompanySettings') {
    return currentRoute.value === 'CompanySettings'
  }
  return currentRoute.value === item.name
}

function navigate(path: string) {
  router.push(path)
}

function handleLogout() {
  authStore.logout()
}

const userName = computed(() => authStore.nickname || '用户')
</script>

<template>
  <div class="h-screen w-full overflow-hidden flex bg-background">
    <!-- Sidebar -->
    <nav class="hidden md:flex fixed left-0 top-0 h-full w-sidebar bg-surface border-r border-surface-variant shadow-sm flex-col py-lg px-md gap-sm z-50">
      <!-- Brand -->
      <div class="mb-lg px-sm flex items-center gap-sm cursor-pointer hover:opacity-80 transition-opacity" @click="navigate('/dashboard')">
        <div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 20L7 4L12 8L17 4L21 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 14L12 12L17 14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
            <circle cx="12" cy="20" r="1.5" fill="white"/>
          </svg>
        </div>
        <div>
          <h1 class="font-headline text-headline-sm font-bold text-primary tracking-tight leading-none">烂笔头PM</h1>
          <p class="font-body text-body-sm text-on-surface-variant mt-xs">好记性不如烂笔头</p>
        </div>
      </div>

      <!-- Nav Items -->
      <div class="flex flex-col gap-xs flex-1">
        <a
          v-for="item in navItems"
          :key="item.name"
          :class="[
            'flex items-center gap-md px-md py-sm rounded-xl transition-all duration-300 ease-in-out cursor-pointer',
            isActive(item)
              ? 'text-primary font-bold border-r-4 border-primary bg-primary-fixed/20'
              : 'text-on-surface-variant hover:bg-surface-container-low'
          ]"
          @click.prevent="navigate(item.path)"
          href="#"
        >
          <span
            class="material-symbols-outlined"
            :style="isActive(item) ? 'font-variation-settings: \'FILL\' 1;' : ''"
          >{{ isActive(item) ? item.activeIcon : item.icon }}</span>
          <span class="font-label text-label-md">{{ item.label }}</span>
        </a>
      </div>

      <!-- Bottom Section -->
      <div class="mt-auto pt-sm border-t border-surface-variant space-y-xs">
        <a
          v-for="item in bottomItems"
          :key="item.name"
          :class="[
            'flex items-center gap-md px-md py-sm rounded-xl transition-all duration-300 ease-in-out cursor-pointer',
            isActive(item)
              ? 'text-primary font-bold border-r-4 border-primary bg-primary-fixed/20'
              : 'text-on-surface-variant hover:bg-surface-container-low'
          ]"
          @click.prevent="navigate(item.path)"
          href="#"
        >
          <span class="material-symbols-outlined">{{ item.icon }}</span>
          <span class="font-label text-label-md">{{ item.label }}</span>
        </a>

        <!-- New Task CTA -->
        <button
          class="btn-primary mt-md w-full shadow-sm hover:shadow-lg active:scale-95 transition-all"
          @click="navigate('/tasks/new')"
        >
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">add</span>
          新建任务
        </button>

        <!-- User Info -->
        <div class="flex items-center gap-md px-md py-sm mt-sm">
          <div class="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label text-label-sm">
            {{ userName.charAt(0).toUpperCase() }}
          </div>
          <span class="font-body text-body-sm text-on-surface truncate flex-1">{{ userName }}</span>
          <button
            v-if="isSupported"
            class="flex items-center gap-xs px-sm py-xs rounded-lg text-on-surface-variant hover:text-white hover:bg-primary/80 transition-all mt-sm"
            @click="testPushNotification"
            :disabled="testingPush"
            title="测试网页弹窗通知"
          >
            <span class="material-symbols-outlined" style="font-size: 20px;">{{ testingPush ? 'hourglass_empty' : 'notifications_active' }}</span>
            <span class="font-label" style="font-size: 12px;">{{ testingPush ? '发送中...' : '测试通知' }}</span>
          </button>
          <button
            class="text-on-surface-variant hover:text-error transition-colors"
            @click="handleLogout"
            title="退出登录"
          >
            <span class="material-symbols-outlined" style="font-size: 20px;">logout</span>
          </button>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="md:ml-sidebar flex-1 flex flex-col h-full overflow-hidden bg-background">
      <RouterView />
    </main>

    <!-- Mobile FAB -->
    <button
      class="md:hidden fixed bottom-lg right-lg w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center z-50 active:scale-90 transition-transform"
      @click="navigate('/tasks/new')"
    >
      <span class="material-symbols-outlined" style="font-size: 28px; font-variation-settings: 'FILL' 1;">add</span>
    </button>
  </div>
</template>
