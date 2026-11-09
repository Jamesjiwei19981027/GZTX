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
        <div className="px-4 pb-2 text-[13px] font-medium text-on-surface-variant select-none">
          {title}
        </div>
      )}
      <div className="bg-surface-container-lowest rounded-[var(--radius-ink-card)] border border-outline-variant shadow-xs overflow-hidden">
        {children}
      </div>
      {footer && (
        <div className="px-4 pt-2 text-xs text-on-surface-variant font-normal leading-relaxed">
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
          ? 'active:bg-surface-container cursor-pointer'
          : ''
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${
        selected ? 'bg-primary-container/60' : ''
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
        <div className="shrink-0 flex items-center justify-center text-on-surface-variant">
          {leading}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div
          className={`text-[16px] leading-snug font-normal truncate ${
            destructive
              ? 'text-error font-medium'
              : 'text-on-surface'
          }`}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-on-surface-variant leading-tight truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      {(trailing || shouldShowChevron) && (
        <div className="shrink-0 flex items-center gap-2 text-on-surface-variant">
          {trailing}
          {shouldShowChevron && (
            <AppIcon name="chevron-right" size={18} className="text-on-surface-variant shrink-0" />
          )}
        </div>
      )}

      {showDivider && (
        <div
          className={`absolute bottom-0 right-0 h-px bg-outline-variant pointer-events-none ${
            leading ? 'left-14' : 'left-4'
          }`}
        />
      )}
    </div>
  );

  return content;
};
