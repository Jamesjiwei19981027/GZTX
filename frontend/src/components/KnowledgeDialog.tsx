import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOptionalMobileNavigation } from '../mobile/navigation/MobileNavigationProvider';
import { useKeyboardViewport } from '../mobile/runtime/useKeyboardViewport';
import './KnowledgeDialog.css';

export function KnowledgeDialog({ title, dirty = false, onClose, children }: {
  title: string; dirty?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const nav = useOptionalMobileNavigation();
  const openOverlay = nav?.openOverlay, unregisterOverlay = nav?.unregisterOverlay;
  const id = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const panel = useRef<HTMLDivElement>(null);
  const { visibleBottom } = useKeyboardViewport();
  const [discard, setDiscard] = useState(false);
  const requestClose = () => {
    if (nav) nav.goBack();
    else if (dirty) setDiscard(true);
    else closeRef.current();
  };
  const requestRef = useRef(requestClose); requestRef.current = requestClose;
  useEffect(() => {
    openOverlay?.({ id, type: 'dialog', title, dirty, onDismiss: () => closeRef.current() });
  }, [id, title, dirty, openOverlay]);
  useEffect(() => () => unregisterOverlay?.(id), [id, unregisterOverlay]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      const alert = panel.current?.querySelector<HTMLElement>('[role=alertdialog]');
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (alert) alert.querySelector<HTMLButtonElement>('button')?.click(); else requestRef.current(); }
      if (event.key !== 'Tab') return;
      const scope = alert || panel.current;
      const controls = [...(scope?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || [])].filter(el => el.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.current?.contains(active)) active.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [visibleBottom]);
  return createPortal(<div className="personal-knowledge knowledge-dialog-layer" style={{ height: visibleBottom }}>
    <div className="knowledge-dialog-shade" onClick={requestClose} aria-hidden="true" />
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="knowledge-dialog-panel">
      <header className="knowledge-dialog-header"><h2>{title}</h2><button type="button" aria-label="关闭" onClick={requestClose}>×</button></header>
      <div className="knowledge-dialog-content">{children}</div>
      {discard && <div className="knowledge-discard"><div role="alertdialog" aria-label="放弃未保存的笔记？"><h3>放弃未保存的笔记？</h3><p>关闭后会丢失本次修改。</p><button type="button" onClick={() => setDiscard(false)}>继续编辑</button><button type="button" onClick={() => closeRef.current()}>放弃修改</button></div></div>}
    </div>
  </div>, document.body);
}
