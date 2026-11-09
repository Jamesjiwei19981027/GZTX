import React from 'react';
import { MobileTab, MOBILE_TABS } from '../navigation/mobileRoutes';
import { AppIcon } from './AppIcon';
import { useNativeRuntime } from '../runtime/NativeRuntimeProvider';

export interface MobileTabBarProps {
  currentTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  badges?: Partial<Record<MobileTab, number | string | boolean>>;
  hidden?: boolean;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  currentTab,
  onSelectTab,
  badges = {},
  hidden = false,
}) => {
  const { triggerHaptic } = useNativeRuntime();

  if (hidden) return null;

  return (
    <nav
      role="tablist"
      aria-label="主要页面导航"
      className="fixed bottom-0 left-0 right-0 z-30 bg-surface-container-lowest border-t border-outline-variant select-none transition-ink-colors"
    >
      <div className="flex items-center justify-around h-[52px] max-w-lg mx-auto px-1">
        {MOBILE_TABS.map((tab) => {
          const isActive = currentTab === tab.id;
          const badge = badges[tab.id];

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              type="button"
              onClick={() => {
                if (!isActive) {
                  triggerHaptic('selection');
                  onSelectTab(tab.id);
                }
              }}
              className={`mobile-touch-target flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                isActive
                  ? 'text-primary font-medium'
                  : 'text-on-surface-variant font-normal hover:text-on-surface'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <AppIcon
                  name={tab.iconName}
                  size={23}
                  strokeWidth={isActive ? 2.3 : 1.8}
                  className="transition-transform active:scale-90"
                />
                {badge && (
                  <span
                    className={`absolute -top-1 -right-2 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-medium leading-none ring-2 ring-surface-container-lowest ${
                      typeof badge === 'boolean' ? 'w-2.5 h-2.5 !min-w-0 !p-0 top-0 right-0' : ''
                    }`}
                  >
                    {typeof badge === 'boolean' ? '' : badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-tight tracking-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
