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
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={loading ? undefined : onCancel}
        aria-hidden="true"
      />

      {/* 对话框主体（iOS 风格圆角卡片） */}
      <div className="relative z-10 w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150">
        <h3
          id="confirm-title"
          className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 mb-2 leading-snug"
        >
          {title}
        </h3>
        <p
          id="confirm-desc"
          className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6"
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
                : 'bg-[#0058BE] hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm'
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
            className="w-full min-h-[46px] rounded-xl font-medium text-[15px] bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
