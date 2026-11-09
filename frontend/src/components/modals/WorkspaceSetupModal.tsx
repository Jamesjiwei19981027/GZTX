import React, { useMemo, useState } from 'react';
import { Language } from '../../types';
import { slugFromName } from '../../utils/invite';

export type WorkspaceSetupMode = 'company' | 'project';

interface WorkspaceSetupModalProps {
  isOpen: boolean;
  mode: WorkspaceSetupMode;
  lang: Language;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: { name: string; slug?: string }) => Promise<void> | void;
}

export const WorkspaceSetupModal: React.FC<WorkspaceSetupModalProps> = ({
  isOpen,
  mode,
  lang,
  submitting = false,
  error,
  onClose,
  onSubmit,
}) => {
  const zh = lang === 'zh';
  const [name, setName] = useState('');
  const slug = useMemo(() => slugFromName(name), [name]);

  if (!isOpen) return null;

  const title =
    mode === 'company'
      ? zh
        ? '创建公司工作区'
        : 'Create company'
      : zh
        ? '创建项目'
        : 'Create project';
  const hint =
    mode === 'company'
      ? zh
        ? '创建后你将成为该公司管理员。新建项目还需要有效 License。'
        : 'You will become the company admin. Creating projects still requires a valid license.'
      : zh
        ? '项目创建受 License / 配额约束；若未开通会直接提示原因。'
        : 'Project creation is license-gated; failures are shown as-is.';

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        className="w-full max-w-md rounded-[var(--radius-ink-panel)] bg-surface-container-lowest border border-outline-variant/40 p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || submitting) return;
          void onSubmit(mode === 'company' ? { name: trimmed, slug } : { name: trimmed });
        }}
      >
        <h3 className="text-lg font-medium text-on-surface tabular-nums">{title}</h3>
        <p className="text-sm text-on-surface-variant">{hint}</p>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-on-surface-variant tabular-nums">
            {mode === 'company' ? (zh ? '公司名称' : 'Company name') : zh ? '项目名称' : 'Project name'}
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 rounded-lg bg-surface-container border border-outline-variant/40 text-sm"
            placeholder={mode === 'company' ? (zh ? '例如：星河工作室' : 'Acme Studio') : zh ? '例如：Q3 交付' : 'Q3 delivery'}
          />
        </label>
        {mode === 'company' && (
          <p className="text-xs text-on-surface-variant">
            slug: <code>{slug}</code>
          </p>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={submitting} onClick={onClose} className="px-4 py-2 text-sm cursor-pointer">
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50 cursor-pointer tabular-nums"
          >
            {submitting ? (zh ? '创建中…' : 'Creating…') : zh ? '创建' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};
