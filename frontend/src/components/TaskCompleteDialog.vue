<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  taskTitle?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', data: {
    completion_rate: number
    completion_comment: string
    needs_follow_up: boolean
    follow_up_reason: string
    follow_up_remind_at?: string
    follow_up_notify_channels?: string
  }): void
}>()

const form = ref({
  completion_rate: 100,
  completion_comment: '',
  needs_follow_up: false,
  follow_up_reason: '',
  follow_up_remind_at: '',
  follow_up_notify_channels: 'web_push'
})

const channelOptions = [
  { label: '浏览器推送', value: 'web_push' },
  { label: '邮件', value: 'email' },
  { label: '短信', value: 'sms' },
  { label: '桌面弹窗', value: 'desktop' }
]

watch(() => props.modelValue, (val) => {
  if (val) {
    // 重置表单
    form.value = {
      completion_rate: 100,
      completion_comment: '',
      needs_follow_up: false,
      follow_up_reason: '',
      follow_up_remind_at: '',
      follow_up_notify_channels: 'web_push'
    }
  }
})

function handleClose() {
  emit('update:modelValue', false)
}

function handleSubmit() {
  const data: any = { ...form.value }

  // M5: 动态计算时区偏移并追加到 follow_up_remind_at
  if (data.needs_follow_up && data.follow_up_remind_at) {
    const tzOffset = new Date().getTimezoneOffset()
    const offsetHours = Math.abs(Math.floor(tzOffset / 60))
    const offsetMinutes = Math.abs(tzOffset % 60)
    const offsetSign = tzOffset <= 0 ? '+' : '-'
    const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`
    data.follow_up_remind_at = data.follow_up_remind_at + offsetStr
  } else {
    delete data.follow_up_remind_at
  }

  if (!data.needs_follow_up) {
    delete data.follow_up_reason
    delete data.follow_up_remind_at
    delete data.follow_up_notify_channels
  }

  emit('submit', data)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="完成任务评价"
    width="520px"
    :close-on-click-modal="false"
  >
    <div class="complete-form">
      <p class="task-name">{{ taskTitle }}</p>

      <el-form label-position="top">
        <el-form-item label="完成度">
          <div class="rate-row">
            <el-slider v-model="form.completion_rate" :min="0" :max="100" :step="5" style="flex: 1" />
            <span class="rate-value">{{ form.completion_rate }}%</span>
          </div>
        </el-form-item>

        <el-form-item label="完成说明">
          <el-input
            v-model="form.completion_comment"
            type="textarea"
            :rows="2"
            placeholder="简要说明完成情况（可选）"
          />
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.needs_follow_up">需要后续跟进</el-checkbox>
        </el-form-item>

        <template v-if="form.needs_follow_up">
          <el-form-item label="跟进原因">
            <el-input
              v-model="form.follow_up_reason"
              type="textarea"
              :rows="2"
              placeholder="说明需要跟进的事项"
            />
          </el-form-item>

          <el-form-item label="提醒时间">
            <el-date-picker
              v-model="form.follow_up_remind_at"
              type="datetime"
              placeholder="选择跟进提醒时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="通知渠道">
            <el-select v-model="form.follow_up_notify_channels" multiple style="width: 100%">
              <el-option
                v-for="opt in channelOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSubmit">确认完成</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.complete-form {
  padding: 0 10px;
}
.task-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--el-text-color-primary);
}
.rate-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}
.rate-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-color-primary);
  min-width: 45px;
  text-align: right;
}
</style>
