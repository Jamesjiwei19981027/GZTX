import React from 'react';
import { NativeRuntimeProvider } from './runtime/NativeRuntimeProvider';
import { MobileNavigationProvider, useMobileNavigation } from './navigation/MobileNavigationProvider';
import { MobileRouteOutlet, MobileRouteOutletSharedProps } from './navigation/MobileRouteOutlet';
import { MobileTabBar } from './ui/MobileTabBar';
import { mapLegacyViewToMobileRoute } from './navigation/mobileRoutes';
import { readDeepLink } from '../utils/deepLink';

export interface MobileAppShellProps extends MobileRouteOutletSharedProps {
  unreadMessagesCount?: number;
}

const MobileAppShellInner: React.FC<MobileAppShellProps> = (props) => {
  const { currentTab, switchTab } = useMobileNavigation();

  const badges = {
    messages: props.unreadMessagesCount && props.unreadMessagesCount > 0 ? props.unreadMessagesCount : undefined,
  };

  return (
    <div className="mobile-shell relative w-full h-[100dvh] flex flex-col overflow-hidden bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      {/* 核心页面路由 Outlet */}
      <MobileRouteOutlet {...props} />

      {/* 5 个主导航 TabBar */}
      <MobileTabBar
        currentTab={currentTab}
        onSelectTab={switchTab}
        badges={badges}
      />
    </div>
  );
};

export const MobileAppShell: React.FC<MobileAppShellProps> = (props) => {
  const [initialRoute] = React.useState(() => {
    const link = readDeepLink();
    return mapLegacyViewToMobileRoute(link.view, { taskId: link.taskId });
  });
  return (
    <NativeRuntimeProvider>
      <MobileNavigationProvider initialTab={initialRoute.tab} initialRoute={initialRoute}>
        <MobileAppShellInner {...props} />
      </MobileNavigationProvider>
    </NativeRuntimeProvider>
  );
};
