import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient, isConfigured } from '@/lib/supabase/server';
import { can, type Permission } from '@/lib/permissions';
export const session = cache(async () => {
  if (!isConfigured()) redirect('/setup');
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect('/login');
  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .eq('active', true)
    .single();
  if (!profile) redirect('/login?error=inactive');
  return { db, profile };
});
export async function requirePermission(permission: Permission) {
  const context = await session();
  if (!can(context.profile, permission)) redirect('/equipment');
  return context;
}
