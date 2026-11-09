import type { MyProjectPermissions } from '../../../api/shell';

/** 项目设置、邀请成员只给 PM / 超管（与后端 member.pull、项目设置口径一致）；拿不到权限时一律不显示 */
export function canManageProject(perms: Pick<MyProjectPermissions, 'is_pm' | 'is_superadmin'> | null | undefined): boolean {
  return Boolean(perms && (perms.is_pm || perms.is_superadmin));
}
