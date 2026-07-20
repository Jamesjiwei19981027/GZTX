import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { message } from '@/utils/antdMessage'
import { createProject, listProjects } from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import { useCompanyContext } from '@/hooks/useCompanyContext'
import type { ProjectDTO } from '@/types/collab'

export default function ProjectListPage() {
  const navigate = useNavigate()
  const { companyId, companies, loading: ctxLoading, ensureCompanyContext, persist } =
    useCompanyContext()

  const [projects, setProjects] = useState<ProjectDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [formName, setFormName] = useState('')

  const load = useCallback(async (cid: number) => {
    if (!cid || cid <= 0) {
      setProjects([])
      return
    }
    setLoading(true)
    try {
      const data = await listProjects(cid)
      setProjects(data.items || [])
    } catch (e) {
      message.error(getErrorMessage(e, '加载项目失败（请先开通公司与 License）'))
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const id = await ensureCompanyContext()
      await load(id)
    })()
  }, [ensureCompanyContext, load])

  async function onCreate() {
    if (!formName.trim()) {
      message.warning('请输入项目名称')
      return
    }
    if (!companyId || companyId <= 0) {
      message.warning('请先选择公司')
      return
    }
    setCreating(true)
    try {
      const p = await createProject({
        name: formName.trim(),
        company_id: companyId,
      })
      message.success('项目已创建')
      setShowCreate(false)
      setFormName('')
      navigate(`/projects/${p.id}`)
    } catch (e) {
      message.error(getErrorMessage(e, '创建失败'))
    } finally {
      setCreating(false)
    }
  }

  function onCompanyChange(nextId: number) {
    persist(nextId)
    void load(nextId)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">项目</h1>
          <p className="text-sm text-on-surface-variant mt-1">公司协作项目树 · 证据化进度</p>
        </div>
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          disabled={!companyId}
          onClick={() => setShowCreate(true)}
        >
          新建项目
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="text-on-surface-variant">当前公司</label>
        {companies.length ? (
          <select
            value={companyId || ''}
            className="min-w-[12rem] border border-surface-variant rounded-lg px-2 py-1.5 bg-surface"
            onChange={(e) => onCompanyChange(Number(e.target.value))}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（#{c.id} · {c.slug}）
              </option>
            ))}
          </select>
        ) : !ctxLoading ? (
          <>
            <span className="text-on-surface-variant">尚未加入任何公司</span>
            <Link to="/company/settings" className="text-primary underline">
              去公司设置
            </Link>
          </>
        ) : (
          <span className="text-on-surface-variant">加载公司…</span>
        )}
        <button
          type="button"
          className="text-primary underline ml-2"
          onClick={() => void ensureCompanyContext(true).then((id) => load(id))}
        >
          刷新
        </button>
      </div>

      {loading || ctxLoading ? (
        <div className="text-on-surface-variant">加载中…</div>
      ) : !companyId ? (
        <div className="text-on-surface-variant py-12 text-center border border-dashed border-surface-variant rounded-2xl">
          注册后若未自动入会，请联系管理员解锁 License 或邀请入会。
        </div>
      ) : !projects.length ? (
        <div className="text-on-surface-variant py-12 text-center border border-dashed border-surface-variant rounded-2xl">
          暂无项目。需要组织权限且公司已激活 License。
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-2xl bg-surface border border-surface-variant hover:shadow-md cursor-pointer transition"
              onClick={() => navigate(`/projects/${p.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate(`/projects/${p.id}`)
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-semibold text-on-surface">{p.name}</h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    #{p.id} · {p.status} · 角色 {p.my_role || '-'}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false)
          }}
          role="presentation"
        >
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">创建空项目</h3>
            <p className="text-xs text-on-surface-variant mb-3">公司 #{companyId}</p>
            <label className="block text-sm mb-1">项目名称</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4 bg-background border-surface-variant"
              placeholder="例如：营销改版"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onCreate()
              }}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 text-sm" onClick={() => setShowCreate(false)}>
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
                disabled={creating}
                onClick={() => void onCreate()}
              >
                {creating ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
