import { useMemo } from 'react'
import { Dropdown, Modal } from 'antd'
import { message } from '@/utils/antdMessage'
import type { MenuProps } from 'antd'
import dayjs from 'dayjs'
import type { Task } from '@/types'
import { useTaskStore } from '@/stores/task'
import { getErrorMessage } from '@/api/request'

type TaskItemProps = {
  task: Task
  onClick: (task: Task) => void
  onComplete: (task: Task) => void
  onEdit?: (task: Task) => void
}

// 卡片顶部只为「高」保留一条彩条。原来三档各一条，配合右上角同样三档的
// 徽章，等于把同一条信息编码了两遍 —— 满屏彩条反而让真正紧急的那几张不突出。
const priorityBorder: Record<number, string> = {
  2: 'border-t-red-500',
  1: 'border-t-transparent',
  0: 'border-t-transparent',
}

const priorityBadge: Record<number, string> = {
  2: 'bg-red-100 text-red-900',
  1: 'bg-amber-100 text-amber-900',
  0: 'bg-blue-100 text-blue-900',
}

const priorityLabelMap: Record<number, string> = { 0: '低', 1: '中', 2: '高' }

export default function TaskItem({ task, onClick, onComplete, onEdit }: TaskItemProps) {
  const markUncomplete = useTaskStore((s) => s.markUncomplete)
  const removeTask = useTaskStore((s) => s.removeTask)
  const isCompleted = task.status === 2
  const isOverdue = !!task.is_overdue && !isCompleted
  const needsFollowUp = task.needs_follow_up === true
  const priorityLabel = task.priority_label ?? priorityLabelMap[task.priority] ?? '中'

  const menuItems: MenuProps['items'] = useMemo(() => {
    const items: MenuProps['items'] = []
    if (isCompleted) {
      items.push({ key: 'restore', label: '恢复', icon: <span className="material-symbols-outlined text-base">undo</span> })
    }
    items.push({ key: 'edit', label: '修改', icon: <span className="material-symbols-outlined text-base">edit</span> })
    if (!isCompleted) {
      items.push({
        key: 'complete',
        label: '完成',
        icon: <span className="material-symbols-outlined text-base">check_circle</span>,
      })
    }
    items.push({
      key: 'pending',
      label: '继续待办',
      icon: <span className="material-symbols-outlined text-base">radio_button_unchecked</span>,
    })
    items.push({ type: 'divider' })
    items.push({
      key: 'delete',
      label: '删除',
      danger: true,
      icon: <span className="material-symbols-outlined text-base">delete</span>,
    })
    return items
  }, [isCompleted])

  async function handleMenuClick({ key }: { key: string }) {
    if (key === 'edit') {
      onEdit?.(task)
      return
    }
    if (key === 'complete') {
      onComplete(task)
      return
    }
    if (key === 'restore' || key === 'pending') {
      try {
        await markUncomplete(task.id)
        message.success(key === 'restore' ? '已恢复为未完成' : '已设为继续待办')
      } catch (err) {
        message.error(getErrorMessage(err, '操作失败'))
      }
      return
    }
    if (key === 'delete') {
      Modal.confirm({
        title: '删除确认',
        content: '确定要删除这个任务吗？',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            await removeTask(task.id)
            message.success('任务已删除')
          } catch (err) {
            message.error(getErrorMessage(err, '删除失败'))
          }
        },
      })
    }
  }

  return (
    <div
      className={[
        'group relative flex flex-col rounded-2xl bg-white border border-gray-200 border-t-[4px] p-4 cursor-pointer',
        'transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 h-full',
        priorityBorder[task.priority] ?? priorityBorder[0],
        // 已完成用底色下沉表示，不再整卡降透明度：
        // 原来整卡 opacity-60 叠上标题自己的 opacity-50，实际约 0.3，标题几乎读不出来
        isCompleted ? 'bg-surface-container-low' : '',
        isOverdue ? 'bg-red-50/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onClick(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(task)
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className={[
            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition',
            isCompleted ? 'bg-green-600 border-green-600' : 'border-gray-300 hover:border-blue-500',
          ].join(' ')}
          onClick={(e) => {
            e.stopPropagation()
            if (!isCompleted) onComplete(task)
          }}
          aria-label={isCompleted ? '已完成' : '标记完成'}
        >
          {isCompleted && (
            <span className="material-symbols-outlined text-white text-sm leading-none">check</span>
          )}
        </button>

        <div className="flex items-center gap-2">
          <span
            className={[
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold',
              priorityBadge[task.priority] ?? priorityBadge[0],
            ].join(' ')}
          >
            {priorityLabel}
          </span>
          <Dropdown
            menu={{ items: menuItems, onClick: (info) => void handleMenuClick(info) }}
            trigger={['click']}
          >
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="material-symbols-outlined text-lg">more_vert</span>
            </button>
          </Dropdown>
        </div>
      </div>

      <h3
        className={[
          'text-base font-semibold text-gray-900 leading-snug mb-1.5 line-clamp-2',
          // 删除线已足够表达"已完成"，不必再压低透明度到读不清
          isCompleted ? 'line-through text-gray-500' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {task.title}
      </h3>

      {task.description ? (
        <p className="text-sm text-gray-500 leading-relaxed mb-3 line-clamp-2">{task.description}</p>
      ) : (
        <div className="flex-grow" />
      )}

      <div className="flex items-center flex-wrap gap-1.5 mb-3">
        {needsFollowUp && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-900">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            跟进
          </span>
        )}
        {task.category && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: task.category.color }}
            />
            {task.category.name}
          </span>
        )}
        {(task.tags ?? []).slice(0, 3).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-400">
          {task.due_date ? dayjs(task.due_date).format('MM/DD HH:mm') : '无截止日期'}
        </div>
        <span className="text-xs text-gray-400">{task.status_label}</span>
      </div>
    </div>
  )
}
