import { requirePermission } from '@/lib/auth/session';
import { SelfAssignmentForm } from './self-assignment-form';
export async function SelfAssignment({
  equipmentId,
  equipmentCode,
}: {
  equipmentId: string;
  equipmentCode: string;
}) {
  const { db, profile } = await requirePermission('self_assign_equipment');
  const { data, error } = await db
    .from('equipment_operators')
    .select('id,equipment_id')
    .eq('user_id', profile.id)
    .is('ended_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('No se pudo cargar tu asignación.');
  return (
    <SelfAssignmentForm
      key={`${equipmentId}-${data?.id ?? 'none'}`}
      equipmentCode={equipmentCode}
      assignmentId={data?.id ?? null}
      current={data?.equipment_id === equipmentId}
    />
  );
}
