import { useEffect, useState } from 'react'
import { Select } from 'antd'
import { message } from '@/utils/antdMessage'
import { agentChat, listAgents } from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import type { AgentDefinitionDTO, ChatMessage } from '@/types/collab'

export type AgentChatDrawerProps = {
  open: boolean
  onClose: () => void
  companyId: number
  projectId?: number | null
  nodeId?: number | null
  nodeTitle?: string
}

export default function AgentChatDrawer({
  open,
  onClose,
  companyId,
  projectId,
  nodeId,
  nodeTitle,
}: AgentChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<AgentDefinitionDTO[]>([])
  const [agentId, setAgentId] = useState<number | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)

  function buildHint(selectedId: number | null, list: AgentDefinitionDTO[]) {
    const selected = list.find((a) => a.id === selectedId)
    const hint = nodeTitle
      ? `当前节点「${nodeTitle}」。可聊进度、澄清需求；材料请走提交材料区。`
      : '可与助手澄清进度与任务。微信通道禁止交材料。'
    const agentHint = selected
      ? `当前智能体：${selected.name}（${selected.scene}）。`
      : '未选择智能体时使用默认助手。'
    return `${agentHint}${hint}`
  }

  useEffect(() => {
    if (!open) return
    setInput('')
    setMessages([{ role: 'system', content: buildHint(agentId, agents) }])
    void (async () => {
      if (!companyId) return
      setAgentsLoading(true)
      try {
        const data = await listAgents(companyId)
        const items = data?.items || []
        setAgents(items)
        setAgentId((prev) => {
          const next =
            prev && items.some((a) => a.id === prev) ? prev : items[0]?.id ?? null
          setMessages([{ role: 'system', content: buildHint(next, items) }])
          return next
        })
      } catch (e) {
        console.error(e)
        setAgents([])
      } finally {
        setAgentsLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/companyId 驱动重开抽屉
  }, [open, companyId, nodeTitle])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    if (!companyId) {
      message.warning('缺少公司 ID')
      return
    }
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, at: new Date().toISOString() },
    ])
    setInput('')
    setSending(true)
    try {
      const msg = nodeId ? `[node:${nodeId}] ${text}` : text
      const res = await agentChat({
        company_id: companyId,
        project_id: projectId ?? null,
        agent_definition_id: agentId,
        channel: 'web',
        message: msg,
      })
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.reply,
          at: new Date().toISOString(),
        },
      ])
    } catch (e) {
      message.error(getErrorMessage(e, '对话失败'))
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <aside className="w-full max-w-md h-full bg-surface shadow-xl flex flex-col border-l border-surface-variant">
        <header className="px-4 py-3 border-b border-surface-variant space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">智能体对话</h2>
              <p className="text-xs text-on-surface-variant">
                项目 #{projectId || '-'} · 节点 {nodeTitle || nodeId || '未选'}
              </p>
            </div>
            <button
              type="button"
              className="text-on-surface-variant hover:text-primary"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
          <Select
            className="w-full"
            loading={agentsLoading}
            placeholder="选择个人智能体"
            value={agentId ?? undefined}
            onChange={(v) => {
              setAgentId(v)
              setMessages([{ role: 'system', content: buildHint(v, agents) }])
            }}
            options={agents.map((a) => ({
              value: a.id,
              label: `${a.name}（${a.scene}）`,
            }))}
            allowClear
            onClear={() => {
              setAgentId(null)
              setMessages([{ role: 'system', content: buildHint(null, agents) }])
            }}
          />
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={[
                'text-sm rounded-xl px-3 py-2 max-w-[90%]',
                m.role === 'user'
                  ? 'ml-auto bg-primary text-white'
                  : m.role === 'system'
                    ? 'bg-surface-container-low text-on-surface-variant'
                    : 'bg-surface-container text-on-surface',
              ].join(' ')}
            >
              {m.content}
            </div>
          ))}
        </div>

        <footer className="p-3 border-t border-surface-variant flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 border border-surface-variant rounded-xl px-3 py-2 text-sm bg-background"
            placeholder="输入消息，Enter 发送"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
          />
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
            disabled={sending}
            onClick={() => void send()}
          >
            {sending ? '…' : '发送'}
          </button>
        </footer>
      </aside>
    </div>
  )
}
