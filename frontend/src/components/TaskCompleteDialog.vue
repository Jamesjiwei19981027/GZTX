<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { TaskCompleteRequest } from '@/types'
import { ElDialog, ElSlider, ElInput, ElCheckbox, ElDatePicker, ElSelect, ElOption, ElButton, ElFormItem } from 'element-plus'
import dayjs from 'dayjs'

const props = defineProps<{
  modelValue: boolean
  taskTitle?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', data: TaskCompleteRequest): void
}>()

const form = ref({
  completion_rate: 100,
  completion_comment: '',
  needs_follow_up: false,
  follow_up_reason: '',
  follow_up_reason_custom: '',
  follow_up_remind_at: '',
  follow_up_notify_channels: 'web_popup'
})

const channelOptions = [
  { value: 'web_popup', label: '网页弹窗', icon: 'web' },
  { value: 'email', label: '邮件提醒', icon: 'mail' },
  { value: 'wechat', label: '微信提醒', icon: 'chat' },
  { value: 'sms', label: '短信提醒', icon: 'sms' },
  { value: 'alarm', label: '闹钟提醒', icon: 'notifications_active' },
]

const followUpReasonOptions = [
  '任务部分完成，需继续推进',
  '等待他人反馈或确认',
  '需要后续验证结果',
  '存在待解决的依赖问题',
  '需要补充相关材料',
  '需要再次沟通确认',
  '其他',
]

const isCustomReason = computed(() => form.value.follow_up_reason === '其他')

function toggleChannel(channel: string) {
  const channels = form.value.follow_up_notify_channels
    ? form.value.follow_up_notify_channels.split(',').filter(Boolean)
    : []
  const idx = channels.indexOf(channel)
  if (idx > -1) {
    channels.splice(idx, 1)
  } else {
    channels.push(channel)
  }
  form.value.follow_up_notify_channels = channels.join(',')
}

function isChannelActive(channel: string) {
  const channels = form.value.follow_up_notify_channels
    ? form.value.follow_up_notify_channels.split(',').filter(Boolean)
    : []
  return channels.includes(channel)
}

const sliderMarks = computed(() => ({
  0: '0%',
  25: '25%',
  50: '50%',
  75: '75%',
  100: '100%'
}))

const rateColor = computed(() => {
  const r = form.value.completion_rate
  if (r >= 80) return '#006c49'
  if (r >= 50) return '#924700'
  return '#ba1a1a'
})

watch(() => props.modelValue, (val) => {
  if (val) {
    form.value = {
      completion_rate: 100,
      completion_comment: '',
      needs_follow_up: false,
      follow_up_reason: '',
      follow_up_reason_custom: '',
      follow_up_remind_at: '',
      follow_up_notify_channels: 'web_popup'
    }
  }
})

function handleClose() {
  emit('update:modelValue', false)
}

function handleSubmit() {
  const data: TaskCompleteRequest = {
    completion_rate: form.value.completion_rate,
    completion_comment: form.value.completion_comment || undefined,
    needs_follow_up: form.value.needs_follow_up
  }

  if (form.value.needs_follow_up) {
    // 跟进原因：如果选了"其他"则使用自定义文本
    if (isCustomReason.value) {
      data.follow_up_reason = form.value.follow_up_reason_custom || undefined
    } else {
      data.follow_up_reason = form.value.follow_up_reason || undefined
    }

    if (form.value.follow_up_remind_at) {
      data.follow_up_remind_at = form.value.follow_up_remind_at
    }

    if (form.value.follow_up_notify_channels) {
      data.follow_up_notify_channels = form.value.follow_up_notify_channels
    }
  }

  emit('submit', data)
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :show-close="true"
    :close-on-click-modal="false"
    width="560px"
    class="task-complete-dialog"
    :append-to-body="true"
  >
    <template #header>
      <div class="flex items-center gap-md">
        <span class="material-symbols-outlined text-secondary text-headline-sm">task_alt</span>
        <div>
          <h3 class="text-headline-sm text-on-surface m-0">完成任务评价</h3>
          <p v-if="taskTitle" class="text-body-sm text-on-surface-variant mt-xs m-0 truncate max-w-md">
            {{ taskTitle }}
          </p>
        </div>
      </div>
    </template>

    <div class="px-sm py-md space-y-lg">
      <!-- Completion Rate -->
      <div class="bg-surface-container-low rounded-xl p-md">
        <div class="flex items-center justify-between mb-sm">
          <label class="text-label-md text-on-surface-variant">
            <span class="material-symbols-outlined text-body-md align-middle mr-xs">donut_large</span>
            完成度
          </label>
          <span
            class="text-headline-sm font-bold"
            :style="{ color: rateColor }"
          >
            {{ form.completion_rate }}%
          </span>
        </div>
        <ElSlider
          v-model="form.completion_rate"
          :min="0"
          :max="100"
          :step="5"
          :marks="sliderMarks"
          :show-tooltip="true"
        />
      </div>

      <!-- Completion Comment -->
      <div>
        <label class="text-label-md text-on-surface-variant block mb-sm">
          <span class="material-symbols-outlined text-body-md align-middle mr-xs">description</span>
          完成说明
        </label>
        <ElInput
          v-model="form.completion_comment"
          type="textarea"
          :rows="3"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="简要说明完成情况（可选）"
          maxlength="300"
          show-word-limit
        />
      </div>

      <!-- Needs Follow-up Toggle -->
      <div class="bg-surface-container-low rounded-xl p-md">
        <ElCheckbox v-model="form.needs_follow_up" class="follow-up-checkbox">
          <span class="flex items-center gap-sm">
            <span class="material-symbols-outlined text-tertiary text-body-md">follow_the_signs</span>
            <span class="text-label-md text-on-surface">需要后续跟进</span>
          </span>
        </ElCheckbox>
      </div>

      <!-- Follow-up Details (conditional) -->
      <Transition name="slide-down">
        <div v-if="form.needs_follow_up" class="bg-tertiary-fixed/30 rounded-xl p-md space-y-md border border-tertiary-fixed-dim/40">
          <!-- Follow-up Reason -->
          <div>
            <label class="text-label-md text-on-surface-variant block mb-sm">
              <span class="material-symbols-outlined text-body-md align-middle mr-xs">campaign</span>
              跟进原因
            </label>
            <ElSelect
              v-model="form.follow_up_reason"
              placeholder="请选择跟进原因"
              style="width: 100%"
            >
              <ElOption
                v-for="reason in followUpReasonOptions"
                :key="reason"
                :label="reason"
                :value="reason"
              />
            </ElSelect>
            <ElInput
              v-if="isCustomReason"
              v-model="form.follow_up_reason_custom"
              type="textarea"
              :rows="2"
              :autosize="{ minRows: 2, maxRows: 4 }"
              placeholder="请输入跟进原因"
              class="mt-sm"
            />
          </div>

          <!-- Remind At -->
          <div>
            <label class="text-label-md text-on-surface-variant block mb-sm">
              <span class="material-symbols-outlined text-body-md align-middle mr-xs">alarm</span>
              提醒时间
            </label>
            <ElDatePicker
              v-model="form.follow_up_remind_at"
              type="datetime"
              placeholder="选择跟进提醒时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 100%"
              :disabled-date="(date: Date) => dayjs(date).isBefore(dayjs().startOf('day'))"
            />
          </div>

          <!-- Notification Channels -->
          <div>
            <label class="text-label-md text-on-surface-variant block mb-sm">
              <span class="material-symbols-outlined text-body-md align-middle mr-xs">cell_tower</span>
              通知方式
            </label>
            <div class="flex flex-wrap gap-sm">
              <button
                v-for="opt in channelOptions"
                :key="opt.value"
                type="button"
                class="flex items-center gap-xs rounded-lg px-sm py-xs text-label-sm transition border"
                :class="isChannelActive(opt.value)
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container-high'"
                @click="toggleChannel(opt.value)"
              >
                <span class="material-symbols-outlined !text-[16px]">{{ opt.icon }}</span>
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <template #footer>
      <div class="flex justify-end gap-md">
        <button type="button" class="btn-ghost" @click="handleClose">
          <span class="material-symbols-outlined text-body-md">close</span>
          取消
        </button>
        <button type="button" class="btn-primary" @click="handleSubmit">
          <span class="material-symbols-outlined text-body-md">check_circle</span>
          确认完成
        </button>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped>
/* Slide-down transition for follow-up section */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
}

.slide-down-enter-to,
.slide-down-leave-from {
  opacity: 1;
  max-height: 500px;
  transform: translateY(0);
}

/* Dialog header overrides */
:deep(.el-dialog__header) {
  border-bottom: 1px solid #e1e3e4;
  margin-right: 0;
  padding: 16px 24px;
}

:deep(.el-dialog__body) {
  padding: 0;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid #e1e3e4;
  padding: 16px 24px;
}

:deep(.el-dialog) {
  border-radius: 16px;
  overflow: hidden;
}

/* Slider styling */
:deep(.el-slider__bar) {
  background-color: #006c49;
}

:deep(.el-slider__button) {
  border-color: #006c49;
}

/* Checkbox styling */
.follow-up-checkbox {
  width: 100%;
}

:deep(.el-checkbox__label) {
  width: 100%;
  padding-left: 8px;
}
</style>
