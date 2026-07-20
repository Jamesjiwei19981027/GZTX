<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { FormInstance, FormRules } from 'element-plus'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)

const isRegister = computed(() => route.path === '/register')

const loginForm = ref({
  username: '',
  password: '',
})

const registerForm = ref({
  username: '',
  password: '',
  confirmPassword: '',
  email: '',
})

const loginRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为3-20个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 30, message: '密码长度至少6个字符', trigger: 'blur' },
  ],
}

const registerRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为3-20个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 30, message: '密码长度至少6个字符', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: Function) => {
        if (value !== registerForm.value.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  email: [
    { required: true, message: '请输入邮箱地址', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' },
  ],
}

function switchMode(toRegister: boolean) {
  if (toRegister) {
    router.push('/register')
  } else {
    router.push('/login')
  }
}

watch(isRegister, () => {
  formRef.value?.resetFields()
})

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    if (isRegister.value) {
      await authStore.register({
        username: registerForm.value.username,
        password: registerForm.value.password,
        email: registerForm.value.email,
        nickname: registerForm.value.username,
      })
      // company_join 提示由 authStore 弹出；超配额 409 由 request 拦截器展示
    } else {
      await authStore.login({
        username: loginForm.value.username,
        password: loginForm.value.password,
      })
    }
  } catch {
    // 错误已由 request 拦截器 / store 展示（含名额已满）
  } finally {
    loading.value = false
  }
}

const featurePills = [
  '任务管理',
  '团队协作',
  '实时消息',
  '文件共享',
  '项目看板',
]
</script>

<template>
  <div class="min-h-screen flex">
    <!-- Left Column: Hero/Brand (hidden on mobile) -->
    <div class="hidden md:flex md:w-1/2 bg-primary relative overflow-hidden items-center justify-center"
         style="background: linear-gradient(135deg, #0058be 0%, #2170e4 100%);"
    >
      <!-- Decorative circles -->
      <div class="absolute w-[500px] h-[500px] rounded-full bg-on-primary/5 -top-32 -left-32" />
      <div class="absolute w-[300px] h-[300px] rounded-full bg-on-primary/5 bottom-20 -right-20" />
      <div class="absolute w-[200px] h-[200px] rounded-full bg-on-primary/5 top-1/3 right-1/4" />
      <div class="absolute w-[150px] h-[150px] rounded-full bg-on-primary/5 bottom-10 left-1/4" />

      <!-- Center content -->
      <div class="relative z-10 text-center px-xl">
        <!-- Logo -->
        <div class="w-20 h-20 rounded-2xl bg-on-primary/10 flex items-center justify-center mx-auto mb-lg backdrop-blur-sm">
          <span class="material-symbols-outlined text-on-primary text-5xl">bolt</span>
        </div>
        <h1 class="text-4xl font-bold text-on-primary mb-sm tracking-tight">Flow 生产力</h1>
        <p class="text-lg text-on-primary/80 mb-xl">保持专注，提升效率</p>

        <!-- Illustration placeholder -->
        <div class="w-64 h-48 mx-auto mb-xl rounded-2xl bg-on-primary/5 backdrop-blur-sm border border-on-primary/10 flex items-center justify-center">
          <div class="flex items-center gap-sm">
            <span class="material-symbols-outlined text-on-primary/60 text-3xl">dashboard</span>
            <span class="material-symbols-outlined text-on-primary/40 text-2xl">arrow_forward</span>
            <span class="material-symbols-outlined text-on-primary/60 text-3xl">check_circle</span>
          </div>
        </div>
      </div>

      <!-- Feature pills at bottom -->
      <div class="absolute bottom-xl left-0 right-0 flex flex-wrap justify-center gap-sm px-lg">
        <span
          v-for="pill in featurePills"
          :key="pill"
          class="bg-on-primary/10 text-on-primary rounded-full px-md py-sm text-sm backdrop-blur-sm border border-on-primary/5"
        >
          {{ pill }}
        </span>
      </div>
    </div>

    <!-- Right Column: Form -->
    <div class="w-full md:w-1/2 bg-background flex items-center justify-center p-lg"
         style="background-color: #f8f9fa;"
    >
      <div class="max-w-[440px] w-full">
        <!-- Card -->
        <div class="bg-surface-container-lowest rounded-2xl p-xl shadow-lg"
             style="background-color: #ffffff; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.1);"
        >
          <!-- Mobile logo (shown only on small screens) -->
          <div class="md:hidden text-center mb-lg">
            <div class="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-sm">
              <span class="material-symbols-outlined text-on-primary text-3xl">bolt</span>
            </div>
            <h2 class="text-xl font-bold text-on-surface">Flow 生产力</h2>
          </div>

          <!-- Tab Toggle -->
          <div class="flex bg-surface-container rounded-lg p-xs mb-xl">
            <button
              :class="[
                'flex-1 py-sm text-sm font-medium rounded-md transition-all',
                !isRegister
                  ? 'bg-surface-container-lowest shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              ]"
              style="background-color: #ffffff;"
              @click="switchMode(false)"
            >
              登录
            </button>
            <button
              :class="[
                'flex-1 py-sm text-sm font-medium rounded-md transition-all',
                isRegister
                  ? 'bg-surface-container-lowest shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              ]"
              style="background-color: #ffffff;"
              @click="switchMode(true)"
            >
              注册
            </button>
          </div>

          <!-- Login Form -->
          <template v-if="!isRegister">
            <h3 class="text-xl font-semibold text-on-surface mb-xs">欢迎回来</h3>
            <p class="text-sm text-on-surface-variant mb-lg">登录您的账户以继续</p>

            <el-form
              ref="formRef"
              :model="loginForm"
              :rules="loginRules"
              label-position="top"
              size="large"
              @submit.prevent="handleSubmit"
            >
              <el-form-item label="用户名" prop="username">
                <el-input
                  v-model="loginForm.username"
                  placeholder="请输入用户名"
                  :prefix-icon="undefined"
                >
                  <template #prefix>
                    <span class="material-symbols-outlined text-on-surface-variant text-xl ml-xs">person</span>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="密码" prop="password">
                <el-input
                  v-model="loginForm.password"
                  type="password"
                  placeholder="请输入密码"
                  show-password
                >
                  <template #prefix>
                    <span class="material-symbols-outlined text-on-surface-variant text-xl ml-xs">lock</span>
                  </template>
                </el-input>
              </el-form-item>

              <div class="flex items-center justify-between mb-lg">
                <el-checkbox label="记住我" />
                <a href="#" class="text-sm text-primary hover:underline">忘记密码？</a>
              </div>

              <el-form-item>
                <button
                  type="submit"
                  class="w-full h-12 bg-primary text-on-primary rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-sm"
                  :disabled="loading"
                  @click.prevent="handleSubmit"
                >
                  <span v-if="loading" class="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                  <span>{{ loading ? '登录中...' : '登录' }}</span>
                </button>
              </el-form-item>
            </el-form>
          </template>

          <!-- Register Form -->
          <template v-else>
            <h3 class="text-xl font-semibold text-on-surface mb-xs">创建账户</h3>
            <p class="text-sm text-on-surface-variant mb-lg">注册以开始使用</p>

            <el-form
              ref="formRef"
              :model="registerForm"
              :rules="registerRules"
              label-position="top"
              size="large"
              @submit.prevent="handleSubmit"
            >
              <el-form-item label="用户名" prop="username">
                <el-input
                  v-model="registerForm.username"
                  placeholder="请输入用户名"
                >
                  <template #prefix>
                    <span class="material-symbols-outlined text-on-surface-variant text-xl ml-xs">person</span>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="邮箱" prop="email">
                <el-input
                  v-model="registerForm.email"
                  placeholder="请输入邮箱地址"
                >
                  <template #prefix>
                    <span class="material-symbols-outlined text-on-surface-variant text-xl ml-xs">mail</span>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="密码" prop="password">
                <el-input
                  v-model="registerForm.password"
                  type="password"
                  placeholder="请输入密码"
                  show-password
                >
                  <template #prefix>
                    <span class="material-symbols-outlined text-on-surface-variant text-xl ml-xs">lock</span>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="确认密码" prop="confirmPassword">
                <el-input
                  v-model="registerForm.confirmPassword"
                  type="password"
                  placeholder="请再次输入密码"
                  show-password
                >
                  <template #prefix>
                    <span class="material-symbols-outlined text-on-surface-variant text-xl ml-xs">lock</span>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item>
                <button
                  type="submit"
                  class="w-full h-12 bg-primary text-on-primary rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-sm"
                  :disabled="loading"
                  @click.prevent="handleSubmit"
                >
                  <span v-if="loading" class="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                  <span>{{ loading ? '注册中...' : '注册' }}</span>
                </button>
              </el-form-item>
            </el-form>
          </template>

          <!-- Divider -->
          <div class="relative my-lg">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-outline-variant" />
            </div>
            <div class="relative flex justify-center text-xs">
              <span class="bg-surface-container-lowest px-md text-on-surface-variant" style="background-color: #ffffff;">
                或继续使用
              </span>
            </div>
          </div>

          <!-- Social Login (visual only) -->
          <div class="flex gap-sm">
            <button class="flex-1 flex items-center justify-center gap-sm h-11 border border-outline-variant rounded-xl text-sm text-on-surface hover:bg-surface-container-low transition-colors">
              <span class="material-symbols-outlined text-xl">mail</span>
              Google
            </button>
            <button class="flex-1 flex items-center justify-center gap-sm h-11 border border-outline-variant rounded-xl text-sm text-on-surface hover:bg-surface-container-low transition-colors">
              <span class="material-symbols-outlined text-xl">code</span>
              GitHub
            </button>
          </div>
        </div>

        <!-- Footer -->
        <p class="text-center text-xs text-on-surface-variant mt-lg">
          &copy; 2024 Flow 生产力. 保留所有权利.
        </p>
      </div>
    </div>
  </div>
</template>
