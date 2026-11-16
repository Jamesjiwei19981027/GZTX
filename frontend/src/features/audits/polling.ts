import type { AuditRun } from '../../api/shell'

/** 每个页面生命周期只保留一轮请求；销毁后未完成的请求不再写回。 */
export function startAuditPolling({ projectId, getRuns, fetchRun, onUpdate, onError }: {
  projectId: number
  getRuns: () => AuditRun[]
  fetchRun: (id: number) => Promise<AuditRun>
  onUpdate: (run: AuditRun) => void
  onError?: (error: unknown) => void
}): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  async function poll() {
    const running = new Map(getRuns().filter(row => row.project_id === projectId && row.status === 'running').map(row => [row.id, row]))
    await Promise.all([...running.keys()].map(async id => {
      try {
        const run = await fetchRun(id)
        if (!stopped && run.project_id === projectId) onUpdate(run)
      } catch (error) { if (!stopped) onError?.(error) }
    }))
    if (!stopped) timer = setTimeout(() => void poll(), 5000)
  }
  timer = setTimeout(() => void poll(), 5000)
  return () => { stopped = true; clearTimeout(timer) }
}
