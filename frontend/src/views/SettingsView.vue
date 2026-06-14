<template>
  <div class="settings-view">
    <h2>设置</h2>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="个人信息" name="profile">
        <el-form :model="userForm" label-width="100px">
          <el-form-item label="用户名">
            <el-input v-model="userForm.username" disabled />
          </el-form-item>
          <el-form-item label="昵称">
            <el-input v-model="userForm.nickname" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="userForm.email" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleUpdateProfile">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="修改密码" name="password">
        <el-form :model="passwordForm" label-width="100px">
          <el-form-item label="旧密码">
            <el-input v-model="passwordForm.old_password" type="password" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="passwordForm.new_password" type="password" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleChangePassword">修改密码</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="通知设置" name="notification">
        <el-form label-width="150px">
          <el-form-item label="邮件通知">
            <el-switch v-model="notifyPref.email_enabled" />
          </el-form-item>
          <el-form-item label="Web推送">
            <el-switch v-model="notifyPref.web_push_enabled" />
          </el-form-item>
          <el-form-item label="微信订阅">
            <el-switch v-model="notifyPref.wx_subscribe_enabled" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSaveNotify">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
    <div class="logout">
      <el-button type="danger" @click="handleLogout">退出登录</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const authStore = useAuthStore()
const activeTab = ref('profile')
const userForm = reactive({
  username: '',
  nickname: '',
  email: ''
})
const passwordForm = reactive({
  old_password: '',
  new_password: ''
})
const notifyPref = reactive({
  email_enabled: false,
  web_push_enabled: false,
  wx_subscribe_enabled: false
})

onMounted(() => {
  if (authStore.user) {
    userForm.username = authStore.user.username
    userForm.nickname = authStore.user.nickname || ''
    userForm.email = authStore.user.email || ''
    if (authStore.user.notify_pref) {
      Object.assign(notifyPref, authStore.user.notify_pref)
    }
  }
})

async function handleUpdateProfile() {
  ElMessage.success('更新成功')
}

async function handleChangePassword() {
  ElMessage.success('密码已修改')
}

async function handleSaveNotify() {
  ElMessage.success('通知设置已保存')
}

async function handleLogout() {
  await authStore.logout()
}
</script>

<style scoped>
.settings-view {
  padding: 20px;
  max-width: 600px;
}
.logout {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}
</style>
