import { redirect } from 'next/navigation';
import { session } from '@/lib/auth/session';
import { homeFor } from '@/lib/navigation';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const { profile } = await session();
  redirect(homeFor(profile));
}
