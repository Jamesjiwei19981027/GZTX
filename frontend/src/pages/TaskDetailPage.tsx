import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Spin, message, Modal } from 'antd'
import dayjs from 'dayjs'
import { useTaskStore } from '@/stores/task'
import TaskForm from '@/components/tasks/TaskForm'
import TaskCompleteDialog from '@/components/tasks/TaskCompleteDialog'
import type { CreateTaskRequest, TaskCompleteRequest, UpdateTaskRequest } from '@/types'
import { getErrorMessage } from '@/api/request'

const statusLabelMap: Record<number, string> = {
  0: '待办',
  1: '进行中',
  2: '已完成',
}

const priorityLabelMap: Record<number, string> = {
  0: '低',
  1: '中',
  2: '高',
}

const priorityBorder: Record<number, string> = {
  2: 'border-l-red-500',
  1: 'border-l-amber-500',
  0: 'border-l-blue-500',
}

export default function TaskDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const isCreateMode = location.pathname.endsWith('/new') || location.pathname === '/tasks/new'
  const taskId = params.id ? Number(params.id) : null

  const task = useTaskStore((s) => s.currentTask)
  const loading = useTaskStore((s) => s.loading)
  const fetchTaskDetail = useTaskStore((s) => s.fetchTaskDetail)
  const addTask = useTaskStore((s) => s.addTask)
  const editTask = useTaskStore((s) => s.editTask)
  const markComplete = useTaskStore((s) => s.markComplete)
  const markUncomplete = useTaskStore((s) => s.markUncomplete)
  const removeTask = useTaskStore((s) => s.removeTask)
  const clearCurrentTask = useTaskStore((s) => s.clearCurrentTask)

  const [isEditing, setIsEditing] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (taskId && !isCreateMode) {
      void fetchTaskDetail(taskId).catch((err) => {
        message.error(getErrorMessage(err, '加载任务失败'))
      })
    }
    return () => {
      clearCurrentTask()
    }
  }, [taskId, isCreateMode, fetchTaskDetail, clearCurrentTask])

  const statusLabel = useMemo(() => {
    if (!task) return '待办'
    return task.status_label ?? statusLabelMap[task.status] ?? '待办'
  }, [task])

  function handleBack() {
    navigate('/tasks')
  }

  async function handleCreateTask(data: CreateTaskRequest) {
    setSubmitting(true)
    try {
      await addTask(data)
      message.success('任务已创建')
      navigate('/tasks')
    } catch (err) {
      message.error(getErrorMessage(err, '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveEdit(data: CreateTaskRequest) {
    if (!taskId) return
    setSubmitting(true)
    try {
      await editTask(taskId, data as UpdateTaskRequest)
      await fetchTaskDetail(taskId)
      setIsEditing(false)
      message.success('任务已更新')
    } catch (err) {
      message.error(getErrorMessage(err, '更新失败'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleComplete(data: TaskCompleteRequest) {
    if (!taskId) return
    setSubmitting(true)
    try {
      await markComplete(taskId, data)
      setShowComplete(false)
      await fetchTaskDetail(taskId)
      if (data.needs_follow_up) {
        message.success('已标记为跟进任务，将在指定时间提醒您继续跟进')
      } else {
        message.success('任务已完成')
      }
    } catch (err) {
      message.error(getErrorMessage(err, '操作失败'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUncomplete() {
    if (!taskId) return
    try {
      await markUncomplete(taskId)
      await fetchTaskDetail(taskId)
      message.success('已恢复为未完成')
    } catch (err) {
      message.error(getErrorMessage(err, '操作失败'))
    }
  }

  function handleDelete() {
    if (!taskId) return
    Modal.confirm({
      title: '删除确认',
      content: '确定要删除这个任务吗？此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeTask(taskId)
          message.success('任务已删除')
          navigate('/tasks')
        } catch (err) {
          message.error(getErrorMessage(err, '删除失败'))
        }
      },
    })
  }

  function formatDate(date?: string) {
    if (!date) return '未设置'
    return dayjs(date).format('YYYY-MM-DD HH:mm')
  }

  return (
    <div className="flex flex-col h-full bg-surface-container-low">
      <div className="h-16 bg-surface border-b border-surface-variant flex items-center px-6 flex-shrink-0 gap-3">
        <button
          type="button"
          className="rounded-full p-2 hover:bg-surface-container transition flex items-center justify-center bg-transparent border-0 cursor-pointer"
          onClick={handleBack}
          aria-label="返回"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-2xl">arrow_back</span>
        </button>
        <h2 className="text-xl font-semibold text-on-surface flex-1 m-0 truncate">
          {isCreateMode ? '新建任务' : task?.title || '任务详情'}
        </h2>
        {!isCreateMode && task && !isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              className="rounded-full p-2 hover:bg-surface-container transition bg-transparent border-0 cursor-pointer"
              title="编辑"
              onClick={() => setIsEditing(true)}
            >
              <span className="material-symbols-outlined text-on-surface-variant text-2xl">edit</span>
            </button>
            {task.status !== 2 && (
              <button
                type="button"
                className="rounded-full p-2 hover:bg-surface-container transition bg-transparent border-0 cursor-pointer"
                title="标记完成"
                onClick={() => setShowComplete(true)}
              >
                <span className="material-symbols-outlined text-green-600 text-2xl">check_circle</span>
              </button>
            )}
            <button
              type="button"
              className="rounded-full p-2 hover:bg-red-50 transition bg-transparent border-0 cursor-pointer"
              title="删除"
              onClick={handleDelete}
            >
              <span className="material-symbols-outlined text-red-500 text-2xl">delete</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {loading && !isCreateMode && !task ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <Spin size="large" />
              <span className="text-sm text-on-surface-variant">加载中...</span>
            </div>
          ) : isCreateMode ? (
            <TaskForm onSubmit={handleCreateTask} onCancel={handleBack} submitting={submitting} />
          ) : task ? (
            isEditing ? (
              <TaskForm
                task={task}
                onSubmit={handleSaveEdit}
                onCancel={() => setIsEditing(false)}
                submitting={submitting}
              />
            ) : (
              <div>
                <div
                  className={[
                    'bg-white rounded-xl p-8 shadow-sm border border-surface-variant border-l-4',
                    priorityBorder[task.priority] ?? priorityBorder[0],
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700">
                      {statusLabel}
                    </span>
                    <div className="flex items-center gap-1 text-on-surface-variant text-sm">
                      <span className="material-symbols-outlined text-base">schedule</span>
                      {formatDate(task.created_at)}
                    </div>
                  </div>

                  <h1
                    className={[
                      'text-2xl font-bold text-on-surface mt-4 mb-0 leading-snug',
                      task.status === 2 ? 'line-through opacity-60' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {task.title}
                  </h1>

                  <p className="text-base text-on-surface-variant mt-4 mb-0 whitespace-pre-wrap leading-relaxed">
                    {task.description || '暂无描述'}
                  </p>

                  <div
                    className={[
                      'mt-6 rounded-lg px-4 py-2 inline-flex items-center gap-2',
                      task.is_overdue && task.status !== 2 ? 'bg-red-50' : 'bg-gray-100',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'material-symbols-outlined text-2xl',
                        task.is_overdue && task.status !== 2 ? 'text-red-500' : 'text-gray-500',
                      ].join(' ')}
                    >
                      {task.is_overdue && task.status !== 2 ? 'warning' : 'event'}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500">截止日期</span>
                      <span
                        className={[
                          'text-lg font-bold leading-tight',
                          task.is_overdue && task.status !== 2 ? 'text-red-500' : 'text-on-surface',
                        ].join(' ')}
                      >
                        {formatDate(task.due_date)}
                        {task.is_overdue && task.status !== 2 && (
                          <span className="text-sm text-red-500 font-normal ml-1">(已逾期)</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 mt-4 flex-wrap text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">优先级</span>
                      <span className="text-on-surface font-medium">
                        {priorityLabelMap[task.priority] ?? task.priority_label}
                      </span>
                    </div>
                    {task.category && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">分类</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: task.category.color }}
                          />
                          {task.category.name}
                        </span>
                      </div>
                    )}
                  </div>

                  {task.tags && task.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {task.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-xs inline-flex items-center gap-1"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {task.needs_follow_up && (
                    <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
                      <span className="material-symbols-outlined text-amber-700 text-xl">flag</span>
                      <div>
                        <span className="font-medium text-amber-800 block">需要跟进</span>
                        {task.follow_up_reason && (
                          <p className="text-sm text-gray-600 m-0 mt-1">{task.follow_up_reason}</p>
                        )}
                        {task.follow_up_remind_at && (
                          <p className="text-sm text-gray-600 m-0 mt-1">
                            提醒时间：{task.follow_up_remind_at}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between pt-6 border-t border-surface-variant">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container transition bg-transparent border-0 cursor-pointer"
                    onClick={() => setIsEditing(true)}
                  >
                    <span className="material-symbols-outlined text-xl">edit</span>
                    编辑
                  </button>
                  <div className="flex items-center gap-2">
                    {task.status !== 2 ? (
                      <button
                        type="button"
                        className="bg-primary text-on-primary rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-medium hover:opacity-90 border-0 cursor-pointer"
                        onClick={() => setShowComplete(true)}
                      >
                        <span className="material-symbols-outlined text-xl">check_circle</span>
                        标记完成
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="bg-gray-100 text-gray-700 rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-medium hover:bg-gray-200 border-0 cursor-pointer"
                        onClick={() => void handleUncomplete()}
                      >
                        <span className="material-symbols-outlined text-xl">undo</span>
                        恢复未完成
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-red-500 hover:bg-red-50 rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-medium bg-transparent border-0 cursor-pointer"
                      onClick={handleDelete}
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="material-symbols-outlined text-on-surface-variant text-5xl">search_off</span>
              <p className="text-sm text-on-surface-variant m-0">未找到该任务</p>
              <button
                type="button"
                className="bg-primary text-on-primary rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 mt-2 border-0 cursor-pointer"
                onClick={handleBack}
              >
                返回任务列表
              </button>
            </div>
          )}
        </div>
      </div>

      <TaskCompleteDialog
        open={showComplete}
        taskTitle={task?.title || ''}
        onClose={() => setShowComplete(false)}
        onSubmit={handleComplete}
        loading={submitting}
      />
    </div>
  )
}
