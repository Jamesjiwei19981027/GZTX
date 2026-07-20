import { useRef, useState } from 'react'
import { message } from 'antd'
import {
  listNodeEvidence,
  submitEvidence,
  uploadEvidenceFile,
  getNodeProgress,
} from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import type { EvidencePackageDTO, ProgressRecordDTO, TreeNodeDTO } from '@/types/collab'

export type EvidencePanelProps = {
  node: TreeNodeDTO
  companyId: number
  projectId: number
  progressRecords: ProgressRecordDTO[]
  evidenceList: EvidencePackageDTO[]
  onAfterSubmit?: (updated: {
    progressRecords: ProgressRecordDTO[]
    evidenceList: EvidencePackageDTO[]
    progress_json: TreeNodeDTO['progress_json']
  }) => void
}

function statusLabel(pj: TreeNodeDTO['progress_json']) {
  if (!pj) return '-'
  if (pj.template === 'work_item') return `${pj.status || '-'} ${pj.percent ?? 0}%`
  return pj.status || pj.template
}

export default function EvidencePanel({
  node,
  companyId,
  projectId,
  progressRecords,
  evidenceList,
  onAfterSubmit,
}: EvidencePanelProps) {
  const [evidenceText, setEvidenceText] = useState('')
  const [evidencePercent, setEvidencePercent] = useState(80)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFileIds, setPendingFileIds] = useState<number[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPickFile(file: File | null) {
    if (!file) return
    setUploading(true)
    try {
      if (!companyId) {
        message.error('缺少公司上下文，请先在项目列表选择公司')
        return
      }
      const res = await uploadEvidenceFile(file, {
        company_id: companyId,
        project_id: projectId,
      })
      setPendingFileIds((prev) => [...prev, res.file_id])
      message.success(`已上传：${res.original_name}`)
    } catch (e) {
      message.error(getErrorMessage(e, '上传失败'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onSubmitEvidence() {
    setSubmitting(true)
    try {
      const res = await submitEvidence(node.id, {
        summary_text: evidenceText || '进度更新',
        structured: {
          percent: evidencePercent,
          status: evidencePercent >= 100 ? 'done' : 'in_progress',
        },
        file_ids: [...pendingFileIds],
      })
      message.success(`材料已提交：${res.status}`)
      setEvidenceText('')
      setPendingFileIds([])
      const p = await getNodeProgress(node.id)
      const ev = await listNodeEvidence(node.id)
      onAfterSubmit?.({
        progressRecords: p.recent_records || [],
        evidenceList: ev.items || [],
        progress_json: p.progress_json,
      })
    } catch (e) {
      message.error(getErrorMessage(e, '提交材料失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{node.title}</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          {node.node_type_key} · 进度 {statusLabel(node.progress_json)}
        </p>
      </div>

      <section className="p-4 rounded-2xl border border-surface-variant bg-surface">
        <h3 className="font-medium mb-3">提交材料</h3>
        <textarea
          value={evidenceText}
          onChange={(e) => setEvidenceText(e.target.value)}
          rows={3}
          className="w-full border rounded-xl px-3 py-2 text-sm mb-2 bg-background border-surface-variant"
          placeholder="说明本次进展…"
        />
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm">完成度 %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={evidencePercent}
            onChange={(e) => setEvidencePercent(Number(e.target.value))}
            className="w-20 border rounded px-2 py-1 bg-background border-surface-variant"
          />
        </div>
        <div className="flex items-center gap-3 mb-3 text-sm">
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-on-surface-variant">
            {uploading ? '上传中…' : `已选文件 ${pendingFileIds.length} 个`}
          </span>
        </div>
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
          disabled={submitting}
          onClick={() => void onSubmitEvidence()}
        >
          {submitting ? '提交中…' : '提交并判定'}
        </button>
      </section>

      <section>
        <h3 className="font-medium mb-2">进度时间线</h3>
        {!progressRecords.length ? (
          <div className="text-sm text-on-surface-variant">暂无正式进度记录</div>
        ) : (
          <ul className="space-y-2">
            {progressRecords.map((r) => (
              <li
                key={r.id}
                className="text-sm p-3 rounded-xl bg-surface border border-surface-variant"
              >
                <div className="font-medium">
                  #{r.id} · {r.event_type} · {r.source}
                </div>
                <div className="text-on-surface-variant mt-1">{r.reason || ''}</div>
                <div className="text-xs mt-1">
                  状态：{r.after_json?.status} {r.after_json?.percent ?? ''}%
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-medium mb-2">材料包</h3>
        <ul className="space-y-2 text-sm">
          {evidenceList.map((e) => (
            <li key={e.id} className="p-3 rounded-xl border border-surface-variant">
              #{e.id} · {e.status} · {e.summary_text}
              {e.judge_result ? (
                <span className="text-xs text-on-surface-variant block mt-1">
                  {e.judge_result.decision}：{e.judge_result.reason}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
