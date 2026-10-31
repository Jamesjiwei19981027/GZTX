import React from 'react';
import { AppIcon } from './AppIcon';

export interface MobileListGroupProps {
  title?: string;
  footer?: string;
  className?: string;
  children: React.ReactNode;
}

export const MobileListGroup: React.FC<MobileListGroupProps> = ({
  title,
  footer,
  className = '',
  children,
}) => {
  return (
    <div className={`w-full mb-4 last:mb-0 ${className}`}>
      {title && (
        <div className="px-4 pb-2 text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
          {title}
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {children}
      </div>
      {footer && (
        <div className="px-4 pt-2 text-xs text-slate-400 dark:text-slate-500 font-normal leading-relaxed">
          {footer}
        </div>
      )}
    </div>
  );
};

export interface MobileListItemProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  showDivider?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
  className?: string;
}

export const MobileListItem: React.FC<MobileListItemProps> = ({
  leading,
  title,
  subtitle,
  trailing,
  showChevron,
  showDivider = true,
  onClick,
  disabled = false,
  destructive = false,
  selected = false,
  className = '',
}) => {
  const isInteractive = Boolean(onClick) && !disabled;
  const shouldShowChevron = showChevron ?? (Boolean(onClick) && !trailing);

  const content = (
    <div
      className={`relative flex items-center min-h-[52px] px-4 py-3 gap-3.5 transition-colors select-none ${
        isInteractive
          ? 'active:bg-slate-100 dark:active:bg-slate-800/70 cursor-pointer'
          : ''
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${
        selected ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
      } ${className}`}
      onClick={isInteractive ? onClick : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {leading && (
        <div className="shrink-0 flex items-center justify-center text-slate-600 dark:text-slate-300">
          {leading}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div
          className={`text-[16px] leading-snug font-normal truncate ${
            destructive
              ? 'text-red-600 dark:text-red-400 font-medium'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-slate-500 dark:text-slate-400 leading-tight truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      {(trailing || shouldShowChevron) && (
        <div className="shrink-0 flex items-center gap-2 text-slate-400">
          {trailing}
          {shouldShowChevron && (
            <AppIcon name="chevron-right" size={18} className="text-slate-300 dark:text-slate-600 shrink-0" />
          )}
        </div>
      )}

      {showDivider && (
        <div
          className={`absolute bottom-0 right-0 h-px bg-slate-100 dark:bg-slate-800 pointer-events-none ${
            leading ? 'left-14' : 'left-4'
          }`}
        />
      )}
    </div>
  );

  return content;
};
