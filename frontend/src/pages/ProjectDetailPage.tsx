import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { message } from '@/utils/antdMessage'
import {
  createNode,
  deleteNode,
  getNodeProgress,
  getProject,
  getProjectTree,
  listNodeEvidence,
  listProjectMembers,
  moveNode,
  patchNode,
  setNodeAssignees,
} from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import { getStoredCompanyId } from '@/hooks/useCompanyContext'
import { useAuthStore } from '@/stores/auth'
import OutlineTree from '@/components/project/OutlineTree'
import EvidencePanel from '@/components/project/EvidencePanel'
import AgentChatDrawer from '@/components/project/AgentChatDrawer'
import WorkTreeCanvas from '@/components/workTree/WorkTreeCanvas'
import { hasLeaderOnSpine, isPerson } from '@/components/workTree/layout'
import { zhStatus } from '@/utils/zhLabels'
import type {
  EvidencePackageDTO,
  ProgressRecordDTO,
  ProjectDTO,
  ProjectMemberDTO,
  TreeNodeDTO,
} from '@/types/collab'

type TreeViewTab = 'canvas' | 'outline'

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = Number(params.id)
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)

  const [project, setProject] = useState<ProjectDTO | null>(null)
  const [tree, setTree] = useState<TreeNodeDTO[]>([])
  const [members, setMembers] = useState<ProjectMemberDTO[]>([])
  const [selected, setSelected] = useState<TreeNodeDTO | null>(null)
  const [progressRecords, setProgressRecords] = useState<ProgressRecordDTO[]>([])
  const [evidenceList, setEvidenceList] = useState<EvidencePackageDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [treeTab, setTreeTab] = useState<TreeViewTab>('canvas')

  const selectedRef = useRef<TreeNodeDTO | null>(null)
  selectedRef.current = selected

  const companyId = useMemo(() => {
    if (project?.company_id) return project.company_id
    const stored = getStoredCompanyId()
    return stored > 0 ? stored : 0
  }, [project?.company_id])

  const selectNode = useCallback(async (n: TreeNodeDTO | null) => {
    setSelected(n)
    if (!n) {
      setProgressRecords([])
      setEvidenceList([])
      return
    }
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
      const [t, m] = await Promise.all([
        getProjectTree(projectId, 'nested'),
        listProjectMembers(projectId).catch(() => ({ items: [] as ProjectMemberDTO[] })),
      ])
      const nodes = t.nodes || []
      setTree(nodes)
      setMembers(m.items || [])
      if (selectedRef.current) {
        const still = findNode(nodes, selectedRef.current.id)
        if (still) await selectNode(still)
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

  async function handleCreate(args: {
    nodeTypeKey: string
    title: string
    parentId?: number | null
  }) {
    try {
      const node = await createNode(projectId, {
        parent_id: args.parentId ?? null,
        node_type_key: args.nodeTypeKey,
        title: args.title,
      })
      message.success('已创建')
      await loadAll()
      await selectNode(node)
    } catch (e) {
      message.error(getErrorMessage(e, '创建失败'))
    }
  }

  async function handleEnsureLeader() {
    if (!project) return
    const ownerId = project.final_owner_user_id ?? project.pm_user_id
    if (ownerId == null) {
      message.warning('项目尚未指定负责人')
      return
    }
    if (hasLeaderOnSpine(tree, ownerId)) {
      message.info('终责已在主干上')
      return
    }
    try {
      const title =
        project.final_owner?.nickname ||
        project.final_owner?.username ||
        '项目负责人'
      const node = await createNode(projectId, {
        parent_id: null,
        node_type_key: 'person',
        title,
      })
      await setNodeAssignees(node.id, [ownerId])
      message.success(`已将「${title}」放到主干终点`)
      await loadAll()
      await selectNode(node)
    } catch (e) {
      message.error(getErrorMessage(e, '放置负责人失败'))
    }
  }

  async function handleMove(nodeId: number, newParentId: number | null) {
    try {
      await moveNode(nodeId, { new_parent_id: newParentId, sort_order: 0 })
      await loadAll()
    } catch (e) {
      message.error(getErrorMessage(e, '移动失败'))
    }
  }

  async function handlePatch(
    nodeId: number,
    patch: { title?: string; node_type_key?: string },
  ) {
    try {
      await patchNode(nodeId, patch)
      await loadAll()
    } catch (e) {
      message.error(getErrorMessage(e, '保存失败'))
    }
  }

  async function handleAssignees(nodeId: number, userIds: number[]) {
    try {
      await setNodeAssignees(nodeId, userIds)
      await loadAll()
    } catch (e) {
      message.error(getErrorMessage(e, '指派失败'))
    }
  }

  async function handleDelete(nodeId: number) {
    try {
      await deleteNode(nodeId)
      message.success('已删除')
      await loadAll()
    } catch (e) {
      message.error(getErrorMessage(e, '删除失败'))
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
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-surface-variant bg-surface shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-lg truncate">{project?.name || '项目'}</h1>
          <p className="text-xs text-on-surface-variant">
            #{projectId} · {zhStatus(project?.status)}
            {project?.final_owner
              ? ` · 终责 ${project.final_owner.nickname || project.final_owner.username || ''}`
              : ''}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-container-low p-0.5">
          <button
            type="button"
            className={`text-xs px-3 py-1.5 rounded-md ${
              treeTab === 'canvas'
                ? 'bg-surface text-primary font-medium shadow-sm'
                : 'text-on-surface-variant'
            }`}
            onClick={() => setTreeTab('canvas')}
          >
            人轴画布
          </button>
          <button
            type="button"
            className={`text-xs px-3 py-1.5 rounded-md ${
              treeTab === 'outline'
                ? 'bg-surface text-primary font-medium shadow-sm'
                : 'text-on-surface-variant'
            }`}
            onClick={() => setTreeTab('outline')}
          >
            大纲
          </button>
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-lg border border-primary text-primary whitespace-nowrap"
          onClick={() => setChatOpen(true)}
        >
          智能体
        </button>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0">
          {treeTab === 'canvas' && project ? (
            <WorkTreeCanvas
              project={project}
              tree={tree}
              members={members}
              currentUserId={currentUserId}
              selectedId={selected?.id ?? null}
              loading={loading}
              onSelect={(n) => void selectNode(n)}
              onEnsureLeader={handleEnsureLeader}
              onCreate={handleCreate}
              onMove={handleMove}
              onPatch={handlePatch}
              onSetAssignees={handleAssignees}
              onDelete={handleDelete}
            />
          ) : (
            <div className="h-full p-4 overflow-y-auto bg-surface">
              {loading ? (
                <div className="text-sm text-on-surface-variant">加载中…</div>
              ) : (
                <OutlineTree
                  nodes={tree}
                  selectedId={selected?.id}
                  onSelect={(n) => void selectNode(n)}
                />
              )}
              <div className="mt-4">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg"
                  onClick={() =>
                    void handleCreate({
                      nodeTypeKey: 'person',
                      title: '未命名',
                      parentId: selected && isPerson(selected) ? selected.id : null,
                    })
                  }
                >
                  添加人员
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="w-full md:w-[360px] border-l border-surface-variant bg-surface overflow-y-auto shrink-0">
          {!selected ? (
            <div className="p-6 text-on-surface-variant text-sm">选择节点查看证据与进度</div>
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
        </aside>
      </div>

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

function findNode(nodes: TreeNodeDTO[], id: number): TreeNodeDTO | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const c = findNode(n.children || [], id)
    if (c) return c
  }
  return null
}
