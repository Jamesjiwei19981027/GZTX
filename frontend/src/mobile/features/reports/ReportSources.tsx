import React from 'react';
import { AppIcon, AppIconName } from '../../ui/AppIcon';
import { ReportSource } from '../../../api/reports';

export interface ReportSourcesProps {
  sources?: ReportSource[];
  taskSnapshot?: Array<{ id: number; title: string; status?: string }>;
  evidenceSnapshot?: Array<{ id: number; summary?: string; status?: string }>;
  onSelectSource?: (source: ReportSource) => void;
  className?: string;
  maxItems?: number;
}

function getSourceIcon(sourceType: string): AppIconName {
  switch (sourceType.toLowerCase()) {
    case 'task':
      return 'check-circle';
    case 'evidence':
    case 'evidence_package':
      return 'file';
    case 'tree_node':
      return 'axis';
    case 'agent_message':
      return 'messages';
    case 'progress_record':
      return 'clock';
    default:
      return 'file';
  }
}

function getSourceTypeLabel(sourceType: string): string {
  switch (sourceType.toLowerCase()) {
    case 'task':
      return '任务事实';
    case 'evidence':
    case 'evidence_package':
      return '材料证据';
    case 'tree_node':
      return '人轴节点';
    case 'agent_message':
      return '会话记录';
    case 'progress_record':
      return '进度记录';
    default:
      return '引用数据';
  }
}

export const ReportSources: React.FC<ReportSourcesProps> = ({
  sources = [],
  taskSnapshot = [],
  evidenceSnapshot = [],
  onSelectSource,
  className = '',
  maxItems,
}) => {
  // 结合 explicit sources 与 payload snapshots
  const allItems: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    rawSource?: ReportSource;
  }> = [];

  sources.forEach((s, idx) => {
    allItems.push({
      id: `source-${s.id ?? idx}`,
      type: s.source_type,
      title: s.excerpt || `关联 ${getSourceTypeLabel(s.source_type)}`,
      detail: `${getSourceTypeLabel(s.source_type)}${s.source_id ? ` · ID: ${s.source_id}` : ''}`,
      rawSource: s,
    });
  });

  // 如果没有 explicit sources，但有 snapshot，展示快照
  if (allItems.length === 0) {
    taskSnapshot.forEach((t) => {
      allItems.push({
        id: `task-${t.id}`,
        type: 'task',
        title: t.title,
        detail: `任务快照 · 状态：${t.status || '进行中'}`,
      });
    });

    evidenceSnapshot.forEach((e) => {
      allItems.push({
        id: `evidence-${e.id}`,
        type: 'evidence',
        title: e.summary || '项目材料证据',
        detail: `材料快照 · 状态：${e.status || '已归档'}`,
      });
    });
  }

  const displayed = maxItems ? allItems.slice(0, maxItems) : allItems;

  if (displayed.length === 0) {
    return (
      <div className={`p-4 bg-surface-container-lowest dark:bg-surface-container-lowest/60 rounded-xl border border-outline-variant/80 dark:border-outline-variant text-center ${className}`}>
        <p className="text-xs text-outline dark:text-on-surface-variant">暂无来源</p>
      </div>
    );
  }

  return (
    <div className={`bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant overflow-hidden divide-y divide-outline-variant dark:divide-outline-variant/80 ${className}`}>
      {displayed.map((item) => {
        const icon = getSourceIcon(item.type);
        return (
          <div
            key={item.id}
            onClick={() => {
              if (item.rawSource && onSelectSource) {
                onSelectSource(item.rawSource);
              }
            }}
            className={`flex items-center gap-3 px-4 py-3 transition-ink-colors ${
              onSelectSource && item.rawSource
                ? 'hover:bg-surface dark:hover:bg-surface-container-lowest/50 cursor-pointer active:bg-surface-container'
                : ''
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-surface-container dark:bg-surface-container text-primary dark:text-primary flex items-center justify-center shrink-0">
              <AppIcon name={icon} size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-on-surface dark:text-outline truncate tabular-nums">
                {item.title}
              </p>
              <p className="text-xs text-outline dark:text-on-surface-variant truncate mt-1">
                {item.detail}
              </p>
            </div>
            {onSelectSource && item.rawSource && (
              <AppIcon name="chevron-right" size={18} className="text-inherit shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
};
