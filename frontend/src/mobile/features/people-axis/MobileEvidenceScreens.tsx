import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile, AxisEvidence } from '../../../types';
import {
  submitEvidence,
  listNodeEvidence,
  getEvidencePackage,
  BackendEvidencePackage,
  getTreeNode,
  BackendTreeNode,
  listProjectMembers,
  BackendMember,
} from '../../../api/backend';
import { uploadEvidenceFile } from '../../../api/projectWiki';
import { inferEvidenceKind } from '../../../utils/evidenceFiles';
import { parseApiDateTime } from '../../../utils/datetime';
import { MaterialTextInput } from '../../../components/MaterialTextInput';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = parseApiDateTime(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
import {
  listDelegations,
  createDelegation,
  revokeDelegation,
  Delegation,
  DELEGATION_ACTIONS,
  DELEGATION_SCOPE_DESCRIPTION,
  delegationValidTo,
} from '../../../api/delegations';
import { runAxisAudit, getMyPermissions } from '../../../api/shell';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileField, MobileInput, MobileTextarea, MobileSwitch } from '../../ui/MobileField';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';
import { MobileConfirm } from '../../ui/MobileConfirm';

// ==========================================
// 类型定义与 Props
// ==========================================

export type EvidenceScreenMode =
  | 'submit'
  | 'detail'
  | 'progress'
  | 'delegations'
  | 'audit';

export interface MobileEvidenceScreensProps {
  mode?: EvidenceScreenMode;
  projectId: number | string;
  companyId: number | string | null;
  nodeId?: number | string;
  packageId?: number | string;
  currentUser: UserProfile;
  onBack?: () => void;
  onNavigateToPackage?: (pkgId: number) => void;
  onNavigateToWiki?: () => void;
}

interface UploadedFileItem {
  file_id: number;
  name: string;
  sizeStr: string;
  type?: string;
}

// ==========================================
// 主入口容器：MobileEvidenceScreens
// ==========================================

export const MobileEvidenceScreens: React.FC<MobileEvidenceScreensProps> = ({
  mode = 'submit',
  projectId,
  companyId,
  nodeId,
  packageId,
  currentUser,
  onBack,
  onNavigateToPackage,
  onNavigateToWiki,
}) => {
  const [currentMode, setCurrentMode] = useState<EvidenceScreenMode>(mode);
  const [selectedPackageId, setSelectedPackageId] = useState<number | undefined>(
    packageId ? Number(packageId) : undefined,
  );

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  useEffect(() => {
    if (packageId) setSelectedPackageId(Number(packageId));
  }, [packageId]);

  const handleOpenPackage = (pkgId: number) => {
    setSelectedPackageId(pkgId);
    setCurrentMode('detail');
    onNavigateToPackage?.(pkgId);
  };

  switch (currentMode) {
    case 'submit':
      return (
        <MobileEvidenceSubmitScreen
          projectId={Number(projectId)}
          companyId={companyId ? Number(companyId) : 1}
          nodeId={nodeId ? Number(nodeId) : undefined}
          currentUser={currentUser}
          onBack={onBack}
          onSubmitted={(pkgId) => {
            if (pkgId) handleOpenPackage(pkgId);
            else if (onBack) onBack();
          }}
        />
      );

    case 'detail':
      return (
        <MobileEvidencePackageDetailScreen
          projectId={Number(projectId)}
          packageId={selectedPackageId}
          nodeId={nodeId ? Number(nodeId) : undefined}
          currentUser={currentUser}
          onBack={() => {
            if (mode === 'detail' && onBack) onBack();
            else setCurrentMode('progress');
          }}
        />
      );

    case 'progress':
      return (
        <MobileProgressRecordScreen
          projectId={Number(projectId)}
          nodeId={nodeId ? Number(nodeId) : undefined}
          currentUser={currentUser}
          onBack={onBack}
          onOpenPackage={handleOpenPackage}
          onOpenSubmit={() => setCurrentMode('submit')}
        />
      );

    case 'delegations':
      return (
        <MobileDelegationsScreen
          projectId={Number(projectId)}
          companyId={companyId ? Number(companyId) : 1}
          currentUser={currentUser}
          onBack={onBack}
        />
      );

    case 'audit':
      return (
        <MobileAxisAuditScreen
          projectId={Number(projectId)}
          currentUser={currentUser}
          onBack={onBack}
          onOpenPackage={handleOpenPackage}
        />
      );

    default:
      return (
        <MobileEmptyState
          title="未知页面"
          description="所请求的材料或审计视图不存在"
          action={onBack ? { label: '返回', onClick: onBack, iconName: 'back' } : undefined}
        />
      );
  }
};

// ==========================================
// 1. 设计 ID 26：提交证据材料 (MobileEvidenceSubmitScreen)
// ==========================================

export interface MobileEvidenceSubmitScreenProps {
  projectId: number;
  companyId: number;
  nodeId?: number;
  currentUser: UserProfile;
  onBack?: () => void;
  onSubmitted?: (packageId?: number) => void;
}

export const MobileEvidenceSubmitScreen: React.FC<MobileEvidenceSubmitScreenProps> = (props) => (
  <EvidenceSubmitContent key={`${props.companyId}:${props.projectId}:${props.nodeId}:${props.currentUser.id}`} {...props} />
);

const EvidenceSubmitContent: React.FC<MobileEvidenceSubmitScreenProps> = ({
  projectId,
  companyId,
  nodeId,
  currentUser,
  onBack,
  onSubmitted,
}) => {
  const [nodeData, setNodeData] = useState<BackendTreeNode | null>(null);
  const [summary, setSummary] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  useEffect(() => {
    if (nodeId) {
      getTreeNode(nodeId)
        .then((data) => setNodeData(data))
        .catch(() => {});
    }
  }, [nodeId]);

  // 处理真实文件上传：调用 uploadEvidenceFile
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from<File>(e.currentTarget.files || []);
    if (!files.length || uploading || submitting) return;

    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        if (!active.current) return;
        const res = await uploadEvidenceFile(file, companyId, projectId);
        if (!active.current) return;
        const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
        setUploadedFiles((prev) => [...prev, { file_id: res.file_id, name: file.name, type: file.type, sizeStr }]);
      }
      setToastMessage('文件上传成功');
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '文件上传失败，请检查格式或文件大小');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (fileId: number) => {
    setUploadedFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setError('请填写材料说明');
      return;
    }
    if (voiceBusy || uploading || submitting) return;
    if (!nodeId) {
      setError('缺少关联的责任节点');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitEvidence(nodeId, {
        summary: summary.trim(),
        evidence_kind: inferEvidenceKind(uploadedFiles),
        file_ids: uploadedFiles.map((f) => f.file_id),
      });
      // 提交成功
      const created = res as { package_id?:number;id?:number };
      const createdId = created?.package_id || created?.id;
      if (active.current) onSubmitted?.(createdId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '提交证据材料失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e] select-none overflow-hidden">
      <MobileTopBar
        title="提交证据材料"
        showBack={Boolean(onBack)}
        onBack={onBack}
        backLabel="返回"
      />

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 mobile-scroll-container">
        {/* 当前责任事项信息卡片 */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {nodeData?.title || '当前责任事项'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {currentUser.name} · 当前责任事项材料提报
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-1.5 border border-red-200">
            <AppIcon name="alert" size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <MaterialTextInput value={summary} onChange={setSummary} companyId={companyId} projectId={projectId}
          scopeKey={`${companyId}:${projectId}:${nodeId}:${currentUser.id}`} disabled={submitting}
          onBusyChange={setVoiceBusy} />

        {/* 文件上传触发区 */}
        <input
          type="file"
          aria-label="材料附件"
          multiple
          disabled={uploading || submitting}
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <div
          onClick={() => {
            if (!uploading && fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
          className="border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer active:opacity-70 transition-opacity"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 flex items-center justify-center">
            <AppIcon name="file" size={20} />
          </div>
          <strong className="text-sm font-semibold text-[#0058BE] dark:text-blue-400">
            {uploading ? '正在上传文件…' : '选择文件'}
          </strong>
          <p className="text-[11px] text-slate-400 text-center">
            支持 PDF、Excel、Word、图片等格式，大小以服务端限制为准
          </p>
        </div>

        {/* 已上传文件列表 */}
        {uploadedFiles.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
            {uploadedFiles.map((file) => (
              <div key={file.file_id} className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AppIcon name="file" size={18} className="text-[#0058BE] shrink-0" />
                  <div className="min-w-0">
                    <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                      {file.name}
                    </strong>
                    <span className="text-[10px] text-slate-400">已上传 · {file.sizeStr}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={uploading || submitting}
                  onClick={() => handleRemoveFile(file.file_id)}
                  className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                  aria-label="删除文件"
                >
                  <AppIcon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-[#0058BE] dark:text-blue-300 flex items-center gap-2 border border-blue-100 dark:border-blue-900/50">
          <AppIcon name="info" size={16} className="shrink-0" />
          <span>文字可单独提交，也可附加文件。语音识别后可修改再提交，材料归属当前项目，供个人 AI 与汇报引用。</span>
        </div>

        <div className="pt-2 pb-6">
          <button
            type="submit"
            disabled={submitting || uploading || voiceBusy || !summary.trim()}
            className="w-full min-h-[48px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <AppIcon name="send" size={16} />
            <span>{submitting ? '正在提交材料…' : '提交材料'}</span>
          </button>
        </div>
      </form>

      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur-md animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 2. 设计 ID 27：证据包详情 (MobileEvidencePackageDetailScreen)
// ==========================================

export interface MobileEvidencePackageDetailScreenProps {
  projectId: number;
  packageId?: number;
  nodeId?: number;
  currentUser?: UserProfile;
  onBack?: () => void;
}

export const MobileEvidencePackageDetailScreen: React.FC<MobileEvidencePackageDetailScreenProps> = ({
  projectId,
  packageId,
  nodeId,
  currentUser,
  onBack,
}) => {
  const [detail, setDetail] = useState<BackendEvidencePackage | null>(null);
  const [nodeTitle, setNodeTitle] = useState<string>('');
  const [submitterName, setSubmitterName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    async function loadData() {
      try {
        let pkg: BackendEvidencePackage | null = null;
        if (packageId) {
          try {
            pkg = await getEvidencePackage(packageId);
          } catch {
            // fallback if getEvidencePackage fails
          }
        }

        const currentNodeId = nodeId || pkg?.node_id;
        if (!pkg && currentNodeId) {
          const listRes = await listNodeEvidence(currentNodeId).catch(() => null);
          if (listRes?.items?.length) {
            const found = packageId
              ? listRes.items.find((i) => i.id === packageId)
              : listRes.items[0];
            if (found) {
              try {
                pkg = await getEvidencePackage(found.id);
              } catch {
                pkg = found as BackendEvidencePackage;
              }
            }
          }
        }

        if (!active) return;
        setDetail(pkg);

        if (currentNodeId) {
          getTreeNode(currentNodeId)
            .then((n) => {
              if (active && n?.title) setNodeTitle(n.title);
            })
            .catch(() => {});
        }

        if (projectId) {
          listProjectMembers(projectId)
            .then((mRes) => {
              if (!active) return;
              const members = mRes?.items || [];
              const subId = pkg?.submitter_user_id;
              if (subId) {
                const foundMem = members.find((m) => m.user_id === subId);
                const memName = foundMem?.display_name || foundMem?.nickname || foundMem?.username;
                if (memName) {
                  setSubmitterName(memName);
                  return;
                }
              }
              // 只有提交人就是当前用户时才用当前用户姓名，不把别人的材料署成自己
              if (currentUser && subId != null && String(currentUser.id) === String(subId)) {
                setSubmitterName(currentUser.name || currentUser.username || '');
              }
            })
            .catch(() => {
              if (active && currentUser && pkg?.submitter_user_id != null && String(currentUser.id) === String(pkg.submitter_user_id)) {
                setSubmitterName(currentUser.name || currentUser.username || '');
              }
            });
        } else if (currentUser && pkg?.submitter_user_id != null && String(currentUser.id) === String(pkg.submitter_user_id)) {
          setSubmitterName(currentUser.name || currentUser.username || '');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [packageId, nodeId, projectId, currentUser]);

  if (loading) {
    return <MobileLoadingState message="正在加载证据包详情…" fullScreen />;
  }

  const statusMap: Record<string, string> = {
    adopted: '已采纳',
    submitted: '已提交',
    rejected: '已驳回',
    draft: '草稿',
    prechecking: '预检中',
  };
  const statusText = (detail?.status && statusMap[detail.status]) || detail?.status || '已提交';
  const version = detail?.version ?? (detail?.structured as any)?.version;
  const badgeText = version != null ? `${statusText} · 版本 ${version}` : statusText;

  const files = detail?.files || [];
  const rawDate = detail?.submitted_at || detail?.created_at;
  const formattedTime = formatDateTime(rawDate);
  const finalSubmitterName = submitterName || '提交人';

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e] select-none overflow-hidden">
      <MobileTopBar
        title="证据包详情"
        showBack={Boolean(onBack)}
        onBack={onBack}
        backLabel="返回"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4 mobile-scroll-container">
        {/* 状态徽标与标题 */}
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 mb-2">
            {badgeText}
          </span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
            {detail?.summary_text || '材料详情'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            提报人 · {finalSubmitterName}
            {formattedTime ? ` · ${formattedTime}` : ''}
          </p>
        </div>

        {/* 真实提交说明：没有说明就不显示这一块，不许编造 */}
        {Boolean(detail?.summary_text?.trim()) && (
          <section className="space-y-1.5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              提交说明
            </h2>
            <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed shadow-xs whitespace-pre-wrap">
              {detail?.summary_text}
            </div>
          </section>
        )}

        {/* 真实文件列表和数量：没有文件就不显示 */}
        {files.length > 0 && (
          <section className="space-y-1.5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              支撑文件 ({files.length})
            </h2>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
              {files.map((file, idx) => {
                const ext = file.original_name ? file.original_name.split('.').pop()?.toUpperCase() : 'FILE';
                const sizeStr = file.size_bytes
                  ? file.size_bytes < 1024 * 1024
                    ? `${Math.round(file.size_bytes / 1024)} KB`
                    : `${(file.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                  : '';
                return (
                  <div key={file.file_id || idx} className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AppIcon name="file" size={18} className="text-[#0058BE] shrink-0" />
                      <div className="min-w-0">
                        <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                          {file.original_name}
                        </strong>
                        <span className="text-[10px] text-slate-400">
                          {[ext, sizeStr].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 关联信息 */}
        {(nodeTitle || detail?.node_id || nodeId) && (
          <section className="space-y-1.5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              关联信息
            </h2>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs text-xs">
              <div className="p-3.5 flex items-center justify-between">
                <span className="text-slate-400">责任事项</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {nodeTitle || `责任事项 #${detail?.node_id || nodeId}`}
                </span>
              </div>
            </div>
          </section>
        )}

        {detail?.status !== 'adopted' && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-[#0058BE] dark:text-blue-300 flex items-center gap-2 border border-blue-100 dark:border-blue-900/50">
            <AppIcon name="info" size={16} className="shrink-0" />
            <span>材料提交后进入待验收状态，请等待授权负责人确认。</span>
          </div>
        )}

        <div className="pt-2 pb-6">
          <button
            type="button"
            onClick={() => {
              if (onBack) onBack();
            }}
            className="w-full min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 active:bg-slate-50 cursor-pointer"
          >
            <AppIcon name="back" size={16} />
            <span>返回材料列表</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. 设计 ID 28：进度与记录 (MobileProgressRecordScreen)
// ==========================================

export interface MobileProgressRecordScreenProps {
  projectId: number;
  nodeId?: number;
  currentUser: UserProfile;
  onBack?: () => void;
  onOpenPackage?: (pkgId: number) => void;
  onOpenSubmit?: () => void;
}

export const MobileProgressRecordScreen: React.FC<MobileProgressRecordScreenProps> = ({
  projectId,
  nodeId,
  currentUser,
  onBack,
  onOpenPackage,
  onOpenSubmit,
}) => {
  const [evidenceList, setEvidenceList] = useState<any[]>([]);

  useEffect(() => {
    if (nodeId) {
      listNodeEvidence(nodeId)
        .then((res) => setEvidenceList(res.items || []))
        .catch(() => {});
    }
  }, [nodeId]);
  return (
    <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e] select-none overflow-hidden">
      <MobileTopBar
        title="进度与记录"
        showBack={Boolean(onBack)}
        onBack={onBack}
        backLabel="返回"
        rightAction={
          onOpenSubmit ? (
            <button
              type="button"
              onClick={onOpenSubmit}
              className="mobile-touch-target p-2 text-[#0058BE] dark:text-blue-400 font-semibold text-xs active:opacity-60 cursor-pointer"
            >
              提交材料
            </button>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4 mobile-scroll-container">
        {/* 顶部进度指标卡片 */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              交互原型评审
            </h3>
            <span className="text-lg font-extrabold text-[#0058BE]">70%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-[#0058BE] rounded-full" style={{ width: '70%' }} />
          </div>
          <p className="text-xs text-slate-400">更新于今天 15:20 · 进行中</p>
        </div>

        {/* 进度记录时间轴 */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            进度记录
          </h2>
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-4">
            <div className="relative pl-6 pb-2 border-l-2 border-blue-200 dark:border-blue-900 last:border-l-0">
              <span className="absolute -left-[7px] top-0.5 w-3 h-3 rounded-full bg-[#0058BE] ring-4 ring-white dark:ring-slate-900" />
              <strong className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                今天 15:20 · 70%
              </strong>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                补齐员工端原型，管理者汇报入口待验收。
              </p>
            </div>

            <div className="relative pl-6 pb-2 border-l-2 border-blue-200 dark:border-blue-900 last:border-l-0">
              <span className="absolute -left-[7px] top-0.5 w-3 h-3 rounded-full bg-blue-300 dark:bg-blue-700 ring-4 ring-white dark:ring-slate-900" />
              <strong className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                昨天 17:40 · 40%
              </strong>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                基础任务流程已完成，附评审纪要。
              </p>
            </div>

            <div className="relative pl-6 last:border-l-0">
              <span className="absolute -left-[7px] top-0.5 w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700 ring-4 ring-white dark:ring-slate-900" />
              <strong className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                10 月 16 日 · 10%
              </strong>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                完成责任分工和交付范围确认。
              </p>
            </div>
          </div>
        </section>

        {/* 支撑材料 */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            支撑材料
          </h2>
          {evidenceList.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
              {evidenceList.map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => onOpenPackage?.(pkg.id)}
                  className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AppIcon name="file" size={18} className="text-[#0058BE] shrink-0" />
                    <div className="min-w-0">
                      <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                        {pkg.summary_text || `材料包 #${pkg.id}`}
                      </strong>
                      <span className="text-[10px] text-slate-400">
                        {pkg.submitted_at ? formatDateTime(pkg.submitted_at) : '已提交'}
                      </span>
                    </div>
                  </div>
                  <AppIcon name="chevron-right" size={16} className="text-slate-400" />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-400">
              暂无支撑材料
            </div>
          )}
        </section>

        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-[#0058BE] dark:text-blue-300 flex items-center gap-2 border border-blue-100 dark:border-blue-900/50">
          <AppIcon name="info" size={16} className="shrink-0" />
          <span>汇报中的完成描述需要与进度和材料对照。</span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. 设计 ID 29 & 88：委托授权与撤销 (MobileDelegationsScreen)
// ==========================================

export interface MobileDelegationsScreenProps {
  projectId: number;
  companyId: number;
  currentUser: UserProfile;
  onBack?: () => void;
}

export const MobileDelegationsScreen: React.FC<MobileDelegationsScreenProps> = ({
  projectId,
  companyId,
  currentUser,
  onBack,
}) => {
  const [tab, setTab] = useState<'list' | 'create'>('list');
  const [canManage, setCanManage] = useState(false);
  const [members, setMembers] = useState<BackendMember[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 表单状态
  const [granteeUserId, setGranteeUserId] = useState<number | ''>('');
  const [selectedActions, setSelectedActions] = useState<Record<string, boolean>>({
    'progress.read': true,
    'evidence.submit': false,
    'tree.edit_subtree': false,
  });
  const [validTo, setValidTo] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revokeTargetId, setRevokeTargetId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchDelegationsList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDelegations(companyId, projectId);
      setDelegations(res.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取委托列表失败');
    } finally {
      setLoading(false);
    }
  }, [companyId, projectId]);

  useEffect(() => {
    fetchDelegationsList();
  }, [fetchDelegationsList]);

  useEffect(() => {
    let active = true;
    setCanManage(false);
    setTab('list');
    setMembers([]);
    void Promise.all([getMyPermissions(projectId), listProjectMembers(projectId).catch(() => ({ items: [] }))]).then(([permissions, result]) => {
      if (active) {
        setCanManage(Boolean(permissions.is_pm || permissions.is_superadmin));
        setMembers(result.items || []);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [projectId, currentUser.id]);

  const handleToggleAction = (key: string) => {
    setSelectedActions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!granteeUserId) {
      setError('请选择被授权人');
      return;
    }
    const actions = Object.entries(selectedActions)
      .filter(([_, val]) => val)
      .map(([key]) => key);

    if (actions.length === 0) {
      setError('请至少选择一项授权动作');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createDelegation({
        company_id: companyId,
        project_id: projectId,
        grantee_user_id: Number(granteeUserId),
        actions,
        valid_to: delegationValidTo(validTo),
        reason: reason.trim() || undefined,
      });
      setToastMessage('授权创建成功');
      setTab('list');
      await fetchDelegationsList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建委托失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTargetId) return;
    try {
      await revokeDelegation(revokeTargetId);
      setRevokeTargetId(null);
      setToastMessage('委托已成功撤销');
      await fetchDelegationsList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '撤销委托失败');
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e] select-none overflow-hidden">
      <MobileTopBar
        title="委托授权"
        showBack={Boolean(onBack)}
        onBack={onBack}
        backLabel="返回"
      />

      <p className="px-4 py-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900">{DELEGATION_SCOPE_DESCRIPTION}</p>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 shrink-0">
        <button
          type="button"
          onClick={() => setTab('list')}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors cursor-pointer ${
            tab === 'list'
              ? 'border-[#0058BE] text-[#0058BE] dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500'
          }`}
        >
          我的授权
        </button>
        {canManage && <button
          type="button"
          onClick={() => setTab('create')}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors cursor-pointer ${
            tab === 'create'
              ? 'border-[#0058BE] text-[#0058BE] dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500'
          }`}
        >
          创建授权
        </button>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 mobile-scroll-container">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-1.5 border border-red-200">
            <AppIcon name="alert" size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {tab === 'list' ? (
          /* ========================================================= */
          /* 设计 ID 88：授权记录与撤销                               */
          /* ========================================================= */
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
              {delegations.length > 0 ? (
                delegations.map((d) => (
                  <div key={d.id} className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 font-bold flex items-center justify-center text-xs shrink-0">
                        {String(d.grantee_user_id)}
                      </div>
                      <div className="min-w-0">
                        <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                          {members.find(member => member.user_id === d.grantee_user_id)?.display_name || members.find(member => member.user_id === d.grantee_user_id)?.nickname || `用户 #${d.grantee_user_id}`} · 代为执行
                        </strong>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {d.actions.map(action => DELEGATION_ACTIONS.find(item => item.key === action)?.zh || action).join('、')} · 有效至 {d.valid_to ? d.valid_to.slice(0, 10) : '长期'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          d.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        {d.status === 'active' ? '生效中' : '已撤销'}
                      </span>
                      {d.status === 'active' && (canManage || d.grantor_user_id === Number(currentUser.id)) && (
                        <button
                          type="button"
                          onClick={() => setRevokeTargetId(d.id)}
                          className="text-xs text-red-600 font-semibold px-2 py-1 bg-red-50 dark:bg-red-950/40 rounded-lg cursor-pointer active:opacity-60"
                        >
                          撤销
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-400">
                  暂无生效的委托授权记录
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 border border-amber-200 dark:border-amber-900/50">
              <AppIcon name="warning" size={16} className="shrink-0" />
              <span>撤销立即生效；历史操作与审计记录保留。</span>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* 设计 ID 29：创建委托授权                                 */
          /* ========================================================= */
          <form onSubmit={handleCreateDelegation} className="space-y-4">
            <MobileField label="被授权人" required>
              <select
                aria-label="被授权人"
                value={String(granteeUserId)}
                onChange={(e) => setGranteeUserId(Number(e.target.value) || '')}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm"
              >
                <option value="">请选择人员</option>
                {members.map(member => <option key={member.user_id} value={member.user_id}>{member.display_name || member.nickname || member.username || `用户 #${member.user_id}`}</option>)}
              </select>
            </MobileField>

            {/* 授权动作勾选列表 (复用 DELEGATION_ACTIONS) */}
            <section className="space-y-1.5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                授权范围
              </h2>
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
                {DELEGATION_ACTIONS.map((act) => (
                  <div key={act.key} className="p-3.5 flex items-center justify-between">
                    <div>
                      <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                        {act.zh}
                      </strong>
                    </div>
                    <MobileSwitch
                      checked={Boolean(selectedActions[act.key])}
                      onChange={() => handleToggleAction(act.key)}
                      aria-label={act.zh}
                    />
                  </div>
                ))}
              </div>
            </section>

            <div>
              <MobileField label="有效期至（不填为长期）">
                <MobileInput
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              </MobileField>
            </div>

            <MobileField label="授权原因">
              <MobileTextarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="说明委托范围与交接事项…"
              />
            </MobileField>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center active:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {submitting ? '正在创建…' : '创建授权'}
            </button>
          </form>
        )}
      </div>

      {/* 撤销确认弹窗 */}
      <MobileConfirm
        isOpen={Boolean(revokeTargetId)}
        title="撤销委托授权"
        message="撤销后该成员将立即失去代为操作的权限。历史已记录的操作不变。确认撤销？"
        confirmLabel="确认撤销"
        cancelLabel="取消"
        destructive
        onConfirm={handleRevokeConfirm}
        onCancel={() => setRevokeTargetId(null)}
      />

      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur-md animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 5. 设计 ID 31：AI 责任链审计 (MobileAxisAuditScreen)
// ==========================================

export interface MobileAxisAuditScreenProps {
  projectId: number;
  currentUser: UserProfile;
  onBack?: () => void;
  onOpenPackage?: (pkgId: number) => void;
}

export const MobileAxisAuditScreen: React.FC<MobileAxisAuditScreenProps> = ({
  projectId,
  currentUser,
  onBack,
  onOpenPackage,
}) => {
  const [running, setRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    overall_risk: string;
    generated_at: string;
    nodes: {
      node_id: number;
      title: string;
      risk_level: string;
      summary: string;
      suggested_actions: string[];
    }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModelUnconfigured, setIsModelUnconfigured] = useState(false);

  const executeAudit = useCallback(async () => {
    setRunning(true);
    setError(null);
    setIsModelUnconfigured(false);
    try {
      const res = await runAxisAudit(projectId);
      setAuditResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '审计运行失败';
      setError(msg);
      if (
        msg.includes('模型') ||
        msg.includes('LLM') ||
        msg.includes('422') ||
        msg.includes('503') ||
        msg.includes('未配置')
      ) {
        setIsModelUnconfigured(true);
      }
    } finally {
      setRunning(false);
    }
  }, [projectId]);

  useEffect(() => {
    executeAudit();
  }, [executeAudit]);

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e] select-none overflow-hidden">
      <MobileTopBar
        title="AI 责任链审计"
        showBack={Boolean(onBack)}
        onBack={onBack}
        backLabel="返回"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4 mobile-scroll-container">
        {/* 未配置模型或错误提示 */}
        {isModelUnconfigured && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl space-y-2 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2 font-bold text-sm">
              <AppIcon name="warning" size={18} className="text-amber-600 shrink-0" />
              <span>未配置审计模型</span>
            </div>
            <p className="leading-relaxed">
              当前项目或企业尚未在设置中配置并启用可用的 LLM 审计模型。真实审计功能需要配置模型后方可执行。
            </p>
            <button
              type="button"
              onClick={executeAudit}
              className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold text-xs inline-flex items-center gap-1 active:bg-amber-700 cursor-pointer"
            >
              <AppIcon name="refresh" size={13} />
              重试运行审计
            </button>
          </div>
        )}

        {error && !isModelUnconfigured && (
          <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-1.5 border border-red-200">
            <AppIcon name="alert" size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 头部完成状态卡片 */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#0058BE] dark:text-blue-300">
                <AppIcon name="ai" size={16} />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                责任链审计完成
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {auditResult ? `${auditResult.nodes.length} 项待处理` : '待处理'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {auditResult?.generated_at
              ? new Date(auditResult.generated_at).toLocaleString()
              : '今天 15:20'} · 责任树联合调试
          </p>
        </div>

        {/* 待确认问题列表 */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            待确认问题
          </h2>
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
            {auditResult && auditResult.nodes.length > 0 ? (
              auditResult.nodes.map((node) => (
                <div key={node.node_id} className="p-3.5 flex items-center justify-between">
                  <div>
                    <strong className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                      {node.title}
                    </strong>
                    <p className="text-[11px] text-slate-500 mt-0.5">{node.summary}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      node.risk_level === 'high'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {node.risk_level === 'high' ? '高' : '中'}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">暂无风险节点</div>
            )}
          </div>
        </section>

        {/* 审计依据材料 */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            审计依据
          </h2>
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-400">
            暂无关联审计材料
          </div>
        </section>

        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-[#0058BE] dark:text-blue-300 flex items-center gap-2 border border-blue-100 dark:border-blue-900/50">
          <AppIcon name="info" size={16} className="shrink-0" />
          <span>AI 结果交由管理者确认，可在核验后处理责任和任务。</span>
        </div>

        <div className="pt-2 pb-6">
          <button
            type="button"
            onClick={executeAudit}
            disabled={running}
            className="w-full min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 active:bg-slate-50 cursor-pointer"
          >
            <AppIcon name="refresh" size={15} className={running ? 'animate-spin' : ''} />
            <span>{running ? '正在审计…' : '重新运行审计'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
