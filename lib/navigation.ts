import { can } from '@/lib/permissions';
import type { Profile } from '@/types/domain';
export function homeFor(profile: Pick<Profile, 'role' | 'active'>) {
  if (can(profile, 'dashboard')) return '/admin';
  return profile.role === 'OPERARIO' ? '/scan' : '/shift';
}
