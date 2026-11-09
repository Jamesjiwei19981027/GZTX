/** 批量顺延结果汇总：只读任务（项目投影）被后端跳过，界面不得本地改期。 */
export function summarizeBatchReschedule(
  taskIds: string[],
  res: { updated_count?: number; skipped_readonly?: number; skipped_task_ids?: number[] },
  dueDate: string,
): { applied: string[]; skippedCount: number; message: string } {
  const skipped = new Set((res.skipped_task_ids ?? []).map(String));
  const applied = taskIds.filter((id) => !skipped.has(id));
  const skippedCount = res.skipped_readonly ?? skipped.size;
  const updated = res.updated_count ?? applied.length;
  const message =
    skippedCount > 0
      ? `已顺延 ${updated} 条任务至 ${dueDate}，${skippedCount} 条只读任务未顺延`
      : `已顺延 ${updated} 个任务至 ${dueDate}`;
  return { applied, skippedCount, message };
}
