<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const currentRoute = computed(() => route.name as string)

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', label: '仪表盘', activeIcon: 'dashboard' },
  { name: 'Inbox', path: '/inbox', icon: 'inbox', label: '收件箱', activeIcon: 'inbox' },
  { name: 'TaskList', path: '/tasks', icon: 'checklist', label: '我的任务', activeIcon: 'checklist' },
  { name: 'Kanban', path: '/kanban', icon: 'view_kanban', label: '项目协作', activeIcon: 'view_kanban' },
  { name: 'Calendar', path: '/calendar', icon: 'calendar_month', label: '日历', activeIcon: 'calendar_month' },
  { name: 'Chat', path: '/chat', icon: 'chat', label: '团队聊天', activeIcon: 'chat' },
]

const bottomItems = [
  { name: 'Settings', path: '/settings', icon: 'settings', label: '设置' },
]

function isActive(item: { name: string; path: string }) {
  if (item.name === 'TaskList') {
    return currentRoute.value === 'TaskList' || currentRoute.value === 'TaskDetail' || currentRoute.value === 'TaskCreate'
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
      <div class="mb-lg px-sm">
        <h1 class="font-headline text-headline-sm font-bold text-primary tracking-tight">Flow 生产力</h1>
        <p class="font-body text-body-sm text-on-surface-variant mt-xs">Stay in the zone</p>
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
