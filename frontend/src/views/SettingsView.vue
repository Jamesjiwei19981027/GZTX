<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElInput, ElSelect, ElOption } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// ─── Form State ───────────────────────────────────────────────────────────────
const form = reactive({
  nickname: '',
  email: '',
})

const defaultPriority = ref<number>(1)
const defaultCategory = ref<string>('工作')

// ─── Theme & Appearance ───────────────────────────────────────────────────────
const theme = ref<'light' | 'dark' | 'system'>('light')
const accentColor = ref('#0058be')

const accentColors = [
  { value: '#0058be', colorClass: 'bg-primary', label: '蓝色' },
  { value: '#006c49', colorClass: 'bg-secondary', label: '绿色' },
  { value: '#924700', colorClass: 'bg-tertiary', label: '琥珀' },
  { value: '#ba1a1a', colorClass: 'bg-error', label: '红色' },
]

// ─── Notification Preferences ─────────────────────────────────────────────────
const notifyPrefs = reactive({
  email: true,
  browser: true,
  desktop: false,
})

function toggleNotify(key: keyof typeof notifyPrefs) {
  notifyPrefs[key] = !notifyPrefs[key]
}

// ─── Select Options ───────────────────────────────────────────────────────────
const priorityOptions = [
  { label: '低', value: 0 },
  { label: '中', value: 1 },
  { label: '高', value: 2 },
]

const categoryOptions = [
  { label: '未分类', value: '未分类' },
  { label: '工作', value: '工作' },
  { label: '个人', value: '个人' },
  { label: '购物', value: '购物' },
]

// ─── Default Avatar ───────────────────────────────────────────────────────────
const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiB2aWV3Qm94PSIwIDAgMTI4IDEyOCI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9IiMwMDU4YmUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9ImNlbnRyYWwiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IndoaXRlIiBmb250LXNpemU9IjQ4IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+VTwvdGV4dD48L3N2Zz4='

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await authStore.fetchCurrentUser()
  if (authStore.user) {
    form.nickname = authStore.user.nickname || authStore.user.username || ''
    form.email = authStore.user.email || ''
    if (authStore.user.notify_pref) {
      notifyPrefs.email = !!authStore.user.notify_pref.email_enabled
      notifyPrefs.browser = !!authStore.user.notify_pref.web_push_enabled
      notifyPrefs.desktop = !!authStore.user.notify_pref.wx_subscribe_enabled
    }
  }
})

// ─── Methods ──────────────────────────────────────────────────────────────────
async function updateProfile() {
  // Placeholder for profile update API call
}

async function handleLogout() {
  await authStore.logout()
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-md md:p-lg">
    <div class="max-w-[1200px] mx-auto">

      <!-- Page Header -->
      <header class="mb-xl">
        <h1 class="font-display text-display-lg text-on-surface mb-xs">设置</h1>
        <p class="font-body text-body-md text-on-surface-variant">管理您的个人资料、偏好设置和账号安全。</p>
      </header>

      <!-- Grid Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">

        <!-- Left Column: Primary Sections -->
        <div class="lg:col-span-8 space-y-lg">

          <!-- Profile Section -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">个人资料</h3>
            <div class="flex flex-col md:flex-row items-center gap-xl">
              <!-- Avatar -->
              <div class="relative group cursor-pointer shrink-0">
                <div class="w-32 h-32 rounded-full overflow-hidden border-4 border-surface-container-highest shadow-sm">
                  <img
                    :src="authStore.user?.avatar_url || defaultAvatar"
                    alt="头像"
                    class="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                  />
                </div>
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span class="material-symbols-outlined text-on-primary-fixed bg-primary-fixed/80 p-sm rounded-full">photo_camera</span>
                </div>
              </div>

              <!-- Form Fields -->
              <div class="flex-grow grid grid-cols-1 md:grid-cols-2 gap-md w-full">
                <div class="flex flex-col gap-xs">
                  <label class="font-label text-label-md text-on-surface-variant">全名</label>
                  <ElInput
                    v-model="form.nickname"
                    placeholder="输入全名"
                  />
                </div>
                <div class="flex flex-col gap-xs">
                  <label class="font-label text-label-md text-on-surface-variant">邮箱地址</label>
                  <ElInput
                    v-model="form.email"
                    placeholder="输入邮箱"
                  />
                </div>
                <div class="md:col-span-2 flex justify-end">
                  <button
                    class="px-lg py-sm bg-primary text-on-primary rounded-lg font-label text-label-md hover:opacity-90 transition-all"
                    @click="updateProfile"
                  >更新资料</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Notification Settings -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">通知偏好</h3>
            <div class="space-y-md">
              <!-- Email Notifications -->
              <div class="flex items-center justify-between p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-primary">mail</span>
                  <div>
                    <p class="font-label text-label-md text-on-surface">邮件通知</p>
                    <p class="font-body text-body-sm text-on-surface-variant">每日摘要和任务提醒</p>
                  </div>
                </div>
                <button
                  :class="['toggle-switch shrink-0', notifyPrefs.email && 'active']"
                  @click="toggleNotify('email')"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>
              <!-- Push Notifications -->
              <div class="flex items-center justify-between p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-primary">notifications_active</span>
                  <div>
                    <p class="font-label text-label-md text-on-surface">推送通知</p>
                    <p class="font-body text-body-sm text-on-surface-variant">在您的设备上接收实时提醒</p>
                  </div>
                </div>
                <button
                  :class="['toggle-switch shrink-0', notifyPrefs.browser && 'active']"
                  @click="toggleNotify('browser')"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>
              <!-- Desktop Notifications -->
              <div class="flex items-center justify-between p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-primary">desktop_windows</span>
                  <div>
                    <p class="font-label text-label-md text-on-surface">桌面提醒</p>
                    <p class="font-body text-body-sm text-on-surface-variant">显示浏览器级弹窗</p>
                  </div>
                </div>
                <button
                  :class="['toggle-switch shrink-0', notifyPrefs.desktop && 'active']"
                  @click="toggleNotify('desktop')"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>
            </div>
          </section>

          <!-- Task Defaults -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">任务默认值</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">默认优先级</label>
                <ElSelect
                  v-model="defaultPriority"
                  placeholder="选择优先级"
                  class="w-full"
                >
                  <ElOption
                    v-for="opt in priorityOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </ElSelect>
              </div>
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">默认类别</label>
                <ElSelect
                  v-model="defaultCategory"
                  placeholder="选择类别"
                  class="w-full"
                >
                  <ElOption
                    v-for="opt in categoryOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </ElSelect>
              </div>
            </div>
          </section>
        </div>

        <!-- Right Column: System & Account -->
        <div class="lg:col-span-4 space-y-lg">

          <!-- Appearance Section -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">外观</h3>
            <div class="flex flex-col gap-md">
              <!-- Theme Toggle -->
              <div class="flex items-center justify-between">
                <span class="font-label text-label-md text-on-surface">颜色主题</span>
                <div class="flex bg-surface-container rounded-lg p-xs">
                  <button
                    :class="[
                      'px-md py-xs rounded-md font-label text-label-sm flex items-center gap-xs transition-colors',
                      theme === 'light'
                        ? 'bg-surface shadow-sm text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    ]"
                    @click="theme = 'light'"
                  >
                    <span class="material-symbols-outlined text-[18px]">light_mode</span> 浅色
                  </button>
                  <button
                    :class="[
                      'px-md py-xs rounded-md font-label text-label-sm flex items-center gap-xs transition-colors',
                      theme === 'dark'
                        ? 'bg-surface shadow-sm text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    ]"
                    @click="theme = 'dark'"
                  >
                    <span class="material-symbols-outlined text-[18px]">dark_mode</span> 深色
                  </button>
                  <button
                    :class="[
                      'px-md py-xs rounded-md font-label text-label-sm flex items-center gap-xs transition-colors',
                      theme === 'system'
                        ? 'bg-surface shadow-sm text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    ]"
                    @click="theme = 'system'"
                  >
                    <span class="material-symbols-outlined text-[18px]">brightness_auto</span> 系统
                  </button>
                </div>
              </div>

              <!-- Accent Color -->
              <div class="pt-md border-t border-outline-variant">
                <p class="font-label text-label-sm text-on-surface-variant mb-sm">主题色</p>
                <div class="flex gap-sm">
                  <div
                    v-for="color in accentColors"
                    :key="color.value"
                    :class="[
                      'w-8 h-8 rounded-full cursor-pointer transition-transform',
                      color.colorClass,
                      accentColor === color.value
                        ? 'ring-2 ring-offset-2 ring-primary'
                        : 'hover:scale-110'
                    ]"
                    :title="color.label"
                    @click="accentColor = color.value"
                  ></div>
                </div>
              </div>
            </div>
          </section>

          <!-- Account Management -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">账号</h3>
            <div class="space-y-sm">
              <!-- Security -->
              <button class="w-full flex items-center justify-between p-md rounded-lg hover:bg-surface-container-low transition-colors group">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">security</span>
                  <span class="font-label text-label-md text-on-surface">安全设置</span>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>
              <!-- Billing -->
              <button class="w-full flex items-center justify-between p-md rounded-lg hover:bg-surface-container-low transition-colors group">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">payments</span>
                  <span class="font-label text-label-md text-on-surface">账单与订阅</span>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>
              <!-- Privacy -->
              <button class="w-full flex items-center justify-between p-md rounded-lg hover:bg-surface-container-low transition-colors group">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">cloud_sync</span>
                  <span class="font-label text-label-md text-on-surface">数据与隐私</span>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>

              <!-- Logout (separated by border) -->
              <div class="pt-lg mt-md border-t border-outline-variant">
                <button
                  class="w-full flex items-center gap-md p-md rounded-lg text-error hover:bg-error-container/20 transition-colors"
                  @click="handleLogout"
                >
                  <span class="material-symbols-outlined">logout</span>
                  <span class="font-label text-label-md">退出登录</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- Danger Zone Footer -->
      <div class="mt-xl py-lg border-t border-outline-variant flex flex-col md:flex-row justify-between items-center gap-md">
        <div>
          <h4 class="font-label text-label-md text-error">危险区域</h4>
          <p class="font-body text-body-sm text-on-surface-variant">永久删除您的账号及所有相关任务数据。</p>
        </div>
        <button class="px-lg py-sm border border-error text-error rounded-lg font-label text-label-md hover:bg-error hover:text-on-error transition-all">删除账号</button>
      </div>

    </div>
  </div>
</template>
