import React from 'react';
import { AppIcon } from './AppIcon';

export interface MobileConfirmProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  loading?: boolean;
}

export const MobileConfirm: React.FC<MobileConfirmProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 select-none"
    >
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-on-surface/50 dark:bg-black/70 transition-opacity"
        onClick={loading ? undefined : onCancel}
        aria-hidden="true"
      />

      {/* 对话框主体（iOS 风格圆角卡片） */}
      <div className="relative z-10 w-full max-w-xs bg-surface-container-lowest rounded-[var(--radius-ink-panel)] shadow-2xl p-6 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150">
        <h3
          id="confirm-title"
          className="text-[17px] font-medium text-on-surface mb-2 leading-snug"
        >
          {title}
        </h3>
        <p
          id="confirm-desc"
          className="text-xs text-on-surface-variant leading-relaxed mb-6"
        >
          {message}
        </p>

        <div className="w-full flex flex-col gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`w-full min-h-[46px] rounded-xl font-medium text-[15px] flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              destructive
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm'
                : 'bg-primary hover:bg-primary/90 active:bg-primary/80 text-on-primary shadow-sm'
            } disabled:opacity-50`}
          >
            {loading ? (
              <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : null}
            <span>{confirmLabel}</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="w-full min-h-[46px] rounded-xl font-medium text-[15px] bg-surface-container hover:bg-surface-container-high active:bg-surface-container-highest text-on-surface-variant transition-ink-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
