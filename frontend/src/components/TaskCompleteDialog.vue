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
  follow_up_remind_at: '',
  follow_up_notify_channels: [] as string[]
})

const channelOptions = [
  { label: '浏览器推送', value: 'web_push', icon: 'notifications' },
  { label: '邮件', value: 'email', icon: 'mail' },
  { label: '短信', value: 'sms', icon: 'sms' },
  { label: '桌面弹窗', value: 'desktop', icon: 'desktop_windows' }
]

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
      follow_up_remind_at: '',
      follow_up_notify_channels: ['web_push']
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
    data.follow_up_reason = form.value.follow_up_reason || undefined

    if (form.value.follow_up_remind_at) {
      // Append timezone offset
      const tzOffset = new Date().getTimezoneOffset()
      const offsetHours = Math.abs(Math.floor(tzOffset / 60))
      const offsetMinutes = Math.abs(tzOffset % 60)
      const offsetSign = tzOffset <= 0 ? '+' : '-'
      const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`
      data.follow_up_remind_at = form.value.follow_up_remind_at + offsetStr
    }

    if (form.value.follow_up_notify_channels.length > 0) {
      data.follow_up_notify_channels = form.value.follow_up_notify_channels.join(',')
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
              <span class="material-symbols-outlined text-body-md align-middle mr-xs">reason</span>
              跟进原因
            </label>
            <ElInput
              v-model="form.follow_up_reason"
              type="textarea"
              :rows="2"
              :autosize="{ minRows: 2, maxRows: 4 }"
              placeholder="说明需要跟进的事项"
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
              通知渠道
            </label>
            <ElSelect
              v-model="form.follow_up_notify_channels"
              multiple
              placeholder="选择通知渠道"
              style="width: 100%"
              collapse-tags
            >
              <ElOption
                v-for="opt in channelOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              >
                <div class="flex items-center gap-sm">
                  <span class="material-symbols-outlined text-body-sm">{{ opt.icon }}</span>
                  <span>{{ opt.label }}</span>
                </div>
              </ElOption>
            </ElSelect>
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
