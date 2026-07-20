import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { message } from '@/utils/antdMessage'
import {
  createNode,
  getNodeProgress,
  getProject,
  getProjectTree,
  listNodeEvidence,
} from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import { getStoredCompanyId } from '@/hooks/useCompanyContext'
import OutlineTree from '@/components/project/OutlineTree'
import ProjectFlowView from '@/components/project/ProjectFlowView'
import EvidencePanel from '@/components/project/EvidencePanel'
import AgentChatDrawer from '@/components/project/AgentChatDrawer'
import type { EvidencePackageDTO, ProgressRecordDTO, ProjectDTO, TreeNodeDTO } from '@/types/collab'

type TreeViewTab = 'outline' | 'flow'

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

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = Number(params.id)

  const [project, setProject] = useState<ProjectDTO | null>(null)
  const [tree, setTree] = useState<TreeNodeDTO[]>([])
  const [selected, setSelected] = useState<TreeNodeDTO | null>(null)
  const [progressRecords, setProgressRecords] = useState<ProgressRecordDTO[]>([])
  const [evidenceList, setEvidenceList] = useState<EvidencePackageDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  /** Dual view: 大纲 (default) | 关系图 — shared selected node */
  const [treeTab, setTreeTab] = useState<TreeViewTab>('outline')

  const selectedRef = useRef<TreeNodeDTO | null>(null)
  selectedRef.current = selected

  const companyId = useMemo(() => {
    if (project?.company_id) return project.company_id
    const stored = getStoredCompanyId()
    return stored > 0 ? stored : 0
  }, [project?.company_id])

  const selectNode = useCallback(async (n: TreeNodeDTO) => {
    setSelected(n)
    try {
      const p = await getNodeProgress(n.id)
      setProgressRecords(p.recent_records || [])
      setSelected({ ...n, progress_json: p.progress_json })
      const ev = await listNodeEvidence(n.id)
      setEvidenceList(ev.items || [])
    } catch {
      setProgressRecords([])
      setEvidenceList([])
    }
  }, [])

  const loadAll = useCallback(async () => {
    if (!projectId || Number.isNaN(projectId) || projectId <= 0) {
      const msg = '无效的项目 ID'
      setLoadError(msg)
      message.error(msg)
      setProject(null)
      setTree([])
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const proj = await getProject(projectId)
      setProject(proj)
      const t = await getProjectTree(projectId, 'nested')
      const nodes = t.nodes || []
      setTree(nodes)
      if (!selectedRef.current && nodes.length) {
        await selectNode(findFirstWorkItem(nodes) || nodes[0])
      }
    } catch (e) {
      const msg = getErrorMessage(e, '加载项目失败')
      setLoadError(msg)
      message.error(msg)
      setProject(null)
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [projectId, selectNode])

  useEffect(() => {
    setSelected(null)
    setProgressRecords([])
    setEvidenceList([])
    selectedRef.current = null
    void loadAll()
  }, [loadAll])

  async function addWorkItem() {
    if (!newTitle.trim()) return
    try {
      const parentId = selected?.id ?? null
      const node = await createNode(projectId, {
        parent_id: parentId,
        node_type_key: 'work_item',
        title: newTitle.trim(),
      })
      setNewTitle('')
      message.success('节点已创建')
      await loadAll()
      await selectNode(node)
    } catch (e) {
      message.error(getErrorMessage(e, '创建节点失败'))
    }
  }

  if (loadError && !project && !loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <p className="text-on-surface-variant mb-2">无法加载项目</p>
        <p className="text-sm text-error mb-4">{loadError}</p>
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm"
          onClick={() => void loadAll()}
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      <aside className="w-full md:w-80 border-r border-surface-variant bg-surface p-4 overflow-y-auto">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h1 className="font-bold text-lg">{project?.name || '项目'}</h1>
            <p className="text-xs text-on-surface-variant">
              #{projectId} · {project?.status}
            </p>
          </div>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded-lg border border-primary text-primary whitespace-nowrap"
            onClick={() => setChatOpen(true)}
          >
            智能体
          </button>
        </div>
        <div className="mb-3 flex gap-1 rounded-lg bg-surface-container-low p-0.5">
          <button
            type="button"
            className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
              treeTab === 'outline'
                ? 'bg-surface text-primary font-medium shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            onClick={() => setTreeTab('outline')}
          >
            大纲
          </button>
          <button
            type="button"
            className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
              treeTab === 'flow'
                ? 'bg-surface text-primary font-medium shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            onClick={() => setTreeTab('flow')}
          >
            关系图
          </button>
        </div>
        {treeTab === 'outline' ? (
          loading ? (
            <div className="text-sm text-on-surface-variant">加载中…</div>
          ) : (
            <OutlineTree
              nodes={tree}
              selectedId={selected?.id}
              onSelect={(n) => void selectNode(n)}
            />
          )
        ) : (
          <ProjectFlowView
            nodes={tree}
            selectedId={selected?.id}
            onSelect={(n) => void selectNode(n)}
            loading={loading}
            error={loadError && tree.length === 0 ? loadError : null}
          />
        )}
        <div className="mt-4 flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 border rounded-lg px-2 py-1 text-sm bg-background border-surface-variant"
            placeholder="新建工作项标题"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addWorkItem()
            }}
          />
          <button
            type="button"
            className="text-xs px-2 py-1 bg-primary text-white rounded-lg"
            onClick={() => void addWorkItem()}
          >
            添加
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        {!selected ? (
          <div className="text-on-surface-variant">选择左侧节点</div>
        ) : (
          <EvidencePanel
            node={selected}
            companyId={companyId}
            projectId={projectId}
            progressRecords={progressRecords}
            evidenceList={evidenceList}
            onAfterSubmit={(updated) => {
              setProgressRecords(updated.progressRecords)
              setEvidenceList(updated.evidenceList)
              setSelected((prev) =>
                prev ? { ...prev, progress_json: updated.progress_json } : prev,
              )
              void loadAll()
            }}
          />
        )}
      </main>

      <AgentChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        companyId={companyId}
        projectId={projectId}
        nodeId={selected?.id}
        nodeTitle={selected?.title}
      />
    </div>
  )
}
