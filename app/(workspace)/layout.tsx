import { session } from '@/lib/auth/session';
import { Shell } from '@/components/ui/shell';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await session();
  return <Shell profile={profile}>{children}</Shell>;
}
