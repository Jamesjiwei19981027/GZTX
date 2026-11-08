/**
 * 企业管理与基础设施集成组件 (Admin Integration Sections)
 * 手机端已移除独立的企业管理外壳页面，企业配置移至电脑端管理。
 * 保留共用表单组件与权限组件供各端复用。
 */

export {
  AdminNotifyChannelsSection,
  AdminAiServicesSection,
  AdminOrgSsoSection,
  AdminIntegrationsSection,
  AdminNotifyLogsSection,
} from '../../../components/admin/EnterpriseSettingsSections';

export type { EnterpriseSectionProps } from '../../../components/admin/EnterpriseSettingsSections';

import React from 'react';
import { AppIcon } from '../../ui/AppIcon';

// 权限不足提示横幅组件 (共用)
export const AdminPermissionBanner: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  if (isAdmin) return null;
  return (
    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
      <AppIcon name="warning" size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">只读权限模式 (普通成员视图)</p>
        <p className="mt-0.5 text-amber-800 dark:text-amber-300 leading-relaxed">
          企业级服务与基础设施配置仅企业管理员拥有写入权限。当前展示真实配置状态，已禁用修改提交。
        </p>
      </div>
    </div>
  );
};
