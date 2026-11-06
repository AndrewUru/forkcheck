import { z } from 'zod';
import { session } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { publicCodeSchema } from '@/lib/qr';
import { dayBounds } from '@/lib/calendar/dates';
import { csv } from '@/lib/exports/csv';

export const dynamic = 'force-dynamic';
const filters = z
  .object({
    from: z.union([z.iso.date(), z.literal('')]).optional(),
    to: z.union([z.iso.date(), z.literal('')]).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to);
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number) => new Response(message, { status, headers });

export async function GET(request: Request, context: { params: Promise<{ publicCode: string }> }) {
  const { db, profile } = await session();
  if (!can(profile, 'dashboard')) return fail('No tienes permiso para exportar.', 403);
  const code = publicCodeSchema.safeParse((await context.params).publicCode);
  const input = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!code.success || !input.success)
    return fail('Revisa el código y el intervalo de fechas.', 400);
  const { data: equipment, error: equipmentError } = await db
    .from('equipment')
    .select('id,internal_code')
    .eq('public_code', code.data)
    .maybeSingle();
  if (equipmentError) return fail('No se pudo consultar el equipo.', 503);
  if (!equipment) return fail('Equipo no disponible.', 404);
  const { data: organization, error: orgError } = await db
    .from('organizations')
    .select('timezone')
    .single();
  if (orgError || !organization) return fail('No se pudo consultar la zona horaria.', 503);
  let query = db
    .from('inspections')
    .select('id,completed_at,overall_status,checklist_version_id,due_date', { count: 'exact' })
    .eq('equipment_id', equipment.id)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .order('id')
    .limit(1000);
  try {
    if (input.data.from)
      query = query.gte('completed_at', dayBounds(input.data.from, organization.timezone).start);
    if (input.data.to)
      query = query.lt('completed_at', dayBounds(input.data.to, organization.timezone).end);
  } catch {
    return fail('No se pudo interpretar el intervalo de fechas.', 400);
  }
  const { data, error, count } = await query;
  if (error || !data || count === null)
    return fail('No se pudo exportar el historial. Reintenta.', 503);
  if (count > 1000 || count !== data.length)
    return fail(
      'El historial supera el límite de descarga. Vuelve a la ficha y acota las fechas; no se ha exportado un historial parcial.',
      413,
    );
  const result = csv([
    [
      'Equipo',
      'Inspección',
      'Finalización (UTC)',
      'Resultado',
      'Versión de checklist',
      'Fecha prevista',
    ],
    ...data.map((i) => [
      equipment.internal_code,
      i.id,
      i.completed_at,
      i.overall_status,
      i.checklist_version_id,
      i.due_date,
    ]),
  ]);
  return new Response(result, {
    headers: {
      ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="forkcheck-${code.data}-historial.csv"`,
    },
  });
}
