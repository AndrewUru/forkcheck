import type { Profile, Role } from '@/types/domain';
export type Permission = 'inspect' | 'dashboard' | 'manage_equipment' | 'maintain' | 'configure';
const permissions: Record<Permission, readonly Role[]> = {
  inspect: ['OPERARIO', 'SUPERVISOR', 'CORPORATE_ADMIN'],
  dashboard: ['SUPERVISOR', 'REGIONAL_MANAGER', 'CORPORATE_ADMIN'],
  manage_equipment: ['SUPERVISOR', 'CORPORATE_ADMIN'],
  maintain: ['MANTENIMIENTO', 'CORPORATE_ADMIN'],
  configure: ['CORPORATE_ADMIN'],
};
export function can(profile: Pick<Profile, 'role' | 'active'>, permission: Permission) {
  return profile.active && permissions[permission].includes(profile.role);
}
export function hasScope(
  profile: Profile,
  organizationId: string,
  branchId: string,
  branches: readonly string[],
) {
  return (
    profile.active &&
    profile.organization_id === organizationId &&
    (profile.role === 'CORPORATE_ADMIN' || branches.includes(branchId))
  );
}
