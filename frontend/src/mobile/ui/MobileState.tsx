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
      <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
        <AppIcon name={iconName} size={28} />
      </div>
      <h3 className="text-base font-medium text-on-surface mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-on-surface-variant max-w-xs leading-relaxed mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 active:bg-primary/80 transition-ink-colors shadow-sm cursor-pointer"
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
        fullScreen ? 'fixed inset-0 z-50 bg-surface/80 backdrop-blur-xs' : ''
      } ${className}`}
    >
      <div className="w-8 h-8 rounded-full border-3 border-outline-variant border-t-primary animate-spin mb-3" />
      <p className="text-xs text-on-surface-variant font-normal">{message}</p>
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
      <div className="w-14 h-14 rounded-full bg-error-container text-error flex items-center justify-center mb-4">
        <AppIcon name="alert" size={28} />
      </div>
      <h3 className="text-base font-medium text-on-surface mb-1.5">{title}</h3>
      <p className="text-xs text-on-surface-variant max-w-xs leading-relaxed mb-6">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-on-surface dark:bg-on-surface text-surface text-sm font-medium hover:opacity-90 active:opacity-75 transition-ink-colors cursor-pointer"
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
    <div className={`p-4 bg-secondary-container border border-outline-variant rounded-xl flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <AppIcon name="warning" size={18} className="text-secondary shrink-0" />
        <span className="text-xs text-on-secondary-container truncate">
          网络连接不稳定，请检查您的网络
        </span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium text-secondary shrink-0 underline cursor-pointer"
        >
          重试
        </button>
      )}
    </div>
  );
};
