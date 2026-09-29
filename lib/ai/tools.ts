import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { Profile } from '@/types/domain';
const historyInput = z
  .object({
    publicCode: z.string().regex(/^[a-zA-Z0-9-]{4,80}$/),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
/** Trusted backend context only. A future model gets this tool, never SQL or an admin client. */
export async function equipmentHistoryTool(
  context: { db: SupabaseClient<Database>; profile: Profile },
  input: unknown,
) {
  const args = historyInput.parse(input);
  if (!context.profile.active) throw new Error('Not authorized');
  const { data: equipment, error } = await context.db
    .from('equipment')
    .select('*')
    .eq('organization_id', context.profile.organization_id)
    .eq('public_code', args.publicCode)
    .single();
  if (error) throw new Error('Equipment unavailable');
  const { data: incidents, error: incidentError } = await context.db
    .from('incidents')
    .select('title,description,severity,status,created_at')
    .eq('equipment_id', equipment.id)
    .eq('organization_id', context.profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(args.limit);
  if (incidentError) throw incidentError;
  return { equipment: { code: equipment.internal_code, status: equipment.status }, incidents };
}
