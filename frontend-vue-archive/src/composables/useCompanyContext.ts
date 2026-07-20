import { computed, ref } from 'vue'
import { listMyCompanies } from '@/api/collab'
import type { CompanyDTO } from '@/types/collab'

const STORAGE_KEY = 'company_id'

const companyId = ref<number>(Number(localStorage.getItem(STORAGE_KEY) || 0) || 0)
const companies = ref<CompanyDTO[]>([])
const loading = ref(false)
const loaded = ref(false)

function persist(id: number) {
  companyId.value = id > 0 ? id : 0
  if (companyId.value > 0) {
    localStorage.setItem(STORAGE_KEY, String(companyId.value))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

/** 注册入会成功时写入 */
export function setCompanyId(id: number | null | undefined) {
  if (id != null && Number(id) > 0) {
    persist(Number(id))
  }
}

export function getStoredCompanyId(): number {
  return Number(localStorage.getItem(STORAGE_KEY) || 0) || 0
}

export function clearCompanyContext() {
  companies.value = []
  loaded.value = false
  persist(0)
}

/**
 * 拉取我的公司列表；若本地无 company_id 或已失效，自动选第一家。
 */
export async function ensureCompanyContext(force = false): Promise<number> {
  if (loaded.value && !force && companies.value.length) {
    return companyId.value
  }
  loading.value = true
  try {
    const data = await listMyCompanies()
    companies.value = data?.items || []
    loaded.value = true
    const ids = new Set(companies.value.map((c) => c.id))
    if (companyId.value > 0 && ids.has(companyId.value)) {
      return companyId.value
    }
    if (companies.value.length === 1) {
      persist(companies.value[0].id)
      return companyId.value
    }
    if (companies.value.length > 1) {
      // 优先 default slug，否则第一家
      const preferred =
        companies.value.find((c) => c.slug === 'default') || companies.value[0]
      persist(preferred.id)
      return companyId.value
    }
    persist(0)
    return 0
  } catch {
    companies.value = []
    loaded.value = true
    return companyId.value
  } finally {
    loading.value = false
  }
}

export function useCompanyContext() {
  const current = computed(() =>
    companies.value.find((c) => c.id === companyId.value) || null,
  )

  return {
    companyId,
    companies,
    current,
    loading,
    loaded,
    setCompanyId,
    clearCompanyContext,
    ensureCompanyContext,
    persist,
  }
}
