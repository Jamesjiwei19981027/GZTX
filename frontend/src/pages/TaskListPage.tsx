import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Input, Pagination, Spin, Switch, Modal } from 'antd'
import { message } from '@/utils/antdMessage'
import { useTaskStore } from '@/stores/task'
import TaskItem from '@/components/tasks/TaskItem'
import TaskCompleteDialog from '@/components/tasks/TaskCompleteDialog'
import type { Task, TaskCompleteRequest, TaskFilterParams, TaskPriority, TaskStatus } from '@/types'
import { getErrorMessage } from '@/api/request'

type StatusTab = 'all' | TaskStatus
type PriorityTab = 'all' | TaskPriority

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 0, label: '待办' },
  { key: 1, label: '进行中' },
  { key: 2, label: '已完成' },
]

const priorityTabs: { key: PriorityTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 0, label: '低' },
  { key: 1, label: '中' },
  { key: 2, label: '高' },
]

export default function TaskListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tasks = useTaskStore((s) => s.tasks)
  const pagination = useTaskStore((s) => s.pagination)
  const loading = useTaskStore((s) => s.loading)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)
  const fetchTaskDetail = useTaskStore((s) => s.fetchTaskDetail)
  const markComplete = useTaskStore((s) => s.markComplete)
  const markUncomplete = useTaskStore((s) => s.markUncomplete)
  const removeTask = useTaskStore((s) => s.removeTask)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<StatusTab>('all')
  const [activePriority, setActivePriority] = useState<PriorityTab>('all')
  const [needsFollowUp, setNeedsFollowUp] = useState(false)
  const [dueDateFrom, setDueDateFrom] = useState('')
  const [dueDateTo, setDueDateTo] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  const [completeOpen, setCompleteOpen] = useState(false)
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null)
  const [completeLoading, setCompleteLoading] = useState(false)

  const buildFilterParams = useCallback(
    (page = 1): TaskFilterParams => {
      const params: TaskFilterParams = {
        page,
        page_size: pagination.page_size || 20,
      }
      if (activeTab !== 'all') params.status = activeTab
      if (activePriority !== 'all') params.priority = activePriority
      if (searchQuery.trim()) params.search = searchQuery.trim()
      if (needsFollowUp) params.needs_follow_up = true
      if (dueDateFrom) params.due_date_from = dueDateFrom
      if (dueDateTo) params.due_date_to = dueDateTo
      return params
    },
    [activeTab, activePriority, searchQuery, needsFollowUp, dueDateFrom, dueDateTo, pagination.page_size],
  )

  const applyFilters = useCallback(
    (page = 1) => {
      void fetchTasks(buildFilterParams(page))
    },
    [fetchTasks, buildFilterParams],
  )

  // Init filters from URL query (dashboard / email links)
  useEffect(() => {
    const qStatus = searchParams.get('status')
    const qPriority = searchParams.get('priority')
    const qDateFrom = searchParams.get('due_date_from')
    const qDateTo = searchParams.get('due_date_to')
    if (qStatus !== null) setActiveTab(Number(qStatus) as TaskStatus)
    else setActiveTab('all')
    if (qPriority !== null) setActivePriority(Number(qPriority) as TaskPriority)
    else setActivePriority('all')
    setDueDateFrom(qDateFrom || '')
    setDueDateTo(qDateTo || '')
  }, [searchParams])

  // Fetch when filters settle
  useEffect(() => {
    applyFilters(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react to filter fields
  }, [activeTab, activePriority, needsFollowUp, dueDateFrom, dueDateTo])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => applyFilters(1), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const completingTitle = useMemo(() => {
    return tasks.find((t) => t.id === completingTaskId)?.title || detailTask?.title || ''
  }, [tasks, completingTaskId, detailTask])

  async function handleTaskClick(task: Task) {
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const full = await fetchTaskDetail(task.id)
      setDetailTask(full)
    } catch (err) {
      message.error(getErrorMessage(err, '加载任务详情失败'))
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  function handleCreate() {
    navigate('/tasks/new')
  }

  function handleEdit(task: Task) {
    setDetailOpen(false)
    navigate(`/tasks/${task.id}`)
  }

  function openComplete(task: { id: number }) {
    setCompletingTaskId(task.id)
    setCompleteOpen(true)
  }

  async function handleCompleteSubmit(data: TaskCompleteRequest) {
    if (!completingTaskId) return
    setCompleteLoading(true)
    try {
      await markComplete(completingTaskId, data)
      setCompleteOpen(false)
      setDetailOpen(false)
      applyFilters(pagination.page)
    } catch (err) {
      message.error(getErrorMessage(err, '操作失败'))
    } finally {
      setCompleteLoading(false)
    }
  }

  async function handleDetailUncomplete(task: Task) {
    try {
      await markUncomplete(task.id)
      setDetailOpen(false)
      message.success('已恢复为未完成')
      applyFilters(pagination.page)
    } catch (err) {
      message.error(getErrorMessage(err, '操作失败'))
    }
  }

  function handleDetailDelete(task: Task) {
    Modal.confirm({
      title: '删除确认',
      content: '确定要删除这个任务吗？此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeTask(task.id)
          setDetailOpen(false)
          message.success('任务已删除')
          applyFilters(pagination.page)
        } catch (err) {
          message.error(getErrorMessage(err, '删除失败'))
        }
      },
    })
  }

  function clearDateFilter() {
    setDueDateFrom('')
    setDueDateTo('')
    const next = new URLSearchParams(searchParams)
    next.delete('due_date_from')
    next.delete('due_date_to')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col h-full bg-surface-container-low">
      {/* Top bar */}
      <div className="h-16 bg-surface border-b border-surface-variant flex items-center justify-between px-6 flex-shrink-0 gap-4">
        <h2 className="font-headline text-headline-md text-on-surface m-0 whitespace-nowrap">我的任务</h2>
        <Input.Search
          allowClear
          placeholder="搜索任务..."
          className="max-w-xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {/* 「新建任务」由侧边栏的全局 CTA（移动端为右下 FAB）承担，
            此处不再重复一个：同屏两个一模一样的主按钮只是噪音。
            空态里的那个另有价值（引导首个任务），保留。 */}
      </div>

      {/* Filters —— 两组筛选器都含一个「全部」，不加维度标签时并排出现
          「全部 待办 进行中 已完成 全部 低 中 高」，用户根本分不清第二个
          「全部」是什么的全部。加上「状态 / 优先级」前缀并用分隔线断开。 */}
      <div className="px-6 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-on-surface-variant">状态</span>
          {statusTabs.map((tab) => (
            <button
              key={String(tab.key)}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-sm transition border',
                activeTab === tab.key
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high bg-transparent',
              ].join(' ')}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="h-5 w-px bg-outline-variant" aria-hidden />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-on-surface-variant">优先级</span>
          {priorityTabs.map((tab) => (
            <button
              key={`p-${String(tab.key)}`}
              type="button"
              className={[
                'rounded-full px-3 py-1 text-sm transition border',
                activePriority === tab.key
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high bg-transparent',
              ].join(' ')}
              onClick={() => setActivePriority(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {(dueDateFrom || dueDateTo) && (
          <div className="flex items-center gap-2 bg-amber-100 text-amber-900 rounded-full px-3 py-1 text-sm">
            <span className="material-symbols-outlined text-base">calendar_today</span>
            <span>
              {dueDateFrom || '...'} ~ {dueDateTo || '...'}
            </span>
            <button type="button" className="material-symbols-outlined text-base" onClick={clearDateFilter}>
              close
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">需要跟进</span>
          <Switch size="small" checked={needsFollowUp} onChange={setNeedsFollowUp} />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Spin size="large" />
            <span className="text-sm text-on-surface-variant">加载中...</span>
          </div>
        ) : tasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onClick={handleTaskClick}
                onComplete={openComplete}
                onEdit={handleEdit}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="material-symbols-outlined text-on-surface-variant text-5xl">task_alt</span>
            <p className="text-sm text-on-surface-variant m-0">
              {searchQuery
                ? '没有找到匹配的任务，试试其他关键词'
                : '暂无任务，点击右上角创建你的第一个任务'}
            </p>
            {!searchQuery && (
              <button
                type="button"
                className="bg-primary text-on-primary rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-medium hover:opacity-90 mt-2"
                onClick={handleCreate}
              >
                <span className="material-symbols-outlined text-xl">add</span>
                新建任务
              </button>
            )}
          </div>
        )}
      </div>

      {pagination.total > pagination.page_size && (
        <div className="px-6 py-3 border-t border-surface-variant flex-shrink-0 flex items-center justify-center">
          <Pagination
            current={pagination.page}
            pageSize={pagination.page_size}
            total={pagination.total}
            onChange={(page) => applyFilters(page)}
            showSizeChanger={false}
            size="small"
          />
        </div>
      )}

      {/* Quick detail modal */}
      <Modal
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        title={detailTask?.title || '任务详情'}
        footer={
          detailTask
            ? [
                <button
                  key="edit"
                  type="button"
                  className="ant-btn ant-btn-default"
                  onClick={() => handleEdit(detailTask)}
                >
                  编辑
                </button>,
                detailTask.status !== 2 ? (
                  <button
                    key="complete"
                    type="button"
                    className="ant-btn ant-btn-primary"
                    onClick={() => openComplete(detailTask)}
                  >
                    标记完成
                  </button>
                ) : (
                  <button
                    key="uncomplete"
                    type="button"
                    className="ant-btn ant-btn-default"
                    onClick={() => void handleDetailUncomplete(detailTask)}
                  >
                    恢复未完成
                  </button>
                ),
                <button
                  key="delete"
                  type="button"
                  className="ant-btn ant-btn-dangerous"
                  onClick={() => handleDetailDelete(detailTask)}
                >
                  删除
                </button>,
              ]
            : null
        }
        width={560}
      >
        {detailLoading || !detailTask ? (
          <div className="py-10 flex justify-center">
            <Spin />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">{detailTask.status_label}</span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                优先级：{detailTask.priority_label}
              </span>
              {detailTask.due_date && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">截止：{detailTask.due_date}</span>
              )}
            </div>
            <p className="text-sm text-gray-600 whitespace-pre-wrap m-0">
              {detailTask.description || '暂无描述'}
            </p>
            <button
              type="button"
              className="text-primary text-sm hover:underline bg-transparent border-0 cursor-pointer p-0"
              onClick={() => handleEdit(detailTask)}
            >
              打开完整详情页 →
            </button>
          </div>
        )}
      </Modal>

      <TaskCompleteDialog
        open={completeOpen}
        taskTitle={completingTitle}
        onClose={() => setCompleteOpen(false)}
        onSubmit={handleCompleteSubmit}
        loading={completeLoading}
      />
    </div>
  )
}
