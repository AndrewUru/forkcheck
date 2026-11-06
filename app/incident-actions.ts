'use server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { resolutionInput, workflowError } from '@/lib/incidents/workflow';

export async function resolveIncident(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('maintain');
  const input = resolutionInput.safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      message: 'Describe la reparación y verificación (10–2000 caracteres) y confirma el cierre.',
    };
  const { error } = await db.rpc('resolve_incident', {
    p_incident: input.data.id,
    p_expected_updated_at: input.data.expectedUpdatedAt,
    p_notes: input.data.notes,
  });
  if (error) return { message: workflowError(error) };
  revalidatePath('/incidents');
  revalidatePath('/equipment', 'layout');
  revalidatePath('/admin');
  return { message: 'Incidencia cerrada. El estado de la máquina no ha cambiado.' };
}
export async function returnEquipmentToService(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('configure');
  const input = resolutionInput.safeParse(Object.fromEntries(form));
  if (!input.success)
    return { message: 'Describe la verificación (10–2000 caracteres) y confirma la autorización.' };
  const { error } = await db.rpc('return_equipment_to_service', {
    p_equipment: input.data.id,
    p_expected_updated_at: input.data.expectedUpdatedAt,
    p_reason: input.data.notes,
  });
  if (error) return { message: workflowError(error) };
  revalidatePath('/equipment', 'layout');
  revalidatePath('/admin');
  return {
    message: 'Puesta en servicio autorizada y registrada. Se mantienen las revisiones programadas.',
  };
}
