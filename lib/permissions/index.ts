import type { Profile, Role } from '@/types/domain';
export type Permission =
  | 'inspect'
  | 'dashboard'
  | 'manage_equipment'
  | 'create_users'
  | 'assign_equipment'
  | 'maintain'
  | 'configure';
const permissions: Record<Permission, readonly Role[]> = {
  inspect: ['OPERARIO', 'JEFE_ALMACEN', 'CORPORATE_ADMIN'],
  dashboard: ['JEFE_ALMACEN', 'DELEGADO_CENTRO', 'EHS', 'DIRECTOR_REGIONAL', 'DIRECTOR_GENERAL', 'CORPORATE_ADMIN'],
  manage_equipment: ['CORPORATE_ADMIN'],
  create_users: ['JEFE_ALMACEN', 'CORPORATE_ADMIN'],
  assign_equipment: ['JEFE_ALMACEN', 'CORPORATE_ADMIN'],
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
    (profile.role === 'CORPORATE_ADMIN' || profile.role === 'DIRECTOR_GENERAL' || branches.includes(branchId))
  );
}
