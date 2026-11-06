import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MobileTab,
  MobileRoute,
  createDefaultRoute,
  resolveBackAction,
  BackAction,
  LegacyMobileTab,
  MobileRouteInput,
  normalizeMobileRoute,
} from './mobileRoutes';
import { subscribeNativeBack, postToNative } from '../runtime/nativeBridge';
import { MobileConfirm } from '../ui/MobileConfirm';

export interface MobileOverlayConfig {
  id: string;
  type: 'sheet' | 'dialog';
  title?: string;
  dirty?: boolean;
  onDismiss?: () => void;
}

export interface MobileNavigationContextValue {
  currentTab: MobileTab;
  activeRoute: MobileRoute;
  canGoBack: boolean;
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  overlay: MobileOverlayConfig | null;
  switchTab: (tab: MobileTab) => void;
  push: (route: MobileRouteInput) => void;
  pop: () => boolean;
  replace: (route: MobileRouteInput) => void;
  openOverlay: (overlay: MobileOverlayConfig) => void;
  closeOverlay: () => void;
  unregisterOverlay: (id: string) => void;
  goBack: () => void;
}

const MobileNavigationContext = createContext<MobileNavigationContextValue | null>(null);

export interface MobileNavigationProviderProps {
  children: React.ReactNode;
  initialTab?: LegacyMobileTab;
  initialRoute?: Omit<MobileRoute, 'tab'> & { tab: LegacyMobileTab };
}

export const MobileNavigationProvider: React.FC<MobileNavigationProviderProps> = ({
  children,
  initialTab = 'work',
  initialRoute,
}) => {
  const [currentTab, setCurrentTab] = useState<MobileTab>(() => initialRoute
    ? normalizeMobileRoute(initialRoute).tab : initialTab === 'ai' ? 'work' : initialTab);

  // 为每个 Tab 维护独立的页面栈，切 Tab 不丢失状态
  const [stacks, setStacks] = useState<Record<MobileTab, MobileRoute[]>>(() => {
    const stack = (tab: MobileTab): MobileRoute[] => {
      const root = createDefaultRoute(tab);
      const route = initialRoute ? normalizeMobileRoute(initialRoute) : initialTab === 'ai' ? normalizeMobileRoute({ screen: 'ai-root' }) : undefined;
      if (route?.tab !== tab) return [root];
      return route.screen === root.screen ? [route] : [root, route];
    };
    return {
      work: stack('work'),
      axis: stack('axis'),
      knowledge: stack('knowledge'),
      messages: stack('messages'),
      me: stack('me'),
    };
  });

  const [overlay, setOverlay] = useState<MobileOverlayConfig | null>(null);
  const overlayRef = useRef<MobileOverlayConfig | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [discardModalOpen, setDiscardModalOpen] = useState<boolean>(false);
  const [pendingBackAction, setPendingBackAction] = useState<(() => void) | null>(null);

  // 手机浏览器返回键历史栈管理
  const historyDepthRef = useRef<number>(0);
  const isHandlingPopStateRef = useRef<boolean>(false);
  const isInternalBackRef = useRef<boolean>(false);

  const activeStack = stacks[currentTab];
  const activeRoute = activeStack[activeStack.length - 1] || createDefaultRoute(currentTab);
  const isDetailOpen = activeStack.length > 1;

  const activeStackRef = useRef<MobileRoute[]>(activeStack);
  useEffect(() => {
    activeStackRef.current = activeStack;
  }, [activeStack]);

  // 告知原生宿主是否开启返回拦截
  useEffect(() => {
    const shouldIntercept = isDirty || Boolean(overlay) || isDetailOpen;
    postToNative({
      type: 'set-native-back-intercept',
      enabled: shouldIntercept,
    });
  }, [isDirty, overlay, isDetailOpen]);

  const switchTab = useCallback(
    (tab: MobileTab) => {
      if (tab === currentTab) return;
      // 切换 Tab 时保留已有栈与状态
      setCurrentTab(tab);
    },
    [currentTab],
  );

  const push = useCallback(
    (routeConfig: MobileRouteInput) => {
      const normalized = normalizeMobileRoute(routeConfig, currentTab);
      const targetTab = normalized.tab;
      const isTargetDefault = normalized.screen === createDefaultRoute(targetTab).screen;

      if (typeof window !== 'undefined' && window.history && !isTargetDefault) {
        window.history.pushState({ mobileNav: true }, '');
        historyDepthRef.current += 1;
      }

      setCurrentTab(targetTab);
      setStacks((prev) => {
        const currentStack = prev[targetTab];
        const newRoute: MobileRoute = {
          tab: targetTab,
          screen: normalized.screen,
          presentation: routeConfig.presentation || 'page',
          params: routeConfig.params || {},
          title: routeConfig.title,
        };
        return {
          ...prev,
          [targetTab]: isTargetDefault
            ? [newRoute]
            : [...currentStack, newRoute],
        };
      });
    },
    [currentTab],
  );

  const pop = useCallback((): boolean => {
    let popped = false;
    setStacks((prev) => {
      const currentStack = prev[currentTab];
      if (currentStack.length > 1) {
        popped = true;
        return {
          ...prev,
          [currentTab]: currentStack.slice(0, -1),
        };
      }
      return prev;
    });
    return popped;
  }, [currentTab]);

  const replace = useCallback(
    (routeConfig: MobileRouteInput) => {
      const normalized = normalizeMobileRoute(routeConfig, currentTab);
      const targetTab = normalized.tab;
      setCurrentTab(targetTab);
      setStacks((prev) => {
        const currentStack = prev[targetTab];
        const newRoute: MobileRoute = {
          tab: targetTab,
          screen: normalized.screen,
          presentation: routeConfig.presentation || 'page',
          params: routeConfig.params || {},
          title: routeConfig.title,
        };
        const updated = [...currentStack];
        updated[updated.length - 1] = newRoute;
        return {
          ...prev,
          [targetTab]: updated,
        };
      });
    },
    [currentTab],
  );

  const openOverlay = useCallback((overlayConfig: MobileOverlayConfig) => {
    overlayRef.current = overlayConfig;
    setOverlay(overlayConfig);
  }, []);

  const closeOverlay = useCallback(() => {
    const dismissed = overlayRef.current;
    overlayRef.current = null;
    setOverlay(null);
    // Dismissal may update a screen; never execute it inside a React state updater.
    dismissed?.onDismiss?.();
  }, []);

  const unregisterOverlay = useCallback((id: string) => {
    if (overlayRef.current?.id !== id) return;
    overlayRef.current = null;
    setOverlay(null);
  }, []);

  // 执行返回动作决策并分发
  const executeBack = useCallback(
    (forceDiscard: boolean = false): boolean => {
      const action = resolveBackAction({
        currentDirty: forceDiscard ? false : isDirty || Boolean(overlay?.dirty),
        overlayOpen: Boolean(overlay),
        detailOpen: isDetailOpen,
      });

      switch (action) {
        case 'confirm-discard': {
          setDiscardModalOpen(true);
          setPendingBackAction(() => () => {
            setIsDirty(false);
            executeBack(true);
          });
          return true; // 拦截并由确认弹窗接管
        }
        case 'close-overlay': {
          closeOverlay();
          if (!isHandlingPopStateRef.current && historyDepthRef.current > 0) {
            isInternalBackRef.current = true;
            window.history.back();
          }
          return true;
        }
        case 'pop-detail': {
          const popped = pop();
          if (popped && !isHandlingPopStateRef.current && historyDepthRef.current > 0) {
            isInternalBackRef.current = true;
            window.history.back();
          }
          return popped;
        }
        case 'root': {
          return false; // 根页不消耗，允许宿主执行退出或最小化
        }
      }
    },
    [isDirty, overlay, isDetailOpen, closeOverlay, pop],
  );

  const goBack = useCallback(() => {
    executeBack(false);
  }, [executeBack]);

  // 订阅宿主或系统的返回手势/硬件返回键
  useEffect(() => {
    const unsubscribe = subscribeNativeBack(() => {
      return executeBack(false);
    });
    return unsubscribe;
  }, [executeBack]);

  // 监听浏览器返回事件 (手机浏览器返回键)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (isInternalBackRef.current) {
        isInternalBackRef.current = false;
        if (historyDepthRef.current > 0) {
          historyDepthRef.current -= 1;
        }
        return;
      }

      const canReturn = isDirty || Boolean(overlayRef.current) || activeStackRef.current.length > 1;
      if (!canReturn) {
        // 栈空时不拦截，自然交由浏览器处理退出或后退
        return;
      }

      if (historyDepthRef.current > 0) {
        historyDepthRef.current -= 1;
      }

      isHandlingPopStateRef.current = true;
      try {
        executeBack(false);
      } finally {
        isHandlingPopStateRef.current = false;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [executeBack, isDirty]);

  const handleConfirmDiscard = useCallback(() => {
    setDiscardModalOpen(false);
    setIsDirty(false);
    if (pendingBackAction) {
      pendingBackAction();
      setPendingBackAction(null);
    }
  }, [pendingBackAction]);

  const handleCancelDiscard = useCallback(() => {
    setDiscardModalOpen(false);
    setPendingBackAction(null);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ mobileNav: true }, '');
      historyDepthRef.current += 1;
    }
  }, []);

  const value = useMemo<MobileNavigationContextValue>(() => {
    return {
      currentTab,
      activeRoute,
      canGoBack: isDetailOpen || Boolean(overlay),
      isDirty,
      setDirty: setIsDirty,
      overlay,
      switchTab,
      push,
      pop,
      replace,
      openOverlay,
      closeOverlay,
      unregisterOverlay,
      goBack,
    };
  }, [
    currentTab,
    activeRoute,
    isDetailOpen,
    overlay,
    isDirty,
    switchTab,
    push,
    pop,
    replace,
    openOverlay,
    closeOverlay,
    unregisterOverlay,
    goBack,
  ]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __MOBILE_NAV__?: unknown }).__MOBILE_NAV__ = value;
    }
  }, [value]);

  return (
    <MobileNavigationContext.Provider value={value}>
      {children}

      {/* 放弃编辑拦截二次确认弹窗 */}
      <MobileConfirm
        isOpen={discardModalOpen}
        title="放弃未保存的修改？"
        message="当前有正在编辑的内容，退出将丢失未保存的改动。"
        confirmLabel="放弃修改"
        cancelLabel="继续编辑"
        destructive
        onConfirm={handleConfirmDiscard}
        onCancel={handleCancelDiscard}
      />
    </MobileNavigationContext.Provider>
  );
};

export function useMobileNavigation(): MobileNavigationContextValue {
  const ctx = useContext(MobileNavigationContext);
  if (!ctx) {
    throw new Error('useMobileNavigation must be used within MobileNavigationProvider');
  }
  return ctx;
}

export function useOptionalMobileNavigation() {
  return useContext(MobileNavigationContext);
}
