import React, { useEffect, useRef, useState } from 'react';
import { agentChat } from '../api/agents';
import { AutoGrowingTextarea } from './AutoGrowingTextarea';

/** Desktop entry to the same project-scoped personal agent used by the APP. */
export function ProjectAgentChat({ companyId, projectId, userId }: { companyId?: number | null; projectId?: string; userId?: string }) {
  return React.createElement(ChatScope, { key: `${companyId}:${projectId}:${userId}`, companyId, projectId });
}
function ChatScope({ companyId, projectId }: { companyId?: number | null; projectId?: string }) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = !!companyId && !!projectId && /^[1-9]\d*$/.test(projectId);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!valid || busy || !message) return;
    setBusy(true); setError('');
    try {
      const result = await agentChat({ company_id: companyId!, project_id: Number(projectId), message });
      if (alive.current) { setMessages(previous => [...previous, { role: '我', text: message }, { role: 'AI', text: result.reply }]); setText(''); }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : '发送失败，请重试');
    } finally { if (alive.current) setBusy(false); }
  }
  return <section id="project-agent-chat" aria-label="我的项目助手" className="rounded-xl border border-primary/20 bg-surface-container-lowest dark:bg-surface-container p-5 space-y-3">
    <h2 className="text-lg font-medium tabular-nums">我的项目助手</h2>
    <p className="text-sm text-on-surface-variant">告诉 AI 最新进展，或基于本人当前项目的知识提问。</p>
    {!valid && <p>请选择具体项目，项目之间的知识和对话保持隔离。</p>}
    <div aria-live="polite" className="space-y-2">{messages.map((item, index) => <p key={index} className="whitespace-pre-wrap"><strong className="font-medium">{item.role}：</strong>{item.text}</p>)}</div>
    <form onSubmit={send} className="space-y-2">
      <label className="block">告诉 AI 最新进展<AutoGrowingTextarea aria-label="助手消息" value={text} onChange={event => setText(event.target.value)} disabled={!valid || busy} rows={3} className="block w-full border border-outline-variant rounded-lg p-3 bg-surface text-on-surface" /></label>
      {error && <p role="alert" className="text-error">{error}</p>}
      <button type="submit" disabled={!valid || busy || !text.trim()} className="rounded-lg px-4 py-2 bg-primary text-on-primary disabled:opacity-50">{busy ? '正在发送…' : '发送给我的 AI'}</button>
    </form>
  </section>;
}
