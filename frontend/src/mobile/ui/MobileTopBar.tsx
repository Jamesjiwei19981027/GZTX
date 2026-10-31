import React from 'react';
import { AppIcon } from './AppIcon';

export interface MobileTopBarProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  className?: string;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  title,
  subtitle,
  onBack,
  backLabel = '返回',
  showBack = Boolean(onBack),
  rightAction,
  className = '',
}) => {
  return (
    <header
      aria-label={title ? `页面标题：${title}` : undefined}
      className={`sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 select-none ${className}`}
    >
      <div className="flex items-center justify-between h-[48px] px-2 relative">
        {/* 左侧：返回按钮或占位 */}
        <div className="flex items-center min-w-[72px] z-10">
          {showBack && onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="mobile-touch-target flex items-center gap-0.5 text-[#0058BE] dark:text-blue-400 font-normal text-[16px] -ml-1 active:opacity-60 cursor-pointer"
            >
              <AppIcon name="chevron-left" size={24} className="stroke-[2.5]" />
              <span className="truncate max-w-[80px]">{backLabel}</span>
            </button>
          ) : null}
        </div>

        {/* 中间：居中紧凑标题 */}
        {title && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-16">
            <h1 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 truncate max-w-full leading-tight">
              {title}
            </h1>
            {subtitle && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full">
                {subtitle}
              </span>
            )}
          </div>
        )}

        {/* 右侧：动作按钮插槽 */}
        <div className="flex items-center justify-end min-w-[72px] gap-1 z-10">
          {rightAction}
        </div>
      </div>
    </header>
  );
};
