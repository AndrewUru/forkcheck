import 'server-only';
import { createClient } from '@/lib/supabase/server';
export async function checklistSchemaReady(db: Awaited<ReturnType<typeof createClient>>) {
  const { error } = await db.from('checklist_templates').select('archived_at').limit(1);
  if (error && ['42703', 'PGRST204'].includes(error.code)) return false;
  if (error) throw new Error('No se pudo cargar el catálogo de plantillas.');
  return true;
}
