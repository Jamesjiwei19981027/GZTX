import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { NativeRuntime, HapticFeedbackType } from './runtimeTypes';
import {
  getBrowserDefaultRuntime,
  subscribeNativeRuntime,
  triggerHaptic as nativeTriggerHaptic,
} from './nativeBridge';

interface NativeRuntimeContextValue {
  runtime: NativeRuntime;
  updateRuntime: (partial: Partial<NativeRuntime>) => void;
  triggerHaptic: (feedback?: HapticFeedbackType) => void;
  isIOS: boolean;
  isAndroid: boolean;
  isApp: boolean;
}

const NativeRuntimeContext = createContext<NativeRuntimeContextValue | null>(null);

export const NativeRuntimeProvider: React.FC<{
  children: React.ReactNode;
  initialRuntime?: NativeRuntime;
}> = ({ children, initialRuntime }) => {
  const [runtime, setRuntime] = useState<NativeRuntime>(() => initialRuntime || getBrowserDefaultRuntime());

  // 1. 订阅宿主桥接更新
  useEffect(() => {
    const unsubscribe = subscribeNativeRuntime((newRuntime) => {
      setRuntime(newRuntime);
    });
    return unsubscribe;
  }, []);

  // 2. 媒体查询监听（深色模式、减少动态效果），仅在非宿主覆盖时响应
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleDarkChange = (e: MediaQueryListEvent) => {
      setRuntime((prev) => {
        if (prev.surface === 'app') return prev; // 原生宿主由桥接直接控制
        return { ...prev, colorScheme: e.matches ? 'dark' : 'light' };
      });
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setRuntime((prev) => {
        if (prev.surface === 'app') return prev;
        return { ...prev, reduceMotion: e.matches };
      });
    };

    darkQuery.addEventListener?.('change', handleDarkChange);
    motionQuery.addEventListener?.('change', handleMotionChange);

    return () => {
      darkQuery.removeEventListener?.('change', handleDarkChange);
      motionQuery.removeEventListener?.('change', handleMotionChange);
    };
  }, []);

  // 3. 将运行时语义字号与平台信息注入为 CSS 变量
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    root.style.setProperty('--mobile-font-body', `${runtime.textSizes.body}px`);
    root.style.setProperty('--mobile-font-caption', `${runtime.textSizes.caption}px`);
    root.style.setProperty('--mobile-font-nav-title', `${runtime.textSizes.navTitle}px`);
    root.style.setProperty('--mobile-font-display-title', `${runtime.textSizes.displayTitle}px`);
    root.setAttribute('data-mobile-platform', runtime.platform);
    root.setAttribute('data-mobile-surface', runtime.surface);
    root.setAttribute('data-safe-area-owner', runtime.safeAreaOwner);
    if (runtime.reduceMotion) {
      root.setAttribute('data-reduce-motion', 'true');
    } else {
      root.removeAttribute('data-reduce-motion');
    }
  }, [runtime]);

  const updateRuntime = useCallback((partial: Partial<NativeRuntime>) => {
    setRuntime((prev) => ({ ...prev, ...partial }));
  }, []);

  const triggerHaptic = useCallback(
    (feedback: HapticFeedbackType = 'light') => {
      if (runtime.capabilities.haptics || runtime.surface === 'browser') {
        nativeTriggerHaptic(feedback);
      }
    },
    [runtime.capabilities.haptics, runtime.surface],
  );

  const value = useMemo<NativeRuntimeContextValue>(() => {
    return {
      runtime,
      updateRuntime,
      triggerHaptic,
      isIOS: runtime.platform === 'ios',
      isAndroid: runtime.platform === 'android',
      isApp: runtime.surface === 'app',
    };
  }, [runtime, updateRuntime, triggerHaptic]);

  return (
    <NativeRuntimeContext.Provider value={value}>
      {children}
    </NativeRuntimeContext.Provider>
  );
};

export function useNativeRuntime(): NativeRuntimeContextValue {
  const ctx = useContext(NativeRuntimeContext);
  if (!ctx) {
    // 降级回退默认值，避免在 Provider 外部偶尔调用直接崩溃
    const defaultRuntime = getBrowserDefaultRuntime();
    return {
      runtime: defaultRuntime,
      updateRuntime: () => {},
      triggerHaptic: nativeTriggerHaptic,
      isIOS: defaultRuntime.platform === 'ios',
      isAndroid: defaultRuntime.platform === 'android',
      isApp: defaultRuntime.surface === 'app',
    };
  }
  return ctx;
}
