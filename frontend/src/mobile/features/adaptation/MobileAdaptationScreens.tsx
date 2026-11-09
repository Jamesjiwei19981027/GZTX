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
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-surface dark:bg-surface text-on-surface dark:text-on-surface">
      <MobileTopBar title="注销账号确认" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="p-6 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant shadow-sm dark:shadow-none flex flex-col gap-4">
          <div className="w-14 h-14 rounded-full bg-error-container dark:bg-error text-error mx-auto flex items-center justify-center">
            <AppIcon name="alert" size={18} />
          </div>

          <div className="text-center">
            <h3 className="text-lg font-medium text-error dark:text-error tabular-nums">
              永久注销此账号
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              账号删除为最终不可逆操作，所有关联数据将即刻销毁。
            </p>
          </div>

          {errMsg && (
            <div className="p-3 bg-error-container dark:bg-error border border-outline-variant rounded-xl text-error text-xs">
              {errMsg}
            </div>
          )}

          <div className="p-4 bg-error-container dark:bg-error rounded-xl border border-outline-variant dark:border-outline-variant text-xs text-error dark:text-error flex flex-col gap-2 leading-relaxed">
            <span className="font-medium tabular-nums">销毁内容包括：</span>
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
            className="w-full min-h-[48px] rounded-lg bg-error text-on-error font-medium text-base hover:bg-error active:bg-error disabled:opacity-40 transition-ink-colors cursor-pointer shadow-sm dark:shadow-none mt-2 tabular-nums"
          >
            {submitting ? '正在注销…' : '永久注销此账号'}
          </button>
        </div>
      </div>
    </div>
  );
};
