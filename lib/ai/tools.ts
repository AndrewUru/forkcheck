import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { Profile } from '@/types/domain';
import { can } from '@/lib/permissions';
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
  const { data: inspections, error: inspectionError } = await context.db
    .from('inspections')
    .select('started_at,completed_at,overall_status,due_date')
    .eq('equipment_id', equipment.id)
    .eq('organization_id', context.profile.organization_id)
    .order('started_at', { ascending: false })
    .limit(args.limit);
  if (inspectionError) throw new Error('Inspections unavailable');
  return {
    equipment: { code: equipment.internal_code, status: equipment.status },
    incidents,
    inspections,
    note: 'Últimos registros visibles, no un historial exhaustivo.',
  };
}

const incidentInput = z.object({ limit: z.number().int().min(1).max(20).default(10) }).strict();
export async function recentIncidentsTool(
  context: { db: SupabaseClient<Database>; profile: Profile },
  input: unknown,
) {
  const { limit } = incidentInput.parse(input);
  if (!context.profile.active) throw new Error('Not authorized');
  const { data, error } = await context.db
    .from('incidents')
    .select('title,description,severity,status,created_at,equipment_id')
    .eq('organization_id', context.profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Incidents unavailable');
  return { incidents: data, limit, note: 'Solo los registros más recientes visibles al usuario.' };
}

const metricsInput = z.object({ branchId: z.uuid().nullable().default(null) }).strict();
export async function dashboardMetricsTool(
  context: { db: SupabaseClient<Database>; profile: Profile },
  input: unknown,
) {
  const { branchId } = metricsInput.parse(input);
  if (!can(context.profile, 'dashboard')) throw new Error('Not authorized');
  const { data: organization, error: orgError } = await context.db
    .from('organizations')
    .select('timezone')
    .eq('id', context.profile.organization_id)
    .single();
  if (orgError) throw new Error('Organization unavailable');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: organization.timezone }).format(
    new Date(),
  );
  const { data, error } = await context.db.rpc('dashboard_metrics', {
    p_date: date,
    ...(branchId ? { p_branch: branchId } : {}),
  });
  if (error) throw new Error('Metrics unavailable');
  return { date, branchId, metrics: data };
}
