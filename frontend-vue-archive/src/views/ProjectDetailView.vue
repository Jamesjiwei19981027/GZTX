<script setup lang="ts">
import { computed, defineComponent, onMounted, ref, watch, type PropType } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  createNode,
  getNodeProgress,
  getProject,
  getProjectTree,
  listNodeEvidence,
  submitEvidence,
  uploadEvidenceFile,
} from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import type { EvidencePackageDTO, ProgressRecordDTO, ProjectDTO, TreeNodeDTO } from '@/types/collab'
import AgentChatDrawer from '@/components/AgentChatDrawer.vue'

const TreeItem = defineComponent({
  name: 'TreeItem',
  props: {
    node: { type: Object as PropType<TreeNodeDTO>, required: true },
    selectedId: { type: Number, default: undefined },
  },
  emits: ['select'],
  template: `
    <li>
      <button
        class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-primary/10"
        :class="node.id === selectedId ? 'bg-primary/15 text-primary font-medium' : ''"
        @click="$emit('select', node)"
      >
        <span class="opacity-60 mr-1">{{ '·'.repeat(Math.min(node.depth, 4)) }}</span>
        {{ node.title }}
        <span class="text-xs opacity-60 ml-1">{{ node.progress_json?.status || '' }}</span>
      </button>
      <ul v-if="node.children?.length" class="ml-3 border-l border-surface-variant pl-1">
        <TreeItem
          v-for="c in node.children"
          :key="c.id"
          :node="c"
          :selected-id="selectedId"
          @select="$emit('select', $event)"
        />
      </ul>
    </li>
  `,
})

const route = useRoute()
const projectId = computed(() => Number(route.params.id))
const project = ref<ProjectDTO | null>(null)
const tree = ref<TreeNodeDTO[]>([])
const selected = ref<TreeNodeDTO | null>(null)
const progressRecords = ref<ProgressRecordDTO[]>([])
const evidenceList = ref<EvidencePackageDTO[]>([])
const loading = ref(false)
const newTitle = ref('')
const evidenceText = ref('')
const evidencePercent = ref(80)
const submitting = ref(false)
const chatOpen = ref(false)
const pendingFileIds = ref<number[]>([])
const uploading = ref(false)
const companyId = computed(() => {
  if (project.value?.company_id) return project.value.company_id
  const raw = localStorage.getItem('company_id')
  if (raw && Number(raw) > 0) return Number(raw)
  return 0
})

async function loadAll() {
  loading.value = true
  try {
    project.value = await getProject(projectId.value)
    const t = await getProjectTree(projectId.value, 'nested')
    tree.value = t.nodes || []
    if (!selected.value && tree.value.length) {
      selectNode(findFirstWorkItem(tree.value) || tree.value[0])
    }
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '加载项目失败'))
  } finally {
    loading.value = false
  }
}

function findFirstWorkItem(nodes: TreeNodeDTO[]): TreeNodeDTO | null {
  for (const n of nodes) {
    if (n.behavior_template === 'work_item') return n
    if (n.children?.length) {
      const f = findFirstWorkItem(n.children)
      if (f) return f
    }
  }
  return null
}

async function selectNode(n: TreeNodeDTO) {
  selected.value = n
  try {
    const p = await getNodeProgress(n.id)
    progressRecords.value = p.recent_records || []
    selected.value = { ...n, progress_json: p.progress_json }
    const ev = await listNodeEvidence(n.id)
    evidenceList.value = ev.items || []
  } catch {
    progressRecords.value = []
    evidenceList.value = []
  }
}

async function addWorkItem() {
  if (!newTitle.value.trim()) return
  try {
    const parentId = selected.value?.id ?? null
    const node = await createNode(projectId.value, {
      parent_id: parentId,
      node_type_key: 'work_item',
      title: newTitle.value.trim(),
    })
    newTitle.value = ''
    ElMessage.success('节点已创建')
    await loadAll()
    await selectNode(node)
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '创建节点失败'))
  }
}

async function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    if (!companyId.value) {
      ElMessage.error('缺少公司上下文，请先在项目列表选择公司')
      return
    }
    const res = await uploadEvidenceFile(file, {
      company_id: companyId.value,
      project_id: projectId.value,
    })
    pendingFileIds.value.push(res.file_id)
    ElMessage.success(`已上传：${res.original_name}`)
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '上传失败'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function onSubmitEvidence() {
  if (!selected.value) return
  submitting.value = true
  try {
    const res = await submitEvidence(selected.value.id, {
      summary_text: evidenceText.value || '进度更新',
      structured: {
        percent: evidencePercent.value,
        status: evidencePercent.value >= 100 ? 'done' : 'in_progress',
      },
      file_ids: [...pendingFileIds.value],
    })
    ElMessage.success(`材料已提交：${res.status}`)
    evidenceText.value = ''
    pendingFileIds.value = []
    await selectNode(selected.value)
    await loadAll()
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '提交材料失败'))
  } finally {
    submitting.value = false
  }
}

function statusLabel(pj: TreeNodeDTO['progress_json']) {
  if (!pj) return '-'
  if (pj.template === 'work_item') return `${pj.status || '-'} ${pj.percent ?? 0}%`
  return pj.status || pj.template
}

onMounted(loadAll)
watch(projectId, loadAll)
</script>

<template>
  <div class="h-full flex flex-col md:flex-row overflow-hidden">
    <aside class="w-full md:w-80 border-r border-surface-variant bg-surface p-4 overflow-y-auto">
      <div class="mb-3 flex items-start justify-between gap-2">
        <div>
          <h1 class="font-bold text-lg">{{ project?.name || '项目' }}</h1>
          <p class="text-xs text-on-surface-variant">#{{ projectId }} · {{ project?.status }}</p>
        </div>
        <button
          class="text-xs px-2 py-1 rounded-lg border border-primary text-primary whitespace-nowrap"
          @click="chatOpen = true"
        >
          智能体
        </button>
      </div>
      <div v-if="loading" class="text-sm text-on-surface-variant">加载中…</div>
      <ul v-else class="space-y-1 text-sm">
        <TreeItem
          v-for="n in tree"
          :key="n.id"
          :node="n"
          :selected-id="selected?.id"
          @select="selectNode"
        />
      </ul>
      <div class="mt-4 flex gap-2">
        <input
          v-model="newTitle"
          class="flex-1 border rounded-lg px-2 py-1 text-sm"
          placeholder="新建工作项标题"
          @keyup.enter="addWorkItem"
        />
        <button class="text-xs px-2 py-1 bg-primary text-white rounded-lg" @click="addWorkItem">添加</button>
      </div>
    </aside>

    <main class="flex-1 p-6 overflow-y-auto">
      <div v-if="!selected" class="text-on-surface-variant">选择左侧节点</div>
      <template v-else>
        <h2 class="text-xl font-semibold">{{ selected.title }}</h2>
        <p class="text-sm text-on-surface-variant mt-1">
          {{ selected.node_type_key }} · 进度 {{ statusLabel(selected.progress_json) }}
        </p>

        <section class="mt-6 p-4 rounded-2xl border border-surface-variant bg-surface">
          <h3 class="font-medium mb-3">提交材料</h3>
          <textarea
            v-model="evidenceText"
            rows="3"
            class="w-full border rounded-xl px-3 py-2 text-sm mb-2"
            placeholder="说明本次进展…"
          />
          <div class="flex items-center gap-3 mb-3">
            <label class="text-sm">完成度 %</label>
            <input v-model.number="evidencePercent" type="number" min="0" max="100" class="w-20 border rounded px-2 py-1" />
          </div>
          <div class="flex items-center gap-3 mb-3 text-sm">
            <input type="file" @change="onPickFile" />
            <span class="text-on-surface-variant">
              {{ uploading ? '上传中…' : `已选文件 ${pendingFileIds.length} 个` }}
            </span>
          </div>
          <button
            class="px-4 py-2 rounded-xl bg-primary text-white text-sm"
            :disabled="submitting"
            @click="onSubmitEvidence"
          >
            {{ submitting ? '提交中…' : '提交并判定' }}
          </button>
        </section>

        <section class="mt-6">
          <h3 class="font-medium mb-2">进度时间线</h3>
          <div v-if="!progressRecords.length" class="text-sm text-on-surface-variant">暂无正式进度记录</div>
          <ul v-else class="space-y-2">
            <li
              v-for="r in progressRecords"
              :key="r.id"
              class="text-sm p-3 rounded-xl bg-surface border border-surface-variant"
            >
              <div class="font-medium">#{{ r.id }} · {{ r.event_type }} · {{ r.source }}</div>
              <div class="text-on-surface-variant mt-1">{{ r.reason || '' }}</div>
              <div class="text-xs mt-1">状态：{{ r.after_json?.status }} {{ r.after_json?.percent ?? '' }}%</div>
            </li>
          </ul>
        </section>

        <section class="mt-6">
          <h3 class="font-medium mb-2">材料包</h3>
          <ul class="space-y-2 text-sm">
            <li v-for="e in evidenceList" :key="e.id" class="p-3 rounded-xl border border-surface-variant">
              #{{ e.id }} · {{ e.status }} · {{ e.summary_text }}
              <span v-if="e.judge_result" class="text-xs text-on-surface-variant block mt-1">
                {{ e.judge_result.decision }}：{{ e.judge_result.reason }}
              </span>
            </li>
          </ul>
        </section>
      </template>
    </main>

    <AgentChatDrawer
      v-model="chatOpen"
      :company-id="companyId"
      :project-id="projectId"
      :node-id="selected?.id"
      :node-title="selected?.title"
    />
  </div>
</template>
