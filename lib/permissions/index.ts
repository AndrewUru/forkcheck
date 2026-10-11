import { businessRoles, type Profile, type Role } from '@/types/domain';
export type Permission =
  | 'inspect'
  | 'dashboard'
  | 'manage_equipment'
  | 'create_users'
  | 'assign_equipment'
  | 'self_assign_equipment'
  | 'designate_chiefs'
  | 'maintain'
  | 'configure';
const permissions: Record<Permission, readonly Role[]> = {
  inspect: ['OPERARIO', 'JEFE_ALMACEN', 'CORPORATE_ADMIN'],
  dashboard: [
    'JEFE_ALMACEN',
    'DELEGADO_CENTRO',
    'EHS',
    'DIRECTOR_REGIONAL',
    'DIRECTOR_GENERAL',
    'CORPORATE_ADMIN',
  ],
  manage_equipment: ['EHS', 'JEFE_ALMACEN', 'CORPORATE_ADMIN'],
  create_users: ['EHS', 'JEFE_ALMACEN', 'CORPORATE_ADMIN'],
  assign_equipment: ['EHS', 'JEFE_ALMACEN', 'CORPORATE_ADMIN'],
  self_assign_equipment: ['OPERARIO'],
  designate_chiefs: ['EHS', 'CORPORATE_ADMIN'],
  maintain: ['MANTENIMIENTO', 'CORPORATE_ADMIN'],
  configure: ['CORPORATE_ADMIN'],
};
export function can(profile: Pick<Profile, 'role' | 'active'>, permission: Permission) {
  return profile.active && permissions[permission].includes(profile.role);
}
export function rolesForNewUsers(
  profile: Pick<Profile, 'role' | 'active'>,
): readonly (typeof businessRoles)[number][] {
  if (!profile.active) return [];
  if (profile.role === 'CORPORATE_ADMIN') return businessRoles;
  if (profile.role === 'EHS') return ['OPERARIO', 'JEFE_ALMACEN'];
  return profile.role === 'JEFE_ALMACEN' ? ['OPERARIO'] : [];
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
    (profile.role === 'CORPORATE_ADMIN' ||
      profile.role === 'DIRECTOR_GENERAL' ||
      branches.includes(branchId))
  );
}
