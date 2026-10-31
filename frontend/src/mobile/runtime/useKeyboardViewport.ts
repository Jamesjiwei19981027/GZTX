import { useLayoutEffect, useRef, useState } from 'react';
import { parseNativeRuntime, subscribeNativeRuntime } from './nativeBridge';

/** Native overlay keyboard and browser visualViewport, in WebView CSS pixels. */
export function useKeyboardViewport() {
  const [visibleBottom, setVisibleBottom] = useState(() => window.innerHeight);
  useLayoutEffect(() => {
    let nativeInset = parseNativeRuntime(window.__NATIVE_RUNTIME__)?.keyboardInset ?? 0;
    const update = () => {
      const viewport = window.visualViewport;
      setVisibleBottom(Math.min(window.innerHeight - nativeInset,
        viewport ? viewport.height + viewport.offsetTop : window.innerHeight));
    };
    const unsubscribe = subscribeNativeRuntime(runtime => {
      nativeInset = runtime.keyboardInset ?? 0;
      update();
    });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    update();
    return () => {
      unsubscribe();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
  return { visibleBottom, bottomInset: Math.max(0, window.innerHeight - visibleBottom) };
}

/** Reserve only the covered part of a panel, preserving the full page viewport. */
export function useKeyboardAvoidance() {
  const ref = useRef<HTMLDivElement>(null);
  const { visibleBottom } = useKeyboardViewport();
  const [overlap, setOverlap] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverlap(Math.max(0, element.getBoundingClientRect().bottom - visibleBottom));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [visibleBottom]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && ref.current?.contains(focused)) {
        focused.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [overlap]);
  return { ref, overlap };
}
