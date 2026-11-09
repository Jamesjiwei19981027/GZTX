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
    <div className="p-4 bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-[#d9a35b] rounded-xl flex items-start gap-2 text-xs text-[#a86412] dark:text-[#d9a35b]">
      <AppIcon name="warning" size={18} className="text-inherit shrink-0 mt-1" />
      <div>
        <p className="font-normal tabular-nums">只读权限模式 (普通成员视图)</p>
        <p className="mt-1 text-[#a86412] dark:text-[#d9a35b] leading-relaxed">
          企业级服务与基础设施配置仅企业管理员拥有写入权限。当前展示真实配置状态，已禁用修改提交。
        </p>
      </div>
    </div>
  );
};
