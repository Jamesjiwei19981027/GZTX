<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createProject, listProjects } from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import { useCompanyContext } from '@/composables/useCompanyContext'
import type { ProjectDTO } from '@/types/collab'

const router = useRouter()
const { companyId, companies, loading: ctxLoading, ensureCompanyContext, persist } =
  useCompanyContext()

const projects = ref<ProjectDTO[]>([])
const loading = ref(false)
const creating = ref(false)
const showCreate = ref(false)
const form = ref({ name: '' })

async function load() {
  if (!companyId.value || companyId.value <= 0) {
    projects.value = []
    return
  }
  loading.value = true
  try {
    const data = await listProjects(companyId.value)
    projects.value = data.items || []
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '加载项目失败（请先开通公司与 License）'))
    projects.value = []
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }
  if (!companyId.value || companyId.value <= 0) {
    ElMessage.warning('请先选择公司')
    return
  }
  creating.value = true
  try {
    const p = await createProject({
      name: form.value.name.trim(),
      company_id: companyId.value,
    })
    ElMessage.success('项目已创建')
    showCreate.value = false
    form.value.name = ''
    router.push(`/projects/${p.id}`)
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '创建失败'))
  } finally {
    creating.value = false
  }
}

function openProject(p: ProjectDTO) {
  router.push(`/projects/${p.id}`)
}

function onCompanyChange() {
  persist(companyId.value)
  load()
}

onMounted(async () => {
  await ensureCompanyContext()
  await load()
})

watch(companyId, () => {
  // 外部写入 company_id 时刷新
})
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-on-surface">项目</h1>
        <p class="text-sm text-on-surface-variant mt-1">公司协作项目树 · 证据化进度</p>
      </div>
      <button
        class="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        :disabled="!companyId"
        @click="showCreate = true"
      >
        新建项目
      </button>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <label class="text-on-surface-variant">当前公司</label>
      <select
        v-if="companies.length"
        v-model.number="companyId"
        class="min-w-[12rem] border border-surface-variant rounded-lg px-2 py-1.5 bg-surface"
        @change="onCompanyChange"
      >
        <option v-for="c in companies" :key="c.id" :value="c.id">
          {{ c.name }}（#{{ c.id }} · {{ c.slug }}）
        </option>
      </select>
      <template v-else-if="!ctxLoading">
        <span class="text-on-surface-variant">尚未加入任何公司</span>
        <router-link to="/company/settings" class="text-primary underline">去公司设置</router-link>
      </template>
      <span v-else class="text-on-surface-variant">加载公司…</span>
      <button class="text-primary underline ml-2" @click="ensureCompanyContext(true).then(load)">
        刷新
      </button>
    </div>

    <div v-if="loading || ctxLoading" class="text-on-surface-variant">加载中…</div>
    <div
      v-else-if="!companyId"
      class="text-on-surface-variant py-12 text-center border border-dashed border-surface-variant rounded-2xl"
    >
      注册后若未自动入会，请联系管理员解锁 License 或邀请入会。
    </div>
    <div
      v-else-if="!projects.length"
      class="text-on-surface-variant py-12 text-center border border-dashed border-surface-variant rounded-2xl"
    >
      暂无项目。需要组织权限且公司已激活 License。
    </div>
    <div v-else class="grid gap-3">
      <div
        v-for="p in projects"
        :key="p.id"
        class="p-4 rounded-2xl bg-surface border border-surface-variant hover:shadow-md cursor-pointer transition"
        @click="openProject(p)"
      >
        <div class="flex justify-between items-start">
          <div>
            <h2 class="font-semibold text-on-surface">{{ p.name }}</h2>
            <p class="text-xs text-on-surface-variant mt-1">
              #{{ p.id }} · {{ p.status }} · 角色 {{ p.my_role || '-' }}
            </p>
          </div>
          <span class="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">{{ p.status }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="showCreate"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      @click.self="showCreate = false"
    >
      <div class="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-semibold mb-4">创建空项目</h3>
        <p class="text-xs text-on-surface-variant mb-3">公司 #{{ companyId }}</p>
        <label class="block text-sm mb-1">项目名称</label>
        <input
          v-model="form.name"
          class="w-full border rounded-lg px-3 py-2 mb-4"
          placeholder="例如：营销改版"
        />
        <div class="flex justify-end gap-2">
          <button class="px-3 py-2 text-sm" @click="showCreate = false">取消</button>
          <button
            class="px-4 py-2 rounded-xl bg-primary text-white text-sm"
            :disabled="creating"
            @click="onCreate"
          >
            {{ creating ? '创建中…' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
