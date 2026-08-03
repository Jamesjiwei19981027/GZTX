import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { listMyCompanies } from '@/api/collab'
import type { CompanyDTO } from '@/types/collab'

const STORAGE_KEY = 'company_id'

type CompanyContextState = {
  companyId: number
  companies: CompanyDTO[]
  loading: boolean
  loaded: boolean
}

let state: CompanyContextState = {
  companyId: Number(localStorage.getItem(STORAGE_KEY) || 0) || 0,
  companies: [],
  loading: false,
  loaded: false,
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function setState(partial: Partial<CompanyContextState>) {
  state = { ...state, ...partial }
  emit()
}

function getSnapshot(): CompanyContextState {
  return state
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function persist(id: number) {
  const next = id > 0 ? id : 0
  if (next > 0) {
    localStorage.setItem(STORAGE_KEY, String(next))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
  setState({ companyId: next })
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
  setState({ companies: [], loaded: false })
  persist(0)
}

/**
 * 拉取我的公司列表；若本地无 company_id 或已失效，自动选第一家。
 */
export async function ensureCompanyContext(force = false): Promise<number> {
  if (state.loaded && !force && state.companies.length) {
    return state.companyId
  }
  setState({ loading: true })
  try {
    const data = await listMyCompanies()
    const companies = data?.items || []
    setState({ companies, loaded: true })
    const ids = new Set(companies.map((c) => c.id))
    if (state.companyId > 0 && ids.has(state.companyId)) {
      return state.companyId
    }
    if (companies.length === 1) {
      persist(companies[0].id)
      return state.companyId
    }
    if (companies.length > 1) {
      const preferred = companies.find((c) => c.slug === 'default') || companies[0]
      persist(preferred.id)
      return state.companyId
    }
    persist(0)
    return 0
  } catch {
    setState({ companies: [], loaded: true })
    return state.companyId
  } finally {
    setState({ loading: false })
  }
}

export function useCompanyContext() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const current = useMemo(
    () => snap.companies.find((c) => c.id === snap.companyId) || null,
    [snap.companies, snap.companyId],
  )

  const persistFn = useCallback((id: number) => {
    persist(id)
  }, [])

  return {
    companyId: snap.companyId,
    companies: snap.companies,
    current,
    loading: snap.loading,
    loaded: snap.loaded,
    setCompanyId,
    clearCompanyContext,
    ensureCompanyContext,
    persist: persistFn,
  }
}
