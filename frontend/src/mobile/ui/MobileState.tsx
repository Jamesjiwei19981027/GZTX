import React from 'react';
import { AppIcon, AppIconName } from './AppIcon';

export interface MobileEmptyStateProps {
  iconName?: AppIconName;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    iconName?: AppIconName;
  };
  className?: string;
}

export const MobileEmptyState: React.FC<MobileEmptyStateProps> = ({
  iconName = 'inbox',
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center select-none ${className}`}>
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4">
        <AppIcon name={iconName} size={28} />
      </div>
      <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#0058BE] text-white text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm cursor-pointer"
        >
          {action.iconName && <AppIcon name={action.iconName} size={16} />}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
};

export interface MobileLoadingStateProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export const MobileLoadingState: React.FC<MobileLoadingStateProps> = ({
  message = '正在加载…',
  fullScreen = false,
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-8 select-none ${
        fullScreen ? 'fixed inset-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs' : ''
      } ${className}`}
    >
      <div className="w-8 h-8 rounded-full border-3 border-slate-200 dark:border-slate-700 border-t-[#0058BE] animate-spin mb-3" />
      <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">{message}</p>
    </div>
  );
};

export interface MobileErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const MobileErrorState: React.FC<MobileErrorStateProps> = ({
  title = '加载失败',
  message,
  onRetry,
  retryLabel = '重新加载',
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center select-none ${className}`}>
      <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center mb-4">
        <AppIcon name="alert" size={28} />
      </div>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed mb-6">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 active:opacity-75 transition-opacity cursor-pointer"
        >
          <AppIcon name="refresh" size={16} />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
};

export interface MobileOfflineStateProps {
  onRetry?: () => void;
  className?: string;
}

export const MobileOfflineState: React.FC<MobileOfflineStateProps> = ({
  onRetry,
  className = '',
}) => {
  return (
    <div className={`p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <AppIcon name="warning" size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs text-amber-900 dark:text-amber-200 truncate">
          网络连接不稳定，请检查您的网络
        </span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0 underline cursor-pointer"
        >
          重试
        </button>
      )}
    </div>
  );
};
