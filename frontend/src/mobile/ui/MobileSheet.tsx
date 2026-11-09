import React, { useEffect, useRef } from 'react';
import { AppIcon } from './AppIcon';
import { useKeyboardViewport } from '../runtime/useKeyboardViewport';

export interface MobileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: 'auto' | 'half' | 'full';
  showCloseButton?: boolean;
  className?: string;
}

export const MobileSheet: React.FC<MobileSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  height = 'auto',
  showCloseButton = true,
  className = '',
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { bottomInset } = useKeyboardViewport();

  // 监听 ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 打开时锁定背景滚动
  useEffect(() => {
    if (!isOpen) return;
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const heightClass =
    height === 'full'
      ? 'h-[92vh] max-h-[92vh]'
      : height === 'half'
      ? 'h-[55vh] max-h-[55vh]'
      : 'max-h-[85vh]';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || '底部操作面板'}
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ bottom: bottomInset }}
    >
      {/* 遮罩背景 */}
      <div
        className="fixed inset-0 bg-on-surface/45 dark:bg-black/65 transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 底部 Sheet 主体 */}
      <div
        ref={sheetRef}
        style={{ maxHeight: 'calc(100% - 12px)' }}
        className={`relative z-10 w-full bg-surface-container-lowest rounded-t-[var(--radius-ink-panel)] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out max-w-xl mx-auto ${heightClass} ${className}`}
      >
        {/* 顶部手势把手 */}
        <div className="w-full flex items-center justify-center pt-3 pb-1 shrink-0 select-none cursor-grab">
          <div className="w-9 h-1.5 rounded-full bg-outline-variant" />
        </div>

        {/* 标题栏 */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant shrink-0">
            <div className="flex-1 min-w-0 pr-2">
              {title && (
                <h2 className="text-[17px] font-medium text-on-surface truncate">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs text-on-surface-variant truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="mobile-touch-target -mr-2 h-9 w-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface active:bg-surface-container cursor-pointer"
              >
                <AppIcon name="close" size={20} />
              </button>
            )}
          </div>
        )}

        {/* 内容滚动区 */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 mobile-scroll-container">
          {children}
        </div>
      </div>
    </div>
  );
};
