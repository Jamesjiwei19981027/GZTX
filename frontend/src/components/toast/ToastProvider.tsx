/**
 * 轻量 Toast 体系（Context + Portal，无第三方依赖）。
 * - success / error / info 三态，自动消失
 * - action toast：带「撤销」等操作按钮，5 秒倒计时后消失
 * 用法：const toast = useToast(); toast.success('已保存')
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type ToastKind = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onAction: () => void | Promise<void>;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** 操作型 toast（如「撤销」）；带 5 秒倒计时 */
  action?: ToastAction;
  /** 剩余秒数（仅 action toast 显示） */
  secondsLeft?: number;
}

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** 带操作按钮的 toast（默认 5 秒倒计时，常用于撤销） */
  action: (message: string, action: ToastAction, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 3500;
const ACTION_DURATION_MS = 5000;

const KIND_STYLES: Record<ToastKind, { icon: string; iconClass: string }> = {
  success: { icon: 'check_circle', iconClass: 'text-emerald-400' },
  error: { icon: 'warning', iconClass: 'text-red-400' },
  info: { icon: 'info', iconClass: 'text-sky-400' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const intervalsRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    const interval = intervalsRef.current.get(id);
    if (interval) {
      clearInterval(interval);
      intervalsRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, action?: ToastAction) => {
      const id = ++idRef.current;
      const duration = action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS;
      setToasts((prev) => [
        // 最多同屏 4 条，旧的先顶掉
        ...prev.slice(-3),
        { id, kind, message, action, secondsLeft: action ? duration / 1000 : undefined },
      ]);
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      if (action) {
        intervalsRef.current.set(
          id,
          setInterval(() => {
            setToasts((prev) =>
              prev.map((t) =>
                t.id === id && t.secondsLeft != null
                  ? { ...t, secondsLeft: Math.max(0, t.secondsLeft - 1) }
                  : t,
              ),
            );
          }, 1000),
        );
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    const intervals = intervalsRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      intervals.forEach((t) => clearInterval(t));
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
      action: (message, action, kind = 'info') => push(kind, message, action),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[110] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-lg"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              data-testid="toast"
              className="pointer-events-auto w-full sm:w-auto sm:min-w-[320px] max-w-full bg-slate-900/95 dark:bg-black/95 text-white rounded-2xl shadow-2xl border border-white/10 backdrop-blur-md px-4 py-3 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <span
                className={`material-symbols-outlined text-xl shrink-0 ${KIND_STYLES[t.kind].iconClass}`}
              >
                {KIND_STYLES[t.kind].icon}
              </span>
              <span className="flex-1 min-w-0 font-medium leading-snug break-words">
                {t.message}
              </span>
              {t.action && (
                <button
                  data-testid="toast-action"
                  onClick={() => {
                    dismiss(t.id);
                    void t.action!.onAction();
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/30 text-xs font-bold transition-colors"
                >
                  {t.action.label}
                  {t.secondsLeft != null && (
                    <span className="ml-1 opacity-70 tabular-nums">({t.secondsLeft}s)</span>
                  )}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="关闭"
                className="shrink-0 p-1 rounded-full hover:bg-white/15 text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
