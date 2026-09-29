import { redirect } from 'next/navigation';
import { session } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
export default async function Home() {
  const { profile } = await session();
  redirect(can(profile, 'dashboard') ? '/admin' : '/equipment');
}
