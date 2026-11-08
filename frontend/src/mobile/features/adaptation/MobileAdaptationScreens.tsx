/**
 * 移动端全尺寸与异常场景适配中心 (Mobile Adaptation Screens)
 * - 96: 删除账号确认 (密码校验 + 关键词 DELETE 确认与影响说明)
 * （其余无导航入口的演示页已精简移除）
 */

import React, { useState } from 'react';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import { UserProfile, AppSettings, Task, Project } from '../../../types';
import { deleteMyAccount } from '../../../api/auth';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileField, MobileInput } from '../../ui/MobileField';
import { AppIcon } from '../../ui/AppIcon';

export interface AdaptationSharedProps {
  user: UserProfile;
  settings: AppSettings;
  companyId?: number | string | null;
  tasks?: Task[];
  projects?: Project[];
  currentProject?: Project;
  onSelectProject?: (p: Project) => void;
  onLogout?: () => Promise<void>;
}

// ==========================================
// 96. 删除账号确认 (Delete Account Confirmation)
// ==========================================
export const AdaptAccountDeleteScreen: React.FC<AdaptationSharedProps> = ({ onLogout }) => {
  const { goBack } = useMobileNavigation();
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const canSubmit = password.length > 0 && keyword.trim() === 'DELETE';

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await deleteMyAccount(password, 'DELETE');
      alert('账号已注销成功，感谢您的使用。');
      if (onLogout) {
        await onLogout();
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '注销申请失败，请核对密码');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="注销账号确认" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-950 shadow-md flex flex-col gap-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950 text-red-600 mx-auto flex items-center justify-center">
            <AppIcon name="alert" size={28} />
          </div>

          <div className="text-center">
            <h3 className="text-lg font-bold text-red-600 dark:text-red-400">
              永久注销此账号
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              账号删除为最终不可逆操作，所有关联数据将即刻销毁。
            </p>
          </div>

          {errMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 rounded-xl text-red-600 text-xs">
              {errMsg}
            </div>
          )}

          <div className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900 text-xs text-red-900 dark:text-red-200 flex flex-col gap-1.5 leading-relaxed">
            <span className="font-bold">销毁内容包括：</span>
            <span>• 个人创建的所有私有待办任务与未同步离线草稿</span>
            <span>• 在所有项目人轴责任链中的责任人身份将被解除</span>
            <span>• 所有已签发的 API Token、会话凭证将立即吊销失效</span>
          </div>

          <MobileField label="输入当前账号密码" required>
            <MobileInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码进行身份核验"
            />
          </MobileField>

          <MobileField label="键入确认词" helperText="必须输入大写字母 DELETE 确认" required>
            <MobileInput
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="DELETE"
            />
          </MobileField>

          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={handleDelete}
            className="w-full min-h-[48px] rounded-xl bg-red-600 text-white font-medium text-base hover:bg-red-700 active:bg-red-800 disabled:opacity-40 transition-colors cursor-pointer shadow-sm mt-2"
          >
            {submitting ? '正在注销…' : '永久注销此账号'}
          </button>
        </div>
      </div>
    </div>
  );
};
