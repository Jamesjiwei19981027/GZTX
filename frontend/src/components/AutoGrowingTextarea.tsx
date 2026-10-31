import React, { useCallback, useLayoutEffect, useRef } from 'react';

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number };

/** Grows with wrapping, paste, drafts and font/width changes; long text scrolls inside. */
export function AutoGrowingTextarea({ rows = 1, maxRows = 8, value, style, onFocus, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(el);
    const lineHeight = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.5;
    const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
    const border = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
    const minimum = rows * lineHeight + padding + border;
    const maximum = Math.max(rows, maxRows) * lineHeight + padding + border;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minimum, Math.min(el.scrollHeight + border, maximum))}px`;
    el.style.overflowY = el.scrollHeight + border > maximum ? 'auto' : 'hidden';
    if (document.activeElement === el) {
      if (el.selectionEnd === el.value.length) el.scrollTop = el.scrollHeight;
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [rows, maxRows]);

  useLayoutEffect(resize, [value, resize]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = -1;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; resize(); }
    });
    observer.observe(el);
    void document.fonts?.ready.then(resize);
    return () => observer.disconnect();
  }, [resize]);

  return <textarea {...props} ref={ref} rows={rows} value={value}
    style={{ ...style, resize: 'none', boxSizing: 'border-box' }}
    onFocus={event => { resize(); onFocus?.(event); }} />;
}
