/**
 * 移动端运行环境契约与类型定义
 * 严格遵循 APP V2 规范与 iOS 适配标准
 */

export type UiPlatform = 'web' | 'android' | 'ios';

export type TextRole = 'body' | 'caption' | 'navTitle' | 'displayTitle';

export type NativeRuntime = {
  v: 1;
  platform: UiPlatform;
  surface: 'browser' | 'app';
  colorScheme: 'light' | 'dark';
  textSizes: Record<TextRole, number>;
  safeAreaOwner: 'native' | 'web';
  reduceMotion: boolean;
  reduceTransparency: boolean;
  /** Keyboard overlap inside the native safe WebView area, in CSS pixels. */
  keyboardInset?: number;
  capabilities: {
    haptics: boolean;
    nativeBack: boolean;
  };
};

export type HapticFeedbackType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

export type NativeToWebMessage =
  | { type: 'runtime-update'; payload: NativeRuntime }
  | { type: 'system-back' };

export type WebToNativeMessage =
  | { type: 'haptic'; feedback: HapticFeedbackType }
  | { type: 'set-native-back-intercept'; enabled: boolean }
  | { type: 'runtime-request' }
  | { type: 'back-consumed'; action: string };
