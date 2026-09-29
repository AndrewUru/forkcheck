import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function createClient() {
  const store = await cookies();
  if (!isConfigured()) throw new Error('Configura Supabase en .env.local');
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookies) => {
          try {
            cookies.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* Server Components cannot set cookies; proxy handles refresh. */
          }
        },
      },
    },
  );
}
