import React, { useEffect, useState, useMemo, useRef } from 'react';
import { TaskScheduleHistory } from '../../../components/TaskScheduleHistory';
import {
  createTask,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  batchCompleteTasks,
  batchRescheduleTasks,
  batchDeleteTasks,
  extractTaskFromChat,
  listTaskAttachments,
  uploadTaskAttachment,
  listCategories,
  listTags,
  type BackendTask,
  type BackendChecklistItem,
  type TaskExtractDraft,
  type BackendAttachment,
  type BackendCategory,
  type BackendTag,
} from '../../../api/backend';
import { ApiError } from '../../../api/client';
import {
  mapTask,
  uiPriorityToApi,
  uiStatusToApi,
  apiPriorityToUi,
} from '../../../api/mappers';
import { normalizeTaskScope } from '../../../utils/taskScope';
import { toApiDueDate, fromApiDueDate } from '../../../utils/datetime';
import {
  Task,
  Project,
  TeamMember,
  Priority,
  Status,
  Category,
  Language,
} from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileField, MobileInput, MobileTextarea } from '../../ui/MobileField';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileSheet } from '../../ui/MobileSheet';
import { MobileConfirm } from '../../ui/MobileConfirm';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';

// -------------------------------------------------------------
// 14 任务详情 Sheet (只读责任链关联展示与前往节点)
// -------------------------------------------------------------
export interface MobileTaskDetailSheetProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onToggleCompletion?: (task: Task) => Promise<void>;
  onNavigateToNode?: (nodeId: string) => void;
  lang?: Language;
}

export const MobileTaskDetailSheet: React.FC<MobileTaskDetailSheetProps> = ({
  task,
  isOpen,
  onClose,
  onEditTask,
  onDeleteTask,
  onToggleCompletion,
  onNavigateToNode,
  lang = 'zh',
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!task) return null;

  const isLinkedToAxis = Boolean(task.linkedNodeId);
  const isDone = task.status === 'Done';

  const handleDelete = async () => {
    setBusy(true);
    setConfirmDelete(false);
    try {
      if (onDeleteTask) await onDeleteTask(task.id);
      onClose();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileSheet
      isOpen={isOpen}
      onClose={onClose}
      title="任务详情"
      snapPoints={['half', 'full']}
      defaultSnap="half"
    >
      <div className="flex flex-col gap-4 pb-6">
        {/* 标题与状态 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2
              className={`text-lg font-bold leading-snug break-words ${
                isDone ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'
              }`}
            >
              {task.title}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                  task.status === 'Done'
                    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : task.status === 'In Progress'
                      ? 'bg-blue-50 text-[#0058BE] dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {task.status === 'Done' ? '已完成' : task.status === 'In Progress' ? '进行中' : '待办'}
              </span>

              <span
                className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                  task.priority === 'High'
                    ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400'
                    : task.priority === 'Medium'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                }`}
              >
                {task.priority === 'High' ? '高优先级' : task.priority === 'Medium' ? '中优先级' : '低优先级'}
              </span>
            </div>
          </div>

          {/* 普通任务支持轻触完成，责任关联只读任务禁止直接勾选 */}
          {!isLinkedToAxis && onToggleCompletion && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggleCompletion(task)}
              className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center shrink-0 border ${
                isDone
                  ? 'bg-green-50 border-green-200 text-green-600 dark:bg-green-950/40 dark:border-green-800'
                  : 'bg-white border-slate-300 dark:bg-slate-800 dark:border-slate-700 text-slate-400'
              }`}
              aria-label={isDone ? '标为未完成' : '完成任务'}
            >
              <AppIcon name={isDone ? 'check-circle' : 'check'} size={20} />
            </button>
          )}
        </div>

        {/* 关键设计：人轴责任关联只读任务提示 */}
        {isLinkedToAxis && (
          <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 text-purple-900 dark:text-purple-300 text-xs flex flex-col gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <AppIcon name="axis" size={16} className="text-purple-600" />
              <span>人轴责任链关联事项 (只读)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-purple-800 dark:text-purple-300/90">
              此任务由人轴事项节点同步生成，其实施状态与交付证据由责任链统一把控，不可在待办中单独直接勾结完成。
            </p>
            {onNavigateToNode && task.linkedNodeId && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToNode(task.linkedNodeId!);
                  onClose();
                }}
                className="min-h-[38px] px-3 rounded-lg bg-purple-600 text-white font-medium text-xs flex items-center justify-center gap-1 self-start mt-1 active:opacity-90"
              >
                <span>前往责任节点 #{task.linkedNodeId}</span>
                <AppIcon name="arrow-right" size={14} />
              </button>
            )}
          </div>
        )}

        {/* 描述内容 */}
        {task.description && (
          <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            {task.description}
          </div>
        )}

        {/* 属性列表 */}
        <MobileListGroup title="事项属性">
          <MobileListItem
            leading={<AppIcon name="calendar" size={18} className="text-slate-400" />}
            title="截止时间"
            trailing={
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {task.dueDate ? `${task.dueDate} ${task.dueTime || ''}` : '未指定'}
              </span>
            }
            showChevron={false}
          />
          {task.isRecurring && (
            <MobileListItem
              leading={<AppIcon name="refresh" size={18} className="text-slate-400" />}
              title="重复规则"
              trailing={
                <span className="text-xs text-[#0058BE]">
                  {task.recurrenceRule || '周期重复'}
                </span>
              }
              showChevron={false}
            />
          )}
          <MobileListItem
            leading={<AppIcon name="team" size={18} className="text-slate-400" />}
            title="执行人员"
            trailing={
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {task.assignees && task.assignees.length > 0
                  ? task.assignees.map((a) => a.name).join('、')
                  : task.assignee?.name || '未指派'}
              </span>
            }
            showChevron={false}
          />
        </MobileListGroup>

        {/* 子任务清单 */}
        {task.subtasks && task.subtasks.length > 0 && (
          <MobileListGroup title={`清单项 (${task.subtasks.length})`}>
            {task.subtasks.map((st) => (
              <MobileListItem
                key={st.id}
                leading={
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                      st.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {st.completed && <AppIcon name="check" size={12} />}
                  </div>
                }
                title={
                  <span className={st.completed ? 'line-through text-slate-400' : ''}>
                    {st.title}
                  </span>
                }
                showChevron={false}
              />
            ))}
          </MobileListGroup>
        )}

        {/* 底部操作栏 */}
        <div className="pt-2 flex gap-3">
          {onEditTask && !isLinkedToAxis && (
            <button
              type="button"
              onClick={() => {
                onEditTask(task);
                onClose();
              }}
              className="flex-1 min-h-[48px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center gap-1.5 shadow-xs active:opacity-90"
            >
              <AppIcon name="edit" size={16} />
              <span>编辑任务</span>
            </button>
          )}

          {onDeleteTask && !isLinkedToAxis && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[48px] px-4 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-sm font-semibold flex items-center justify-center gap-1.5 active:bg-red-50"
            >
              <AppIcon name="trash" size={16} />
              <span>删除</span>
            </button>
          )}
        </div>
      </div>

      <MobileConfirm
        isOpen={confirmDelete}
        title="放入回收站？"
        message="任务将被移至回收站，保留 30 天后自动清除。期间可随时恢复。"
        confirmText="移至回收站"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </MobileSheet>
  );
};

// -------------------------------------------------------------
// 15, 82, 83 新建 / 编辑任务 Sheet (使用 normalizeTaskScope 范围规范)
// -------------------------------------------------------------
export interface MobileTaskEditScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveTask: (savedTask: Task) => Promise<void>;
  editingTask?: Task | null;
  projectId: string; // 'all' 或数字字符串
  projectName?: string;
  members?: TeamMember[];
  categories?: { id: number; name: string }[];
  tags?: { id: number; name: string }[];
  defaultDate?: string;
  defaultStatus?: Status;
  /** 个人设置里的默认优先级（ui.task_default_priority） */
  defaultPriority?: Priority;
  lang?: Language;
}

export const MobileTaskEditScreen: React.FC<MobileTaskEditScreenProps> = ({
  isOpen,
  onClose,
  onRequestClose,
  onDirtyChange,
  onSaveTask,
  editingTask,
  projectId,
  projectName = '',
  members = [],
  categories = [],
  tags = [],
  defaultDate,
  defaultStatus,
  defaultPriority = 'Medium',
  lang = 'zh',
}) => {
  const isEditing = Boolean(editingTask);

  // 严格遵守规范：使用 normalizeTaskScope 解析归属
  const taskScope = useMemo(() => {
    try {
      return normalizeTaskScope(projectId);
    } catch {
      return { project_id: null, origin: 'personal' as const };
    }
  }, [projectId]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('To Do');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>();
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [assigneeUserIds, setAssigneeUserIds] = useState<number[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState('daily');
  const [subtasks, setSubtasks] = useState<BackendChecklistItem[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  // 初始化或回填表单
  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description || '');
      setStatus(editingTask.status);
      setPriority(editingTask.priority);
      setDueDate(editingTask.dueDate || '');
      setDueTime(editingTask.dueTime || '');
      setSelectedCategoryId(editingTask.categoryId);
      setSelectedTagIds(editingTask.tagIds || []);
      setAssigneeUserIds(editingTask.assignees?.map((a) => Number(a.id)) || []);
      setIsRecurring(Boolean(editingTask.isRecurring));
      setRecurrenceRule(editingTask.recurrenceRule || 'daily');
      setSubtasks(
        editingTask.subtasks?.map((st) => ({
          id: st.id,
          title: st.title,
          completed: st.completed,
        })) || [],
      );
    } else {
      setTitle('');
      setDescription('');
      setStatus(defaultStatus || 'To Do');
      setPriority(defaultPriority);
      setDueDate(defaultDate || '');
      setDueTime('');
      setSelectedCategoryId(undefined);
      setSelectedTagIds([]);
      setAssigneeUserIds([]);
      setIsRecurring(false);
      setRecurrenceRule('daily');
      setSubtasks([]);
    }
    setError(null);
  }, [editingTask, defaultDate, defaultStatus, defaultPriority, isOpen]);

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    onDirtyChange?.(true);
    setSubtasks((prev) => [
      ...prev,
      { id: String(Date.now()), title: newSubtaskTitle.trim(), completed: false },
    ]);
    setNewSubtaskTitle('');
  };

  const handleRemoveSubtask = (id: string) => {
    onDirtyChange?.(true);
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('请输入任务标题');
      return;
    }
    setBusy(true);
    setError(null);

    const apiDue = toApiDueDate(dueDate, dueTime);

    try {
      if (isEditing && editingTask) {
        const updated = await updateTask(Number(editingTask.id), {
          title: title.trim(),
          description: description.trim(),
          priority: uiPriorityToApi(priority),
          status: uiStatusToApi(status),
          due_date: apiDue || null,
          category_id: selectedCategoryId || null,
          tag_ids: selectedTagIds,
          assignee_user_ids: assigneeUserIds,
          checklist: subtasks,
        });
        const mapped = mapTask(updated, projectId);
        await onSaveTask(mapped);
        onClose();
      } else {
        const created = await createTask({
          title: title.trim(),
          description: description.trim(),
          priority: uiPriorityToApi(priority),
          status: uiStatusToApi(status),
          due_date: apiDue,
          project_id: taskScope.project_id,
          origin: taskScope.origin,
          category_id: selectedCategoryId,
          tag_ids: selectedTagIds,
          assignee_user_ids: assigneeUserIds,
          is_recurring: isRecurring,
          recurrence_rule: isRecurring ? recurrenceRule : null,
          checklist: subtasks,
        });
        const mapped = mapTask(created, projectId);
        await onSaveTask(mapped);
        onClose();
      }
    } catch (err) {
      // 关键规范：保存失败必须保留用户所有输入，禁止清空
      setError(err instanceof ApiError ? err.message : '保存任务失败，请检查网络或输入');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileSheet
      isOpen={isOpen}
      onClose={onRequestClose || onClose}
      title={isEditing ? '编辑任务' : '新建任务'}
      snapPoints={['full']}
      defaultSnap="full"
    >
      <form onSubmit={handleSubmit} onChangeCapture={() => onDirtyChange?.(true)} className="flex flex-col gap-4 pb-12">
        {/* 所属范围明确指示 */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-[#0058BE] flex items-center gap-2">
          <AppIcon name="work" size={16} />
          <span>
            {taskScope.origin === 'personal'
              ? '任务所属范围：个人私有待办（跨项目总览可见）'
              : `任务所属范围：项目【${projectName || `项目 #${taskScope.project_id}`}】`}
          </span>
        </div>

        {/* 标题 */}
        <MobileField label="任务标题" required>
          <MobileInput
            type="text"
            placeholder="例如：准备项目月度交付汇报材料"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus={!isEditing}
          />
        </MobileField>

        {/* 描述 */}
        <MobileField label="任务详细描述">
          <MobileTextarea
            placeholder="输入任务背景、行动项或期望结果…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </MobileField>

        {/* 优先级与状态 */}
        <div className="grid grid-cols-2 gap-3">
          <MobileField label="优先级">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full min-h-[48px] px-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
            >
              <option value="Low">低优先级</option>
              <option value="Medium">中优先级</option>
              <option value="High">高优先级</option>
            </select>
          </MobileField>

          <MobileField label="推进状态">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="w-full min-h-[48px] px-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
            >
              <option value="To Do">待办</option>
              <option value="In Progress">进行中</option>
              <option value="Done">已完成</option>
            </select>
          </MobileField>
        </div>

        {/* 82 日期与重复规则 */}
        <MobileListGroup title="截止时间与周期重复">
          <div className="p-3.5 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <MobileField label="截止日期">
                <input
                  type="date"
                  aria-label="截止日期"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </MobileField>
              <MobileField label="截止时刻 (可选)">
                <input
                  type="time"
                  aria-label="截止时刻"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </MobileField>
            </div>

            {editingTask && <TaskScheduleHistory taskId={editingTask.id} revision={`${editingTask.dueDate}:${editingTask.dueTime}`} />}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                周期性重复任务 (RRULE)
              </span>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-5 h-5 rounded accent-[#0058BE]"
              />
            </div>

            {isRecurring && (
              <select
                value={recurrenceRule}
                onChange={(e) => setRecurrenceRule(e.target.value)}
                className="w-full min-h-[44px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
              >
                <option value="daily">每天重复</option>
                <option value="weekdays">每个工作日</option>
                <option value="weekly">每周重复</option>
                <option value="monthly">每月重复 (Monthly)</option>
              </select>
            )}
          </div>
        </MobileListGroup>

        {/* 83 成员分配与清空 */}
        <MobileListGroup
          title="执行人员"
          footer="多选成员限定在当前项目范围内，支持随时清空指派。"
        >
          <div className="p-3.5 space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
              <span>选择执行人 (已选 {assigneeUserIds.length} 人)</span>
              {assigneeUserIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => { onDirtyChange?.(true); setAssigneeUserIds([]); }}
                  className="text-red-500 hover:underline"
                >
                  清空已选执行人
                </button>
              )}
            </div>

            {members.length === 0 ? (
              <div className="text-xs text-slate-400 py-1">当前项目无可选成员</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const uid = Number(m.id);
                  const isSelected = assigneeUserIds.includes(uid);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onDirtyChange?.(true);
                        setAssigneeUserIds((prev) =>
                          isSelected ? prev.filter((id) => id !== uid) : [...prev, uid],
                        );
                      }}
                      className={`min-h-[36px] px-3 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-[#0058BE] text-[#0058BE] dark:bg-blue-950 dark:border-blue-500'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{m.name}</span>
                      {isSelected && <AppIcon name="check" size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </MobileListGroup>

        {/* 清单 / 子任务 */}
        <MobileListGroup title="子任务清单">
          <div className="p-3.5 space-y-2.5">
            {subtasks.map((st) => (
              <div key={st.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex-1 truncate">{st.title}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSubtask(st.id)}
                  className="p-1 text-slate-400 hover:text-red-500"
                  aria-label="删除清单项"
                >
                  <AppIcon name="close" size={14} />
                </button>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="添加清单条目…"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                className="flex-1 min-h-[40px] px-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="min-h-[40px] px-3 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium"
              >
                添加
              </button>
            </div>
          </div>
        </MobileListGroup>

        {/* 保存失败提示：紧贴保存按钮，长表单底部也能看到 */}
        {error && (
          <div
            ref={errorRef}
            role="alert"
            data-testid="task-edit-error"
            className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 mt-4"
          >
            <AppIcon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-4"
        >
          {busy ? '正在保存…' : isEditing ? '确认更新任务' : '创建任务'}
        </button>
      </form>
    </MobileSheet>
  );
};

// -------------------------------------------------------------
// 16 快速添加 Sheet (使用 normalizeTaskScope)
// -------------------------------------------------------------
export const MobileQuickAddSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  projectId: string;
  projectName?: string;
  lang?: Language;
}> = ({ isOpen, onClose, onCreated, projectId, projectName = '', lang = 'zh' }) => {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 严格遵守规范：使用 normalizeTaskScope 范围规范化，严禁替换为首个项目
  const scope = useMemo(() => {
    try {
      return normalizeTaskScope(projectId);
    } catch {
      return { project_id: null, origin: 'personal' as const };
    }
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTask({
        title: title.trim(),
        project_id: scope.project_id,
        origin: scope.origin,
      });
      const mapped = mapTask(created, projectId);
      onCreated(mapped);
      setTitle('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileSheet
      isOpen={isOpen}
      onClose={onClose}
      title="快速添加任务"
      snapPoints={['half']}
      defaultSnap="half"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 pb-6">
        <div className="text-xs text-[#0058BE]">
          {scope.origin === 'personal'
            ? '归属：个人待办事项'
            : `归属：${projectName || `项目 #${scope.project_id}`}`}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs">
            {error}
          </div>
        )}

        <MobileInput
          placeholder="输入待办事项，回车或点击创建…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          clearable
          onClear={() => setTitle('')}
          leading={<AppIcon name="plus" size={18} />}
        />

        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-sm active:opacity-90 disabled:opacity-40"
        >
          {busy ? '正在创建…' : '立即添加'}
        </button>
      </form>
    </MobileSheet>
  );
};

// -------------------------------------------------------------
// 17 从聊天提取任务 Sheet (模型提取与草稿确认)
// -------------------------------------------------------------
export const MobileTaskExtractChatSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  projectId: string;
  companyId: number | null;
  lang?: Language;
}> = ({ isOpen, onClose, onCreated, projectId, companyId, lang = 'zh' }) => {
  const [chatText, setChatText] = useState('');
  const [draft, setDraft] = useState<TaskExtractDraft | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = useMemo(() => {
    try {
      return normalizeTaskScope(projectId);
    } catch {
      return { project_id: null, origin: 'personal' as const };
    }
  }, [projectId]);

  const handleExtract = async () => {
    if (!chatText.trim()) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await extractTaskFromChat({
        chat_text: chatText.trim(),
        company_id: companyId,
        project_id: scope.project_id,
      });
      setDraft(res.draft);
    } catch (err) {
      // 关键设计审查：模型不可用时必须保留原文，显示明确原因，不伪造成功
      setError(
        err instanceof ApiError
          ? `提取失败: ${err.message}`
          : '模型服务未配置或网络异常，已保留原始聊天文本',
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmCreate = async () => {
    if (!draft) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createTask({
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        status: draft.status,
        due_date: draft.due_date || undefined,
        project_id: scope.project_id,
        origin: scope.origin,
        source_channel: draft.source_channel,
        source_title: draft.source_title,
      });
      const mapped = mapTask(created, projectId);
      onCreated(mapped);
      setDraft(null);
      setChatText('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建提取任务失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <MobileSheet
      isOpen={isOpen}
      onClose={onClose}
      title="从聊天提取任务"
      snapPoints={['full']}
      defaultSnap="full"
    >
      <div className="flex flex-col gap-4 pb-12">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs flex items-center gap-2">
            <AppIcon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="text-xs text-slate-500">
          粘贴聊天消息或会议结论，AI 将解析任务标题、优先级与截止日期草稿。
        </div>

        <MobileTextarea
          placeholder="例如：「请张工在周五前将项目测试报告整理并同步到人轴上」"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          className="min-h-[120px]"
        />

        <button
          type="button"
          disabled={extracting || !chatText.trim()}
          onClick={handleExtract}
          className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
        >
          <AppIcon name="ai" size={18} />
          <span>{extracting ? '智能解析中…' : '开始智能提取任务'}</span>
        </button>

        {draft && (
          <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-900 space-y-3 mt-2">
            <div className="flex items-center gap-2 text-[#0058BE] text-xs font-semibold">
              <AppIcon name="check-circle" size={16} />
              <span>已生成任务草稿 (需确认后入库)</span>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {draft.title}
              </div>
              {draft.description && (
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {draft.description}
                </div>
              )}
              {draft.due_date && (
                <div className="text-xs text-amber-600">截止日期: {draft.due_date}</div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={creating}
                onClick={handleConfirmCreate}
                className="flex-1 min-h-[44px] rounded-xl bg-[#0058BE] text-white font-semibold text-xs active:opacity-90"
              >
                {creating ? '入库中…' : '确认创建任务'}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs"
              >
                放弃草稿
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileSheet>
  );
};

// -------------------------------------------------------------
// 18 项目看板 (提供“移动状态切换”触控替代拖拽)
// -------------------------------------------------------------
export const MobileKanbanScreen: React.FC<{
  tasks: Task[];
  members?: TeamMember[];
  onUpdateStatus: (taskId: string, newStatus: Status) => Promise<void>;
  onSelectTask: (task: Task) => void;
  onOpenNewTaskWithStatus?: (status: Status) => void;
  onBack?: () => void;
  showHeader?: boolean;
  lang?: Language;
}> = ({
  tasks,
  members = [],
  onUpdateStatus,
  onSelectTask,
  onOpenNewTaskWithStatus,
  onBack,
  showHeader = true,
  lang = 'zh',
}) => {
  const [activeColumn, setActiveColumn] = useState<Status>('To Do');
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  const columns: { status: Status; title: string; color: string }[] = [
    { status: 'To Do', title: '待办事项', color: 'border-slate-400 text-slate-700' },
    { status: 'In Progress', title: '进行中', color: 'border-blue-500 text-blue-600' },
    { status: 'Done', title: '已完成', color: 'border-green-500 text-green-600' },
  ];

  const columnTasks = useMemo(() => {
    return tasks.filter((t) => t.status === activeColumn);
  }, [tasks, activeColumn]);

  const handleMove = async (taskId: string, targetStatus: Status) => {
    setMovingTaskId(null);
    await onUpdateStatus(taskId, targetStatus);
  };

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      {showHeader && <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">项目看板</h1>
        <div className="w-10" />
      </header>}

      {/* 看板状态列切换 Tab */}
      <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex gap-1.5 shrink-0">
        {columns.map((col) => {
          const count = tasks.filter((t) => t.status === col.status).length;
          const isActive = activeColumn === col.status;
          return (
            <button
              key={col.status}
              type="button"
              onClick={() => setActiveColumn(col.status)}
              className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                isActive
                  ? 'bg-[#0058BE] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>{col.title}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 列卡片流 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {columnTasks.length === 0 ? (
          <MobileEmptyState
            title={`暂无「${columns.find((c) => c.status === activeColumn)?.title}」事项`}
            description="点击下方按钮可新建该状态的事项"
            actionLabel="在此状态新建"
            onAction={onOpenNewTaskWithStatus ? () => onOpenNewTaskWithStatus(activeColumn) : undefined}
          />
        ) : (
          columnTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2.5 active:bg-slate-50 dark:active:bg-slate-800 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                  {task.title}
                </h3>
                {task.priority === 'High' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium shrink-0">
                    高优
                  </span>
                )}
              </div>

              {task.description && (
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {task.description}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>{task.dueDate || '无截止日'}</span>

                {/* 关键规范：轻触替代拖拽移动状态按钮 */}
                <div
                  className="relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setMovingTaskId(movingTaskId === task.id ? null : task.id)
                    }
                    className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 active:bg-slate-100"
                  >
                    <span>移动状态</span>
                    <AppIcon name="chevron-down" size={14} />
                  </button>

                  {/* 弹出移动选择 */}
                  {movingTaskId === task.id && (
                    <div className="absolute right-0 bottom-full mb-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-1 z-20 flex flex-col gap-1">
                      {columns
                        .filter((c) => c.status !== task.status)
                        .map((c) => (
                          <button
                            key={c.status}
                            type="button"
                            onClick={() => handleMove(task.id, c.status)}
                            className="min-h-[34px] px-2 text-left text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                          >
                            移至 {c.title}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 19 & 85 日历与日程 (月日历与 85 周日历切换)
// -------------------------------------------------------------
export const MobileCalendarScreen: React.FC<{
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onOpenNewTaskWithDate?: (date: string) => void;
  onBack?: () => void;
  lang?: Language;
}> = ({ tasks, onSelectTask, onOpenNewTaskWithDate, onBack, lang = 'zh' }) => {
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const selectedDateTasks = useMemo(() => {
    return tasks.filter((t) => t.dueDate === selectedDate);
  }, [tasks, selectedDate]);

  // 生成当前月 7x5 网格
  const currentMonthDays = useMemo(() => {
    const cur = new Date(selectedDate);
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];
    // 补齐月初空白
    for (let i = 0; i < firstDay; i++) {
      days.push({ dateStr: '', dayNum: 0, isCurrentMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr: dStr, dayNum: d, isCurrentMonth: true });
    }
    return days;
  }, [selectedDate]);

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">日程日历</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'month' ? 'week' : 'month')}
            className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
          >
            {viewMode === 'month' ? '周视图' : '月视图'}
          </button>
        </div>
      </header>

      {/* 日历网格区 */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
          <span>日</span>
          <span>一</span>
          <span>二</span>
          <span>三</span>
          <span>四</span>
          <span>五</span>
          <span>六</span>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {currentMonthDays.map((item, idx) => {
            if (!item.isCurrentMonth) {
              return <div key={idx} className="h-10" />;
            }
            const isSelected = item.dateStr === selectedDate;
            const hasTasks = tasks.some((t) => t.dueDate === item.dateStr);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDate(item.dateStr)}
                className={`h-10 rounded-xl flex flex-col items-center justify-center text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-[#0058BE] text-white shadow-xs font-bold'
                    : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{item.dayNum}</span>
                {hasTasks && (
                  <span
                    className={`w-1 h-1 rounded-full mt-0.5 ${
                      isSelected ? 'bg-white' : 'bg-[#0058BE]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 所选日期的任务列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-500 uppercase">
            {selectedDate} 日程事项 ({selectedDateTasks.length})
          </h3>
          {onOpenNewTaskWithDate && (
            <button
              type="button"
              onClick={() => onOpenNewTaskWithDate(selectedDate)}
              className="min-h-[32px] px-2 text-xs font-semibold text-[#0058BE] flex items-center gap-1"
            >
              <AppIcon name="plus" size={14} />
              <span>在此日期新建</span>
            </button>
          )}
        </div>

        {selectedDateTasks.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            当天暂无安排事项
          </div>
        ) : (
          <MobileListGroup>
            {selectedDateTasks.map((t) => (
              <MobileListItem
                key={t.id}
                title={t.title}
                subtitle={t.dueTime ? `时刻: ${t.dueTime}` : '全天事项'}
                trailing={
                  <span className="text-[11px] text-slate-400">
                    {t.status === 'Done' ? '已完成' : '待办'}
                  </span>
                }
                onClick={() => onSelectTask(t)}
              />
            ))}
          </MobileListGroup>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 12, 13, 84 我的任务与筛选批量操作
// -------------------------------------------------------------
export const MobileMyTasksScreen: React.FC<{
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onToggleCompletion: (task: Task) => Promise<void>;
  onBatchComplete: (ids: string[]) => Promise<void>;
  onBatchReschedule: (ids: string[], date: string) => Promise<void>;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onOpenNewTask: () => void;
  onBack?: () => void;
  showHeader?: boolean;
  lang?: Language;
}> = ({
  tasks,
  onSelectTask,
  onToggleCompletion,
  onBatchComplete,
  onBatchReschedule,
  onBatchDelete,
  onOpenNewTask,
  onBack,
  showHeader = true,
  lang = 'zh',
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'done'>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [search, setSearch] = useState('');

  // 13 批量模式
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchStatus =
        filterStatus === 'all'
          ? true
          : filterStatus === 'pending'
            ? t.status !== 'Done'
            : t.status === 'Done';
      const matchPriority =
        filterPriority === 'all' ? true : t.priority === filterPriority;
      const matchSearch =
        !search.trim() ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchPriority && matchSearch;
    });
  }, [tasks, filterStatus, filterPriority, search]);

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredTasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTasks.map((t) => t.id));
    }
  };

  const handleDoBatchComplete = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setBatchError(null);
    try {
      await onBatchComplete(selectedIds);
      setSelectedIds([]);
      setBatchMode(false);
    } catch (err) {
      setBatchError(err instanceof ApiError ? err.message : '批量完成失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDoBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setBatchError(null);
    try {
      await onBatchDelete(selectedIds);
      setSelectedIds([]);
      setBatchMode(false);
    } catch (err) {
      setBatchError(err instanceof ApiError ? err.message : '批量删除失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDoBatchReschedule = async () => {
    if (selectedIds.length === 0 || !rescheduleDate) return;
    setBusy(true);
    setBatchError(null);
    setShowReschedulePicker(false);
    try {
      await onBatchReschedule(selectedIds, rescheduleDate);
      setSelectedIds([]);
      setBatchMode(false);
    } catch (err) {
      setBatchError(err instanceof ApiError ? err.message : '批量顺延失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      {showHeader && <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">我的任务</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setBatchMode(!batchMode);
              setSelectedIds([]);
            }}
            className="min-h-[36px] px-2.5 text-xs font-semibold text-[#0058BE]"
          >
            {batchMode ? '退出批量' : '批量操作'}
          </button>
        </div>
      </header>}

      {!showHeader && <div className="shrink-0 flex justify-end px-3 pt-2 bg-white dark:bg-slate-900"><button type="button"
        onClick={() => { setBatchMode(!batchMode); setSelectedIds([]); }}
        className="min-h-[40px] px-2 text-xs font-semibold text-[#0058BE] dark:text-blue-300">{batchMode ? '退出批量' : '批量操作'}</button></div>}
      {/* 搜索与筛选栏 */}
      <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        <MobileInput
          placeholder="搜索事项标题…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          clearable
          onClear={() => setSearch('')}
          leading={<AppIcon name="search" size={18} />}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`min-h-[34px] px-3 rounded-full text-xs font-medium ${
              filterStatus === 'all'
                ? 'bg-[#0058BE] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            全部 ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('pending')}
            className={`min-h-[34px] px-3 rounded-full text-xs font-medium ${
              filterStatus === 'pending'
                ? 'bg-[#0058BE] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            未完成
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('done')}
            className={`min-h-[34px] px-3 rounded-full text-xs font-medium ${
              filterStatus === 'done'
                ? 'bg-[#0058BE] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            已完成
          </button>
        </div>
      </div>

      {batchError && (
        <div className="m-3 p-3 rounded-xl bg-red-50 text-red-600 text-xs">
          {batchError}
        </div>
      )}

      {/* 批量操作控制条 */}
      {batchMode && (
        <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex items-center justify-between text-xs text-[#0058BE] shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="font-semibold underline"
            >
              {selectedIds.length === filteredTasks.length ? '取消全选' : '全选本页'}
            </button>
            <span>已选 {selectedIds.length} 项</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={handleDoBatchComplete}
              className="min-h-[34px] px-2.5 rounded-lg bg-green-600 text-white font-medium disabled:opacity-40"
            >
              完成
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={() => setShowReschedulePicker(true)}
              className="min-h-[34px] px-2.5 rounded-lg bg-[#0058BE] text-white font-medium disabled:opacity-40"
            >
              顺延
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={handleDoBatchDelete}
              className="min-h-[34px] px-2.5 rounded-lg bg-red-600 text-white font-medium disabled:opacity-40"
            >
              删除
            </button>
          </div>
        </div>
      )}

      {/* 事项列表流 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredTasks.length === 0 ? (
          <MobileEmptyState
            title="暂无匹配事项"
            description="可调整筛选条件或点击新建添加待办"
            actionLabel="新建任务"
            onAction={onOpenNewTask}
          />
        ) : (
          <MobileListGroup>
            {filteredTasks.map((t) => {
              const isSelected = selectedIds.includes(t.id);
              const isDone = t.status === 'Done';

              return (
                <MobileListItem
                  key={t.id}
                  leading={
                    batchMode ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectId(t.id)}
                        className="w-5 h-5 rounded accent-[#0058BE]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCompletion(t);
                        }}
                        className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-400 hover:text-green-600"
                        aria-label={isDone ? '标为未完成' : '完成任务'}
                      >
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isDone
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isDone && <AppIcon name="check" size={12} />}
                        </div>
                      </button>
                    )
                  }
                  title={
                    <span className={isDone ? 'line-through text-slate-400' : ''}>
                      {t.title}
                    </span>
                  }
                  subtitle={
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.dueDate && <span className="text-[11px] text-slate-400">{t.dueDate}</span>}
                      {t.priority === 'High' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-50 text-red-600 font-medium">
                          高优
                        </span>
                      )}
                      {t.linkedNodeId && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-600 font-medium">
                          人轴
                        </span>
                      )}
                    </div>
                  }
                  onClick={() => {
                    if (batchMode) toggleSelectId(t.id);
                    else onSelectTask(t);
                  }}
                />
              );
            })}
          </MobileListGroup>
        )}
      </div>

      {/* 顺延日期选择器弹窗 */}
      {showReschedulePicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 max-w-xs w-full shadow-xl space-y-4">
            <h3 className="text-sm font-bold">批量顺延截止日期</h3>
            <MobileField label="目标日期">
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full min-h-[44px] px-3 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </MobileField>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReschedulePicker(false)}
                className="flex-1 min-h-[40px] rounded-xl border border-slate-300 text-xs"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!rescheduleDate}
                onClick={handleDoBatchReschedule}
                className="flex-1 min-h-[40px] rounded-xl bg-[#0058BE] text-white text-xs font-semibold disabled:opacity-40"
              >
                确认顺延
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
