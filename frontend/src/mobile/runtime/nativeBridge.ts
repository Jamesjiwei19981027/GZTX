/**
 * 移动宿主桥接与运行时解析器
 * 提供安全的 NativeRuntime 解析与双向通信机制
 */

import {
  NativeRuntime,
  UiPlatform,
  TextRole,
  WebToNativeMessage,
  HapticFeedbackType,
} from './runtimeTypes';

const VALID_PLATFORMS: ReadonlySet<string> = new Set(['web', 'android', 'ios']);
const VALID_SURFACES: ReadonlySet<string> = new Set(['browser', 'app']);
const VALID_COLOR_SCHEMES: ReadonlySet<string> = new Set(['light', 'dark']);
const VALID_SAFE_AREA_OWNERS: ReadonlySet<string> = new Set(['native', 'web']);
const TEXT_ROLES: ReadonlyArray<TextRole> = ['body', 'caption', 'navTitle', 'displayTitle'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * 严格校验输入，非法的运行时消息绝不应用到应用状态中
 */
export function parseNativeRuntime(input: unknown): NativeRuntime | null {
  if (!isRecord(input)) {
    return null;
  }

  // 1. 版本协议校验
  if (input.v !== 1) {
    return null;
  }

  // 2. 基础枚举校验
  if (typeof input.platform !== 'string' || !VALID_PLATFORMS.has(input.platform)) {
    return null;
  }
  const platform = input.platform as UiPlatform;

  if (typeof input.surface !== 'string' || !VALID_SURFACES.has(input.surface)) {
    return null;
  }
  const surface = input.surface as 'browser' | 'app';

  if (typeof input.colorScheme !== 'string' || !VALID_COLOR_SCHEMES.has(input.colorScheme)) {
    return null;
  }
  const colorScheme = input.colorScheme as 'light' | 'dark';

  if (typeof input.safeAreaOwner !== 'string' || !VALID_SAFE_AREA_OWNERS.has(input.safeAreaOwner)) {
    return null;
  }
  const safeAreaOwner = input.safeAreaOwner as 'native' | 'web';

  // 3. 布尔标记校验
  if (typeof input.reduceMotion !== 'boolean') {
    return null;
  }
  const reduceMotion = input.reduceMotion;

  if (typeof input.reduceTransparency !== 'boolean') {
    return null;
  }
  const reduceTransparency = input.reduceTransparency;

  // 4. 字号校验（必须包含全部 4 个语义字号，且全为大于 0 的有限数字）
  if (!isRecord(input.textSizes)) {
    return null;
  }
  const textSizesObj = input.textSizes;
  for (const role of TEXT_ROLES) {
    if (!isValidPositiveNumber(textSizesObj[role])) {
      return null;
    }
  }
  const textSizes: Record<TextRole, number> = {
    body: textSizesObj.body as number,
    caption: textSizesObj.caption as number,
    navTitle: textSizesObj.navTitle as number,
    displayTitle: textSizesObj.displayTitle as number,
  };

  // 5. 能力集校验
  if (!isRecord(input.capabilities)) {
    return null;
  }
  if (
    typeof input.capabilities.haptics !== 'boolean' ||
    typeof input.capabilities.nativeBack !== 'boolean'
  ) {
    return null;
  }
  const capabilities = {
    haptics: input.capabilities.haptics,
    nativeBack: input.capabilities.nativeBack,
  };

  if (input.keyboardInset !== undefined &&
      (typeof input.keyboardInset !== 'number' || !Number.isFinite(input.keyboardInset) || input.keyboardInset < 0)) {
    return null;
  }

  return {
    v: 1,
    platform,
    surface,
    colorScheme,
    textSizes,
    safeAreaOwner,
    reduceMotion,
    reduceTransparency,
    capabilities,
    ...(input.keyboardInset !== undefined ? { keyboardInset: input.keyboardInset as number } : {}),
  };
}

/**
 * 获取浏览器默认运行环境（桥接尚未建立或纯 Web 环境回退）
 */
export function getBrowserDefaultRuntime(): NativeRuntime {
  let platform: UiPlatform = 'web';
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      platform = 'ios';
    } else if (/Android/i.test(ua)) {
      platform = 'android';
    }
  }

  const isDarkMode =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 遵循 iOS 规范的字号基准（iOS: 17/13/17/28；其他: 16/12/18/22）
  const textSizes: Record<TextRole, number> =
    platform === 'ios'
      ? { body: 17, caption: 13, navTitle: 17, displayTitle: 28 }
      : { body: 16, caption: 12, navTitle: 18, displayTitle: 22 };

  // 检查是否在 Flutter 宿主内（但未推送自定义 runtime）
  const hasFlutterBridge =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { flutterShellBridge?: unknown }).flutterShellBridge ||
        (window as unknown as { FlutterBridge?: unknown }).FlutterBridge ||
        (window as unknown as { __isFlutterApp?: boolean }).__isFlutterApp,
    );

  return {
    v: 1,
    platform,
    surface: hasFlutterBridge ? 'app' : 'browser',
    colorScheme: isDarkMode ? 'dark' : 'light',
    textSizes,
    safeAreaOwner: hasFlutterBridge ? 'native' : 'web',
    reduceMotion: Boolean(reduceMotion),
    reduceTransparency: false,
    capabilities: {
      haptics: hasFlutterBridge,
      nativeBack: hasFlutterBridge,
    },
  };
}

// 扩展全局类型支持 Flutter 通道注入
declare global {
  interface Window {
    flutterShellBridge?: {
      postMessage: (message: string) => void;
    };
    FlutterBridge?: {
      postMessage: (message: string) => void;
    };
    flutter_inappwebview?: {
      callHandler: (handlerName: string, ...args: unknown[]) => Promise<unknown>;
    };
    __dispatchNativeRuntime?: (jsonStringOrObj: unknown) => void;
    __dispatchNativeBack?: () => boolean;
    __handleNativeBack?: () => boolean;
    __NATIVE_RUNTIME__?: unknown;
    __isFlutterApp?: boolean;
  }
}

/**
 * 向 Flutter 宿主发送消息
 */
export function postToNative(message: WebToNativeMessage): boolean {
  if (typeof window === 'undefined') return false;

  const payload = JSON.stringify(message);

  try {
    if (window.flutterShellBridge?.postMessage) {
      window.flutterShellBridge.postMessage(payload);
      return true;
    }
    if (window.FlutterBridge?.postMessage) {
      window.FlutterBridge.postMessage(payload);
      return true;
    }
    if (window.flutter_inappwebview?.callHandler) {
      void window.flutter_inappwebview.callHandler('flutterShellBridge', payload);
      return true;
    }
  } catch (err) {
    console.warn('[NativeBridge] Failed to post message to native host:', err);
  }

  return false;
}

/**
 * 触发轻触反馈（Haptic Feedback）
 */
export function triggerHaptic(feedback: HapticFeedbackType = 'light'): void {
  // 1. 尝试通知原生宿主
  const sent = postToNative({ type: 'haptic', feedback });

  // 2. 网页降级回退（如果支持 navigator.vibrate 且非原生壳）
  if (!sent && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    switch (feedback) {
      case 'light':
      case 'selection':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(20);
        break;
      case 'heavy':
      case 'error':
        navigator.vibrate([30, 20, 30]);
        break;
      case 'warning':
        navigator.vibrate([20, 10, 20]);
        break;
      case 'success':
        navigator.vibrate([15, 15]);
        break;
    }
  }
}

type RuntimeListener = (runtime: NativeRuntime) => void;
type BackListener = () => boolean;

const runtimeListeners = new Set<RuntimeListener>();
const backListeners = new Set<BackListener>();
let bridgeInitialized = false;

function ensureBridgeListeners(): void {
  if (typeof window === 'undefined' || bridgeInitialized) return;
  bridgeInitialized = true;

  // 暴露全局钩子给宿主直接调用 evaluateJavascript
  window.__dispatchNativeRuntime = (payload: unknown) => {
    let parsed: NativeRuntime | null = null;
    if (typeof payload === 'string') {
      try {
        parsed = parseNativeRuntime(JSON.parse(payload));
      } catch {
        parsed = null;
      }
    } else {
      parsed = parseNativeRuntime(payload);
    }

    if (parsed) {
      for (const listener of runtimeListeners) {
        listener(parsed);
      }
    }
  };

  window.__dispatchNativeBack = (): boolean => {
    let consumed = false;
    for (const listener of backListeners) {
      if (listener()) {
        consumed = true;
        break;
      }
    }
    postToNative({
      type: 'back-consumed',
      action: consumed ? 'handled' : 'unhandled',
    });
    return consumed;
  };

  window.__handleNativeBack = window.__dispatchNativeBack;

  // 监听 Flutter WebShellBridge 发送的 nativeRuntimeChange 自定义事件
  window.addEventListener('nativeRuntimeChange', ((event: CustomEvent) => {
    if (event?.detail) {
      window.__dispatchNativeRuntime?.(event.detail);
    }
  }) as EventListener);

  // 如果宿主在监听器绑定前已注入 __NATIVE_RUNTIME__，立即同步
  if (window.__NATIVE_RUNTIME__) {
    window.__dispatchNativeRuntime?.(window.__NATIVE_RUNTIME__);
  }

  // 监听原生通过 postMessage 传来的消息
  window.addEventListener('message', (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data && data.type === 'runtime-update' && data.payload) {
        window.__dispatchNativeRuntime?.(data.payload);
      } else if (data && data.type === 'system-back') {
        window.__dispatchNativeBack?.();
      }
    } catch {
      // 忽略无法解析的消息
    }
  });
}

/**
 * 订阅宿主运行时更新
 */
export function subscribeNativeRuntime(listener: RuntimeListener): () => void {
  ensureBridgeListeners();
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

/**
 * 订阅原生物理/手势返回事件
 * 回调返回 true 表示已消费该返回事件，阻止宿主默认退出
 */
export function subscribeNativeBack(listener: BackListener): () => void {
  ensureBridgeListeners();
  backListeners.add(listener);
  return () => {
    backListeners.delete(listener);
  };
}
