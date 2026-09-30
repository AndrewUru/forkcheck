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
/** Trusted backend context only. The model gets this tool, never SQL or an admin client. */
export async function equipmentHistoryTool(
  context: { db: SupabaseClient<Database>; profile: Profile },
  input: unknown,
) {
  const args = historyInput.parse(input);
  if (!context.profile.active) throw new Error('Not authorized');
  const { data: byPublicCode, error: publicError } = await context.db
    .from('equipment')
    .select('*')
    .eq('organization_id', context.profile.organization_id)
    .eq('public_code', args.publicCode)
    .maybeSingle();
  if (publicError) throw new Error('Equipment unavailable');
  const fallback = byPublicCode
    ? null
    : await context.db
        .from('equipment')
        .select('*')
        .eq('organization_id', context.profile.organization_id)
        .eq('internal_code', args.publicCode)
        .maybeSingle();
  const equipment = byPublicCode ?? fallback?.data;
  if (fallback?.error || !equipment) throw new Error('Equipment unavailable');
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
  const ids = [...new Set(data.map((incident) => incident.equipment_id))];
  const { data: equipment, error: equipmentError } = ids.length
    ? await context.db
        .from('equipment')
        .select('id,internal_code')
        .eq('organization_id', context.profile.organization_id)
        .in('id', ids)
    : { data: [], error: null };
  if (equipmentError) throw new Error('Equipment unavailable');
  const codes = new Map(equipment.map((item) => [item.id, item.internal_code]));
  return {
    incidents: data.map(({ equipment_id, ...incident }) => ({
      ...incident,
      equipment: codes.get(equipment_id) ?? 'Equipo no disponible',
    })),
    limit,
    note: 'Solo los registros más recientes visibles al usuario.',
  };
}

const metricsInput = z
  .object({
    branchId: z.uuid().optional(),
    brand: z.string().trim().min(1).max(60).optional(),
    model: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
const branchInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[\p{L}\p{N} -]+$/u),
  })
  .strict();
export async function findBranchesTool(
  context: { db: SupabaseClient<Database>; profile: Profile },
  input: unknown,
) {
  const { name } = branchInput.parse(input);
  if (!can(context.profile, 'dashboard')) throw new Error('Not authorized');
  const { data, error } = await context.db
    .from('branches')
    .select('id,name')
    .eq('organization_id', context.profile.organization_id)
    .ilike('name', `%${name}%`)
    .order('name')
    .limit(10);
  if (error) throw new Error('Branches unavailable');
  return { branches: data };
}
export async function dashboardMetricsTool(
  context: { db: SupabaseClient<Database>; profile: Profile },
  input: unknown,
) {
  const { branchId, brand, model } = metricsInput.parse(input);
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
    ...(brand ? { p_brand: brand } : {}),
    ...(model ? { p_model: model } : {}),
  });
  if (error) throw new Error('Metrics unavailable');
  return {
    date,
    branchId: branchId ?? null,
    brand: brand ?? null,
    model: model ?? null,
    metrics: data,
  };
}
