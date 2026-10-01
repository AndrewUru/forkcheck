import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { parseFilters, type SearchParams } from '@/lib/validations/filters';
import { CreateEmployeeForm, DeactivateEmployeeForm } from '@/components/profile/user-forms';
export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { db, profile } = await requirePermission('configure');
  const f = parseFilters(await searchParams);
  let query = db
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('employee_id')
    .range((f.page - 1) * 20, f.page * 20 - 1);
  if (f.q) query = query.ilike('employee_id', `%${f.q.replace(/[%_]/g, '')}%`);
  const [users, branches] = await Promise.all([
    query,
    db.from('branches').select('id,name').order('name').limit(101),
  ]);
  if (users.error || branches.error) throw new Error('No se pudieron cargar los usuarios.');
  const link = (page: number) => `?${new URLSearchParams({ q: f.q, page: String(page) })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1>Usuarios</h1>
          <p>Altas y bajas de tu organización.</p>
        </div>
        <Link className="button" href="/admin/assignments">
          Ver asignaciones de máquinas
        </Link>
      </div>
      {branches.data.length > 100 ? (
        <p>
          Hay más de 100 sucursales. Utiliza el alta administrativa por script para seleccionar el
          alcance completo.
        </p>
      ) : (
        <CreateEmployeeForm branches={branches.data} />
      )}
      <form className="search-bar">
        <label>
          Buscar por ID de empleado
          <input name="q" defaultValue={f.q} />
        </label>
        <button className="button">Buscar</button>
      </form>
      <p>
        {users.count} usuarios · Página {f.page}
      </p>
      <div className="equipment-grid">
        {users.data.map((u) => (
          <article key={u.id} className="panel detail-panel">
            <h2>
              {u.first_name} {u.last_name}
            </h2>
            <p>
              {u.employee_id} · {u.role} · {u.active ? 'Activo' : 'Baja'}
            </p>
            {u.active && u.id !== profile.id && u.role !== 'SUPERADMIN' && (
              <DeactivateEmployeeForm id={u.id} employee={u.employee_id} />
            )}
          </article>
        ))}
      </div>
      {!users.data.length && <p>No hay usuarios con ese ID.</p>}
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
