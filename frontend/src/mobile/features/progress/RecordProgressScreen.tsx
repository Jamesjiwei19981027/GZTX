import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Project } from '../../../types';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { AppIcon } from '../../ui/AppIcon';
import { saveProgressNoteAsDraft } from '../../../api/manage';
import { submitEvidence, getTreeNode, getProjectTree, BackendTreeNode } from '../../../api/backend';
import { uploadEvidenceFile } from '../../../api/projectWiki';
import { inferEvidenceKind } from '../../../utils/evidenceFiles';
import { createPersonalKnowledgeEntry } from '../../../api/personalKnowledge';
import { effectiveNodeId, suggestRecordProgress, saveRecordProgress, resolveSuggestedTarget, RecordProgressTarget, RecordProgressSuggestResponse } from '../../../api/recordProgress';

export interface UploadedFileItem {
  file_id: number;
  name: string;
  type: string;
  sizeStr: string;
}

export interface RecordProgressProps {
  projectId?: string;
  companyId?: number | null;
  nodeId?: string;
  initialTarget?: RecordProgressTarget;
  currentUser: UserProfile;
  projects?: Project[];
  onBack?: () => void;
  onSaved?: (target: RecordProgressTarget) => void;
  /** 存为汇报草稿后，点「去我的汇报查看」时跳转到我的汇报 */
  onViewReports?: () => void;
  isModal?: boolean;
}

const TARGET_LABELS: Record<RecordProgressTarget, string> = {
  report_draft: '汇报草稿',
  evidence: '证据材料',
  knowledge: '个人知识',
};

const TARGET_DESCRIPTIONS: Record<RecordProgressTarget, string> = {
  report_draft: '适合向上级或团队同步工作进展，进入 AI 汇报草稿与对话',
  evidence: '适合作为具体事项的交付证明与工作事实凭证',
  knowledge: '适合沉淀为个人工作方法、学习心得、备忘笔记与通用资料',
};

export const RecordProgressScreen: React.FC<RecordProgressProps> = ({
  projectId: propProjectId,
  companyId,
  nodeId: propNodeId,
  initialTarget,
  currentUser,
  projects = [],
  onBack,
  onSaved,
  onViewReports,
  isModal = false,
}) => {
  // 项目选择：若传入了则采用，否则优先第一个具体项目
  const defaultPid =
    propProjectId && propProjectId !== 'all' && Number(propProjectId) > 0
      ? propProjectId
      : projects.find((p) => p.id !== 'all' && Number(p.id) > 0)?.id || '1';

  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultPid);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(propNodeId || '');
  const [text, setText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [suggestResult, setSuggestResult] = useState<RecordProgressSuggestResponse | null>(null);
  const [chosenTarget, setChosenTarget] = useState<RecordProgressTarget>(initialTarget || 'report_draft');
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  // 事项树与列表
  const [nodeList, setNodeList] = useState<{ id: string; name: string }[]>([]);
  const [nodeLoading, setNodeLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  // 加载项目的事项节点
  useEffect(() => {
    const pidNum = Number(selectedProjectId);
    if (!pidNum || isNaN(pidNum)) return;
    setNodeLoading(true);

    const flattenNodes = (nodes: BackendTreeNode[]): { id: string; name: string }[] => {
      const list: { id: string; name: string }[] = [];
      const traverse = (item: BackendTreeNode) => {
        if (item.id != null) {
          list.push({ id: String(item.id), name: item.title || `事项 #${item.id}` });
        }
        if (item.children && Array.isArray(item.children)) {
          item.children.forEach(traverse);
        }
      };
      nodes.forEach(traverse);
      return list;
    };

    getProjectTree(pidNum)
      .then((res) => {
        if (!active.current) return;
        const flat = flattenNodes(res.nodes || []);
        setNodeList(flat);
      })
      .catch(() => {
        if (!active.current) return;
        setNodeList([]);
      })
      .finally(() => {
        if (active.current) setNodeLoading(false);
      });
  }, [selectedProjectId]);

  // 如果初始带有 nodeId 但没有在列表中，查单个节点补充名称
  useEffect(() => {
    if (propNodeId && !nodeList.some((n) => n.id === propNodeId)) {
      getTreeNode(Number(propNodeId))
        .then((res) => {
          if (!active.current) return;
          if (res && res.id != null) {
            setNodeList((prev) =>
              prev.some((n) => n.id === String(res.id))
                ? prev
                : [{ id: String(res.id), name: res.title || `事项 #${res.id}` }, ...prev]
            );
          }
        })
        .catch(() => {});
    }
  }, [propNodeId, nodeList]);

  // 处理文件上传
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from<File>(e.currentTarget.files || []);
    if (!files.length || uploading || submitting) return;

    setUploading(true);
    setError(null);
    try {
      const pid = selectedProjectId || '1';
      for (const file of files) {
        if (!active.current) return;
        const res = await uploadEvidenceFile(file, companyId, pid);
        if (!active.current) return;
        const sizeStr =
          file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.max(1, Math.round(file.size / 1024))} KB`;
        setUploadedFiles((prev) => [
          ...prev,
          { file_id: res.file_id, name: file.name, type: file.type, sizeStr },
        ]);
      }
      setToastMessage('文件上传成功');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '文件上传失败，请重试');
    } finally {
      if (active.current) {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (fileId: number) => {
    setUploadedFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  };

  // 下一步：调用 suggest 获取推荐去向
  const handleNextStep = async () => {
    if (!text.trim()) {
      setError('请填写进展内容');
      return;
    }
    setError(null);
    setSuggesting(true);

    try {
      const pidNum = Number(selectedProjectId) || null;
      const nidNum = selectedNodeId ? Number(selectedNodeId) : null;
      const res = await suggestRecordProgress({
        text: text.trim(),
        has_attachments: uploadedFiles.length > 0,
        project_id: pidNum,
        node_id: nidNum,
      });

      if (!active.current) return;
      const resolved = resolveSuggestedTarget(res, initialTarget);
      setSuggestResult(resolved);
      setChosenTarget(resolved.target);
      setStep('confirm');
    } catch (err) {
      if (!active.current) return;
      // 接口调用异常时兜底使用汇报草稿
      const fallbackTarget: RecordProgressTarget = initialTarget || 'report_draft';
      setSuggestResult({
        target: fallbackTarget,
        reason: '智能服务暂时不可用，默认建议存为' + TARGET_LABELS[fallbackTarget],
        source: 'rule',
      });
      setChosenTarget(fallbackTarget);
      setStep('confirm');
    } finally {
      if (active.current) setSuggesting(false);
    }
  };

  // 确认保存
  const handleConfirmSave = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const pidNum = Number(selectedProjectId) || 1;
      const cidNum = companyId || 1;

      const message = await saveRecordProgress(
        chosenTarget,
        {
          text,
          companyId: cidNum,
          projectId: pidNum,
          nodeId: effectiveNodeId(selectedNodeId, nodeList.map((n) => n.id), !nodeLoading),
          fileIds: uploadedFiles.map((f) => f.file_id),
          evidenceKind: inferEvidenceKind(uploadedFiles),
        },
        {
          saveReportDraft: (pid, body, fileIds) => saveProgressNoteAsDraft(pid, body, fileIds),
          submitEvidence: (id, body) => submitEvidence(id, body),
          createKnowledgeEntry: (pid, body) => createPersonalKnowledgeEntry(pid, body),
        },
      );
      setToastMessage(message);
      const saved = chosenTarget;
      if (saved === 'report_draft') {
        // 汇报草稿不自动关闭：给出「去我的汇报查看」入口，让用户确认草稿真的存进去了
        setDraftSaved(true);
        setSubmitting(false);
        return;
      }
      setTimeout(() => {
        if (!active.current) return;
        onSaved?.(saved);
        onBack?.();
      }, 1200);
    } catch (err) {
      if (!active.current) return;
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="record-progress-screen"
      className={`flex flex-col flex-1 h-full w-full bg-surface-container-lowest dark:bg-surface-container select-none overflow-hidden ${
        isModal ? 'rounded-xl' : ''
      }`}
    >
      {!isModal && (
        <MobileTopBar
          title="记录进展"
          showBack={Boolean(onBack)}
          onBack={onBack}
          backLabel="返回"
        />
      )}

      {isModal && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant dark:border-outline-variant">
          <h2 className="text-lg font-medium text-on-surface dark:text-on-surface tabular-nums">记录进展</h2>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="关闭"
              className="p-1 rounded-lg hover:bg-surface-container dark:hover:bg-surface-container-lowest text-on-surface-variant"
            >
              <AppIcon name="close" size={18} />
            </button>
          )}
        </div>
      )}

      {toastMessage && (
        <div
          role="status"
          data-testid="record-progress-toast"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#2f7d4f] text-on-primary rounded-xl shadow-sm dark:shadow-none text-sm font-medium flex items-center gap-2 animate-fade-in tabular-nums"
        >
          <AppIcon name="check" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
        {draftSaved && (
          <div
            role="status"
            data-testid="record-progress-draft-saved"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest dark:bg-surface-container p-4 space-y-3 text-[#2f7d4f]"
          >
            <p className="text-sm font-normal tabular-nums">已存为汇报草稿</p>
            <p className="text-xs">这条记录已加入你在该项目的汇报草稿，可以在「我的汇报」里继续编辑和提交。</p>
            <div className="flex gap-3">
              <button
                type="button"
                data-testid="record-progress-view-reports"
                className="min-h-11 px-4 rounded-lg bg-[#2f7d4f] text-on-primary text-sm font-medium tabular-nums"
                onClick={() => {
                  onSaved?.('report_draft');
                  if (onViewReports) onViewReports();
                  else onBack?.();
                }}
              >
                去我的汇报查看
              </button>
              <button type="button" className="min-h-11 px-4 rounded-lg border border-outline-variant text-sm" onClick={() => { onSaved?.('report_draft'); onBack?.(); }}>
                关闭
              </button>
            </div>
          </div>
        )}
        {error && (
          <div
            role="alert"
            data-testid="record-progress-error"
            className="p-3 bg-error-container dark:bg-error border border-outline-variant dark:border-outline-variant text-error dark:text-error text-sm rounded-xl"
          >
            {error}
          </div>
        )}

        {/* 关联项目与事项 */}
        <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-4 shadow-sm dark:shadow-none border border-outline-variant dark:border-outline-variant space-y-3">
          <div className="text-xs font-medium text-on-surface-variant dark:text-outline tabular-nums">
            上下文归属（可选）
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 项目选择 */}
            {projects.length > 0 && (
              <div>
                <label className="block text-xs text-on-surface-variant dark:text-outline mb-1">
                  所属项目
                </label>
                <select
                  aria-label="选择所属项目"
                  value={selectedProjectId}
                  onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedNodeId(''); setNodeList([]); }}
                  disabled={submitting || suggesting}
                  className="w-full text-sm rounded-lg border border-outline-variant dark:border-outline-variant bg-surface dark:bg-surface-container-lowest px-3 py-2 text-on-surface dark:text-on-surface outline-hidden"
                >
                  {projects
                    .filter((p) => p.id !== 'all')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* 关联事项 */}
            <div>
              <label className="block text-xs text-on-surface-variant dark:text-outline mb-1">
                关联责任事项（选证据材料时必填）
              </label>
              <select
                aria-label="选择关联事项"
                value={selectedNodeId}
                onChange={(e) => setSelectedNodeId(e.target.value)}
                disabled={submitting || suggesting || nodeLoading}
                className="w-full text-sm rounded-lg border border-outline-variant dark:border-outline-variant bg-surface dark:bg-surface-container-lowest px-3 py-2 text-on-surface dark:text-on-surface outline-hidden"
              >
                <option value="">（不关联具体事项）</option>
                {nodeList.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 进展多行文本输入 */}
        <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-4 shadow-sm dark:shadow-none border border-outline-variant dark:border-outline-variant space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="progress-content-input"
              className="text-xs font-medium text-on-surface-variant dark:text-outline tabular-nums"
            >
              进展与事实内容
            </label>
            <span className="text-xs text-outline">{text.length} 字</span>
          </div>
          <textarea
            id="progress-content-input"
            aria-label="进展与事实内容"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting || suggesting}
            placeholder="写下最新的工作进展、交付成果、测试结果、心得记录或备忘…"
            rows={5}
            className="w-full rounded-lg border border-outline-variant dark:border-outline-variant bg-surface dark:bg-surface-container-lowest p-3 text-sm text-on-surface dark:text-on-surface outline-hidden resize-none placeholder:text-outline"
          />
        </div>

        {/* 附件上传 */}
        <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-4 shadow-sm dark:shadow-none border border-outline-variant dark:border-outline-variant space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant dark:text-outline tabular-nums">
              附件资料（可选）
            </span>
            <button
              type="button"
              disabled={uploading || submitting || suggesting}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <AppIcon name="add" size={18} />
              <span>{uploading ? '正在上传…' : '添加附件'}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />
          </div>

          {uploadedFiles.length > 0 ? (
            <div className="space-y-2">
              {uploadedFiles.map((f) => (
                <div
                  key={f.file_id}
                  className="flex items-center justify-between p-2  bg-surface  border-b border-outline-variant dark:border-outline-variant text-xs text-on-surface dark:text-outline"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AppIcon name="folder" size={18} />
                    <span className="truncate">{f.name}</span>
                    <span className="text-outline">({f.sizeStr})</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`移除附件 ${f.name}`}
                    disabled={submitting || suggesting}
                    onClick={() => handleRemoveFile(f.file_id)}
                    className="p-1 text-outline hover:text-error cursor-pointer"
                  >
                    <AppIcon name="close" size={18} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-outline ">未附加文件</div>
          )}
        </div>

        {/* 确认与建议区域（点击“下一步”后展开或直接显示） */}
        {step === 'confirm' && (
          <div
            data-testid="record-progress-suggestion-card"
            className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-4 border border-primary dark:border-primary space-y-3"
          >
            {suggestResult && (
              <div className="text-sm text-primary dark:text-primary font-medium tabular-nums">
                建议存为：
                <span className="font-medium underline decoration-blue-500 underline-offset-2 ml-1 tabular-nums">
                  {TARGET_LABELS[suggestResult.target]}
                </span>
                <span className="text-xs text-primary dark:text-primary ml-2">
                  （{suggestResult.reason}）
                </span>
              </div>
            )}

            <div className="text-xs text-on-surface-variant dark:text-outline">
              请确认或改选去向：
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['report_draft', 'evidence', 'knowledge'] as const).map((tgt) => {
                const isSelected = chosenTarget === tgt;
                return (
                  <button
                    key={tgt}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-testid={`target-option-${tgt}`}
                    onClick={() => setChosenTarget(tgt)}
                    disabled={submitting}
                    className={`p-3 rounded-lg border text-left transition-ink-colors cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-surface-container-lowest dark:bg-surface-container-lowest shadow-sm dark:shadow-none ring-2 ring-primary/20'
                        : 'border-outline-variant dark:border-outline-variant bg-surface-container-lowest/70 dark:bg-surface-container-lowest/60 hover:border-outline-variant'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-sm font-medium ${
                          isSelected ? 'text-primary' : 'text-on-surface dark:text-outline'
                        }`}
                      >
                        {TARGET_LABELS[tgt]}
                      </span>
                      {isSelected && (
                        <span className="text-primary">
                          <AppIcon name="check" size={18} />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant dark:text-outline leading-snug">
                      {TARGET_DESCRIPTIONS[tgt]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 底部操作按钮 */}
        <div className="pt-2">
          {step === 'input' ? (
            <button
              type="button"
              data-testid="next-step-button"
              disabled={!text.trim() || uploading || suggesting}
              onClick={() => void handleNextStep()}
              className="w-full py-4 px-4 rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#004ca8] active:scale-[0.99] transition-ink-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer tabular-nums"
            >
              {suggesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>正在智能分析去向建议…</span>
                </>
              ) : (
                <span>下一步：分析建议</span>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setStep('input')}
                className="py-4 px-4 rounded-lg border border-outline-variant dark:border-outline-variant text-on-surface dark:text-outline text-sm font-medium hover:bg-surface-container dark:hover:bg-surface-container-lowest transition-ink-colors cursor-pointer tabular-nums"
              >
                返回修改
              </button>
              <button
                type="button"
                data-testid="confirm-save-button"
                disabled={submitting}
                onClick={() => void handleConfirmSave()}
                className="flex-1 py-4 px-4 rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#004ca8] active:scale-[0.99] transition-ink-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer tabular-nums"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>正在保存为{TARGET_LABELS[chosenTarget]}…</span>
                  </>
                ) : (
                  <span>确认存为{TARGET_LABELS[chosenTarget]}</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
