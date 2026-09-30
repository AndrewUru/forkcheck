import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { parseFilters, type SearchParams } from '@/lib/validations/filters';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
import { FleetUpdateNotice } from '@/components/equipment/update-notice';
import { AssignmentForm } from '@/components/equipment/assignment-form';
import { Empty } from '@/components/ui/status';
export default async function AssignmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePermission('configure');
  const f = parseFilters(await searchParams);
  let query = db
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('active', true)
    .order('employee_id')
    .range((f.page - 1) * 20, f.page * 20 - 1);
  if (f.q) query = query.ilike('employee_id', `%${f.q.replace(/[%_]/g, '')}%`);
  const users = await query;
  if (users.error) throw users.error;
  const assignmentQuery = db.from('equipment_operators').select('*').is('ended_at', null);
  const assignments = await (users.data.length
    ? assignmentQuery.in(
        'user_id',
        users.data.map((u) => u.id),
      )
    : assignmentQuery.limit(0));
  if (isMissingFleetSchema(assignments.error)) return <FleetUpdateNotice />;
  if (assignments.error) throw assignments.error;
  const ids = assignments.data.map((a) => a.equipment_id);
  const equipment = await (ids.length
    ? db.from('equipment').select('id,internal_code').in('id', ids)
    : db.from('equipment').select('id,internal_code').limit(0));
  if (equipment.error) throw equipment.error;
  const link = (page: number) => `?${new URLSearchParams({ q: f.q, page: String(page) })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN / PERSONAS Y EQUIPOS</p>
          <h1>Asignación de carretillas</h1>
          <p>
            Cada usuario puede tener un equipo asignado. El equipo debe pertenecer a una de sus
            sucursales autorizadas.
          </p>
        </div>
      </div>
      <form className="search-bar">
        <label className="grow">
          Buscar por ID de empleado
          <input name="q" defaultValue={f.q} placeholder="operario01" />
        </label>
        <button className="button dark">Buscar</button>
      </form>
      <div className="section-label">
        <span>{users.count} USUARIOS ACTIVOS</span>
        <span>Página {f.page}</span>
      </div>
      <div className="equipment-grid">
        {users.data.map((u) => {
          const a = assignments.data.find((a) => a.user_id === u.id);
          const code = equipment.data.find((e) => e.id === a?.equipment_id)?.internal_code ?? '';
          return (
            <article className="panel detail-panel" key={u.id}>
              <p className="eyebrow">
                {u.employee_id} · {u.role}
              </p>
              <h2>
                {u.first_name} {u.last_name}
              </h2>
              <p>{code ? `Equipo actual: ${code}` : 'Sin equipo asignado'}</p>
              <AssignmentForm
                key={`${u.id}-${a?.id ?? 'none'}`}
                employeeId={u.employee_id}
                currentCode={code}
                assignmentId={a?.id ?? null}
              />
            </article>
          );
        })}
      </div>
      {!users.data.length && (
        <Empty title="No hay usuarios con ese ID">Prueba otra búsqueda.</Empty>
      )}
      <div className="pagination">
        {f.page > 1 && (
          <Link className="button" href={link(f.page - 1)}>
            Anterior
          </Link>
        )}
        {f.page * 20 < (users.count ?? 0) && (
          <Link className="button" href={link(f.page + 1)}>
            Siguiente
          </Link>
        )}
      </div>
    </>
  );
}
