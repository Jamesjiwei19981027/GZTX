<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElInput, ElSelect, ElOption, ElSlider, ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import { useSoundEffects } from '@/composables/useSoundEffects'
import type { AccentColor } from '@/composables/useTheme'
import request from '@/api/request'

const authStore = useAuthStore()
const { theme, accent, setTheme, setAccent } = useTheme()
const {
  soundEnabled,
  soundVolume,
  playNotificationSound,
  playFeedbackSound,
  previewAllSounds,
  setSoundEnabled,
  setSoundVolume,
} = useSoundEffects()

// ─── Form State ───────────────────────────────────────────────────────────────
const form = reactive({
  nickname: '',
  email: '',
})

const defaultPriority = ref<number>(1)
const defaultCategory = ref<string>('工作')

// ─── SMTP Config ─────────────────────────────────────────────────────────────
const smtpForm = reactive({
  smtp_host: 'smtp.qq.com',
  smtp_port: 465,
  smtp_user: '',
  smtp_password: '',
  smtp_from: '',
})
const smtpLoading = ref(false)
const smtpSaving = ref(false)
const smtpTesting = ref(false)
const smtpConfigured = ref(false)
const smtpSource = ref<string>('none')  // 'user' | 'global' | 'none'
const smtpHasPassword = ref(false)

async function loadSmtpConfig() {
  smtpLoading.value = true
  try {
    const data = await request.get('/notifications/smtp-config') as any
    if (data) {
      smtpForm.smtp_host = data.smtp_host || 'smtp.qq.com'
      smtpForm.smtp_port = data.smtp_port || 465
      smtpForm.smtp_user = data.smtp_user || ''
      smtpForm.smtp_from = data.smtp_from || ''
      smtpHasPassword.value = data.has_password || false
      smtpConfigured.value = data.has_password && !!data.smtp_host
    }
    // Also check overall status
    const status = await request.get('/notifications/email-status') as any
    if (status) {
      smtpSource.value = status.smtp_source || 'none'
    }
  } catch (e) {
    console.error('Failed to load SMTP config:', e)
  } finally {
    smtpLoading.value = false
  }
}

async function saveSmtpConfig() {
  smtpSaving.value = true
  try {
    const payload: Record<string, any> = {
      smtp_host: smtpForm.smtp_host,
      smtp_port: smtpForm.smtp_port,
      smtp_user: smtpForm.smtp_user,
      smtp_from: smtpForm.smtp_from,
    }
    // Only send password if it's been changed (not empty)
    if (smtpForm.smtp_password) {
      payload.smtp_password = smtpForm.smtp_password
    }
    const result = await request.put('/notifications/smtp-config', payload) as any
    smtpHasPassword.value = result?.has_password || !!smtpForm.smtp_password
    smtpForm.smtp_password = ''  // Clear password field after save
    smtpConfigured.value = true
    smtpSource.value = 'user'
    ElMessage.success('邮件服务器配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    smtpSaving.value = false
  }
}

async function sendTestEmail() {
  smtpTesting.value = true
  try {
    const result = await request.post('/notifications/send-test-email') as any
    ElMessage.success('测试邮件已发送，请检查邮箱')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '发送失败')
  } finally {
    smtpTesting.value = false
  }
}

// ─── Accent Colors ─────────────────────────────────────────────────────────────
const accentColors: { value: AccentColor; colorClass: string; label: string }[] = [
  { value: 'blue', colorClass: 'bg-primary', label: '蓝色' },
  { value: 'green', colorClass: 'bg-secondary', label: '绿色' },
  { value: 'amber', colorClass: 'bg-tertiary', label: '琥珀' },
  { value: 'red', colorClass: 'bg-error', label: '红色' },
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

// ─── Sound Settings ──────────────────────────────────────────────────────────
const isPreviewing = ref(false)

async function handlePreviewAll() {
  isPreviewing.value = true
  await previewAllSounds()
  isPreviewing.value = false
}

function handlePreviewPriority(priority: 0 | 1 | 2 | 3) {
  playNotificationSound(priority)
}

const prioritySoundLabels = [
  { priority: 0 as const, label: '紧急', desc: '三音急促 · 高频警示', color: '#ff3b30' },
  { priority: 1 as const, label: '高', desc: '三音上行 · 明亮', color: '#ff9500' },
  { priority: 2 as const, label: '中', desc: '双音 · 平稳', color: '#34c759' },
  { priority: 3 as const, label: '低', desc: '单音 · 柔和', color: '#8e8e93' },
]

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

// ─── Profile Save ────────────────────────────────────────────────────────────
async function updateProfile() {
  try {
    await request.put('/users/me', {
      nickname: form.nickname,
      email: form.email,
    })
    ElMessage.success('个人资料已更新')
    await authStore.fetchCurrentUser()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '更新失败')
  }
}

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
  await loadSmtpConfig()
})

// ─── Methods ──────────────────────────────────────────────────────────────────
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
                  <ElInput v-model="form.nickname" placeholder="输入全名" />
                </div>
                <div class="flex flex-col gap-xs">
                  <label class="font-label text-label-md text-on-surface-variant">邮箱地址</label>
                  <ElInput v-model="form.email" placeholder="输入邮箱（用于接收通知）" />
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
              <div class="flex items-center justify-between p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-primary">mail</span>
                  <div>
                    <p class="font-label text-label-md text-on-surface">邮件通知</p>
                    <p class="font-body text-body-sm text-on-surface-variant">每日摘要和任务提醒</p>
                  </div>
                </div>
                <button :class="['toggle-switch shrink-0', notifyPrefs.email && 'active']" @click="toggleNotify('email')">
                  <span class="toggle-knob"></span>
                </button>
              </div>
              <div class="flex items-center justify-between p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-primary">notifications_active</span>
                  <div>
                    <p class="font-label text-label-md text-on-surface">推送通知</p>
                    <p class="font-body text-body-sm text-on-surface-variant">在您的设备上接收实时提醒</p>
                  </div>
                </div>
                <button :class="['toggle-switch shrink-0', notifyPrefs.browser && 'active']" @click="toggleNotify('browser')">
                  <span class="toggle-knob"></span>
                </button>
              </div>
              <div class="flex items-center justify-between p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-primary">desktop_windows</span>
                  <div>
                    <p class="font-label text-label-md text-on-surface">桌面提醒</p>
                    <p class="font-body text-body-sm text-on-surface-variant">显示浏览器级弹窗</p>
                  </div>
                </div>
                <button :class="['toggle-switch shrink-0', notifyPrefs.desktop && 'active']" @click="toggleNotify('desktop')">
                  <span class="toggle-knob"></span>
                </button>
              </div>
            </div>
          </section>

          <!-- ── SMTP Configuration ──────────────────────────────────────────── -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <div class="flex items-center justify-between mb-lg">
              <div>
                <h3 class="font-headline text-headline-sm text-on-surface">邮件服务器</h3>
                <p class="font-body text-body-sm text-on-surface-variant mt-xs">配置 SMTP 服务器以发送任务提醒邮件</p>
              </div>
              <span
                v-if="smtpConfigured"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm bg-secondary/10 text-secondary font-label"
              >
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings:'FILL' 1;">check_circle</span>
                已配置
              </span>
              <span
                v-else-if="smtpSource === 'global'"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm bg-primary/10 text-primary font-label"
              >
                系统默认
              </span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">SMTP 服务器</label>
                <ElInput v-model="smtpForm.smtp_host" placeholder="smtp.qq.com" />
              </div>
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">端口</label>
                <ElInput v-model.number="smtpForm.smtp_port" placeholder="465" type="number" />
              </div>
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">邮箱账号</label>
                <ElInput v-model="smtpForm.smtp_user" placeholder="your@qq.com" />
              </div>
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">发件人地址</label>
                <ElInput v-model="smtpForm.smtp_from" placeholder="与邮箱账号相同（可留空）" />
              </div>
              <div class="flex flex-col gap-xs md:col-span-2">
                <label class="font-label text-label-md text-on-surface-variant">
                  授权码
                  <span v-if="smtpHasPassword" class="text-secondary ml-1">(已设置，留空保持不变)</span>
                </label>
                <ElInput
                  v-model="smtpForm.smtp_password"
                  type="password"
                  show-password
                  :placeholder="smtpHasPassword ? '已保存，留空不修改' : 'QQ邮箱：设置 → 账户 → SMTP → 获取授权码'"
                />
              </div>
            </div>

            <div class="flex items-center gap-sm mt-lg justify-end">
              <button
                class="px-md py-sm border border-outline text-on-surface rounded-lg font-label text-label-md hover:bg-surface-container-low transition-all"
                :disabled="smtpTesting"
                @click="sendTestEmail"
              >
                <span v-if="smtpTesting" class="material-symbols-outlined text-body-sm animate-spin mr-1">progress_activity</span>
                {{ smtpTesting ? '发送中...' : '发送测试邮件' }}
              </button>
              <button
                class="px-lg py-sm bg-primary text-on-primary rounded-lg font-label text-label-md hover:opacity-90 transition-all"
                :disabled="smtpSaving"
                @click="saveSmtpConfig"
              >
                <span v-if="smtpSaving" class="material-symbols-outlined text-body-sm animate-spin mr-1">progress_activity</span>
                {{ smtpSaving ? '保存中...' : '保存配置' }}
              </button>
            </div>
          </section>

          <!-- ── Sound Settings ──────────────────────────────────────────────── -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">提示音效</h3>

            <!-- Enable / Volume -->
            <div class="space-y-md mb-lg">
              <div class="flex items-center justify-between p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-primary">volume_up</span>
                  <div>
                    <p class="font-label text-label-md text-on-surface">音效开关</p>
                    <p class="font-body text-body-sm text-on-surface-variant">任务提醒和操作反馈播放音效</p>
                  </div>
                </div>
                <button
                  :class="['toggle-switch shrink-0', soundEnabled && 'active']"
                  @click="setSoundEnabled(!soundEnabled)"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>

              <div class="p-md bg-surface-container-lowest rounded-lg">
                <div class="flex items-center justify-between mb-sm">
                  <span class="font-label text-label-md text-on-surface">全局音量</span>
                  <span class="font-label text-label-sm text-on-surface-variant">{{ Math.round(soundVolume * 100) }}%</span>
                </div>
                <ElSlider
                  :model-value="soundVolume * 100"
                  :min="0"
                  :max="100"
                  :step="5"
                  :disabled="!soundEnabled"
                  @update:model-value="(v) => setSoundVolume((Array.isArray(v) ? v[0] : v ?? 0) / 100)"
                />
              </div>
            </div>

            <!-- Priority Sound Preview -->
            <div class="mb-md">
              <div class="flex items-center justify-between mb-sm">
                <span class="font-label text-label-md text-on-surface">按优先级试听</span>
                <button
                  class="inline-flex items-center gap-xs px-sm py-xs text-label-sm text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  :disabled="isPreviewing || !soundEnabled"
                  @click="handlePreviewAll"
                >
                  <span class="material-symbols-outlined text-body-sm">{{ isPreviewing ? 'graphic_eq' : 'play_arrow' }}</span>
                  {{ isPreviewing ? '播放中...' : '依次播放全部' }}
                </button>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-sm">
                <button
                  v-for="item in prioritySoundLabels"
                  :key="item.priority"
                  class="flex flex-col items-center gap-xs p-md rounded-xl border transition-all hover:shadow-card cursor-pointer"
                  :class="soundEnabled ? 'border-outline-variant hover:border-primary' : 'border-outline-variant opacity-50 cursor-not-allowed'"
                  :style="{ borderTopColor: item.color, borderTopWidth: '3px' }"
                  :disabled="!soundEnabled"
                  @click="handlePreviewPriority(item.priority)"
                >
                  <span
                    class="material-symbols-outlined text-headline-md"
                    :style="{ color: item.color }"
                  >
                    {{ item.priority === 0 ? 'priority_high' : item.priority === 1 ? 'arrow_upward' : item.priority === 2 ? 'trending_flat' : 'arrow_downward' }}
                  </span>
                  <span class="font-label text-label-md text-on-surface">{{ item.label }}</span>
                  <span class="font-body text-body-sm text-on-surface-variant text-center">{{ item.desc }}</span>
                </button>
              </div>
            </div>

            <!-- Design note -->
            <div class="flex items-start gap-sm p-md bg-surface-container-lowest rounded-lg">
              <span class="material-symbols-outlined text-on-surface-variant text-body-md mt-0.5">info</span>
              <div class="font-body text-body-sm text-on-surface-variant">
                采用 Apple 分层音效设计理念——<b>音色区分类型</b>（玻璃=任务提醒），<b>音型区分优先级</b>（单音=低、双音=中、三音=高、急促=紧急）。用户仅凭声音就能判断任务重要程度。
              </div>
            </div>
          </section>

          <!-- Task Defaults -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">任务默认值</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">默认优先级</label>
                <ElSelect v-model="defaultPriority" placeholder="选择优先级" class="w-full">
                  <ElOption v-for="opt in priorityOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                </ElSelect>
              </div>
              <div class="flex flex-col gap-xs">
                <label class="font-label text-label-md text-on-surface-variant">默认类别</label>
                <ElSelect v-model="defaultCategory" placeholder="选择类别" class="w-full">
                  <ElOption v-for="opt in categoryOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
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
                      theme === 'light' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
                    ]"
                    @click="setTheme('light')"
                  >
                    <span class="material-symbols-outlined text-[18px]">light_mode</span> 浅色
                  </button>
                  <button
                    :class="[
                      'px-md py-xs rounded-md font-label text-label-sm flex items-center gap-xs transition-colors',
                      theme === 'dark' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
                    ]"
                    @click="setTheme('dark')"
                  >
                    <span class="material-symbols-outlined text-[18px]">dark_mode</span> 深色
                  </button>
                  <button
                    :class="[
                      'px-md py-xs rounded-md font-label text-label-sm flex items-center gap-xs transition-colors',
                      theme === 'system' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
                    ]"
                    @click="setTheme('system')"
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
                    v-for="color in accentColors" :key="color.value"
                    :class="['w-8 h-8 rounded-full cursor-pointer transition-transform', color.colorClass, accent === color.value ? 'ring-2 ring-offset-2 ring-primary' : 'hover:scale-110']"
                    :title="color.label"
                    @click="setAccent(color.value)"
                  ></div>
                </div>
              </div>
            </div>
          </section>

          <!-- Account Management -->
          <section class="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 class="font-headline text-headline-sm text-on-surface mb-lg">账号</h3>
            <div class="space-y-sm">
              <button class="w-full flex items-center justify-between p-md rounded-lg hover:bg-surface-container-low transition-colors group">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">security</span>
                  <span class="font-label text-label-md text-on-surface">安全设置</span>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>
              <button class="w-full flex items-center justify-between p-md rounded-lg hover:bg-surface-container-low transition-colors group">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">payments</span>
                  <span class="font-label text-label-md text-on-surface">账单与订阅</span>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>
              <button class="w-full flex items-center justify-between p-md rounded-lg hover:bg-surface-container-low transition-colors group">
                <div class="flex items-center gap-md">
                  <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">cloud_sync</span>
                  <span class="font-label text-label-md text-on-surface">数据与隐私</span>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>

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
