import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
import { FleetUpdateNotice } from '@/components/equipment/update-notice';
export async function EquipmentOperators({
  equipmentId,
  page,
}: {
  equipmentId: string;
  page: number;
}) {
  const { db } = await requirePermission('configure');
  const assignments = await db
    .from('equipment_operators')
    .select('id,user_id', { count: 'exact' })
    .eq('equipment_id', equipmentId)
    .is('ended_at', null)
    .order('id')
    .range((page - 1) * 20, page * 20 - 1);
  if (isMissingFleetSchema(assignments.error)) return <FleetUpdateNotice />;
  if (assignments.error) throw new Error('No se pudieron cargar las asignaciones.');
  const ids = assignments.data.map((a) => a.user_id);
  const users = await (ids.length
    ? db.from('profiles').select('id,employee_id,first_name,last_name').in('id', ids)
    : db.from('profiles').select('id,employee_id,first_name,last_name').limit(0));
  if (users.error) throw new Error('No se pudieron cargar las personas asignadas.');
  return (
    <section className="panel detail-panel">
      <h2>Personas asignadas</h2>
      <p>{assignments.count} asignaciones activas</p>
      {users.data.map((u) => (
        <p key={u.id}>
          {u.first_name} {u.last_name} · {u.employee_id}
        </p>
      ))}
      {!assignments.count && <p>Esta máquina no tiene usuarios asignados.</p>}
      <div className="pagination">
        {page > 1 && (
          <Link className="button" href={`?page=${page - 1}`}>
            Anterior
          </Link>
        )}
        {page * 20 < (assignments.count ?? 0) && (
          <Link className="button" href={`?page=${page + 1}`}>
            Siguiente
          </Link>
        )}
      </div>
      <Link className="button" href="/admin/assignments">
        Gestionar asignaciones
      </Link>
    </section>
  );
}
