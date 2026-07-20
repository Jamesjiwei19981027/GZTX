<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { agentChat } from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import type { ChatMessage } from '@/types/collab'

const props = defineProps<{
  modelValue: boolean
  companyId: number
  projectId?: number | null
  nodeId?: number | null
  nodeTitle?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const messages = ref<ChatMessage[]>([])
const input = ref('')
const sending = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open && messages.value.length === 0) {
      const hint = props.nodeTitle
        ? `当前节点「${props.nodeTitle}」。可聊进度、澄清需求；材料请走提交材料区。`
        : '可与助手澄清进度与任务。微信通道禁止交材料。'
      messages.value = [{ role: 'system', content: hint }]
    }
  },
)

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  if (!props.companyId) {
    ElMessage.warning('缺少公司 ID')
    return
  }
  messages.value.push({ role: 'user', content: text, at: new Date().toISOString() })
  input.value = ''
  sending.value = true
  try {
    const msg = props.nodeId ? `[node:${props.nodeId}] ${text}` : text
    const res = await agentChat({
      company_id: props.companyId,
      project_id: props.projectId ?? null,
      channel: 'web',
      message: msg,
    })
    messages.value.push({
      role: 'assistant',
      content: res.reply,
      at: new Date().toISOString(),
    })
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '对话失败'))
  } finally {
    sending.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[80] flex justify-end bg-black/30"
    @click.self="close"
  >
    <aside class="w-full max-w-md h-full bg-surface shadow-xl flex flex-col border-l border-surface-variant">
      <header class="px-4 py-3 border-b border-surface-variant flex items-center justify-between">
        <div>
          <h2 class="font-semibold">智能体对话</h2>
          <p class="text-xs text-on-surface-variant">
            项目 #{{ projectId || '-' }} · 节点 {{ nodeTitle || nodeId || '未选' }}
          </p>
        </div>
        <button class="text-on-surface-variant hover:text-primary" @click="close">关闭</button>
      </header>

      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <div
          v-for="(m, i) in messages"
          :key="i"
          :class="[
            'text-sm rounded-xl px-3 py-2 max-w-[90%]',
            m.role === 'user'
              ? 'ml-auto bg-primary text-white'
              : m.role === 'system'
                ? 'bg-surface-container-low text-on-surface-variant'
                : 'bg-surface-container text-on-surface',
          ]"
        >
          {{ m.content }}
        </div>
      </div>

      <footer class="p-3 border-t border-surface-variant flex gap-2">
        <input
          v-model="input"
          class="flex-1 border border-surface-variant rounded-xl px-3 py-2 text-sm bg-background"
          placeholder="输入消息，Enter 发送"
          @keyup.enter="send"
        />
        <button
          class="px-4 py-2 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
          :disabled="sending"
          @click="send"
        >
          {{ sending ? '…' : '发送' }}
        </button>
      </footer>
    </aside>
  </div>
</template>
