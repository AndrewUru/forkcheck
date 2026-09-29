import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { parseFilters, todayIn, type SearchParams } from '@/lib/validations/filters';
import { metricsSchema } from '@/types/domain';
import { Empty } from '@/components/ui/status';
export default async function Branches({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePermission('dashboard');
  const f = parseFilters(await searchParams);
  let query = db
    .from('branches')
    .select('*', { count: 'exact' })
    .order(f.sort === 'region' ? 'region_id' : 'name')
    .order('id')
    .range((f.page - 1) * 20, f.page * 20 - 1);
  if (f.q) query = query.ilike('name', `%${f.q.replace(/[%_]/g, '')}%`);
  const [result, regions, org] = await Promise.all([
    query,
    db.from('regions').select('*'),
    db.from('organizations').select('*').single(),
  ]);
  if (result.error || regions.error || org.error)
    throw new Error('No se pueden consultar sucursales');
  const rows = await Promise.all(
    result.data.map(async (branch) => {
      const { data, error } = await db.rpc('dashboard_metrics', {
        p_date: todayIn(org.data.timezone),
        p_branch: branch.id,
      });
      if (error) throw error;
      return { branch, metrics: metricsSchema.parse(data) };
    }),
  );
  const href = (page: number) =>
    `?${new URLSearchParams({ q: f.q, sort: f.sort, page: String(page) })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZACIÓN / RED OPERATIVA</p>
          <h1>Sucursales</h1>
          <p>{result.count} sucursales autorizadas · Cumplimiento de hoy</p>
        </div>
      </div>
      <form className="search-bar">
        <label className="grow">
          Buscar sucursal
          <input name="q" defaultValue={f.q} placeholder="Nombre de la sucursal" />
        </label>
        <label>
          Orden
          <select name="sort" defaultValue={f.sort}>
            <option value="name">Nombre</option>
            <option value="region">Agrupar por región</option>
          </select>
        </label>
        <button className="button dark">Aplicar</button>
      </form>
      <section className="panel table-scroll">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                {[
                  'Sucursal',
                  'Región',
                  'Equipos',
                  'Previstas',
                  'Realizadas',
                  'Cumplimiento',
                  'Incidencias',
                  'Bloqueados',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ branch: b, metrics: m }) => (
                <tr key={b.id}>
                  <td>
                    <Link className="text-link" href={`/equipment?branch=${b.id}`}>
                      {b.name}
                    </Link>
                  </td>
                  <td>{regions.data.find((r) => r.id === b.region_id)?.name}</td>
                  <td>{m.equipment}</td>
                  <td>{m.due}</td>
                  <td>{m.completed}</td>
                  <td>{m.due ? `${Math.round((m.completed / m.due) * 100)}%` : '—'}</td>
                  <td>{m.incidents}</td>
                  <td className={m.blocked ? 'text-red' : ''}>{m.blocked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="Sin sucursales">Ajusta la búsqueda.</Empty>
        )}
      </section>
      <div className="pagination">
        {f.page > 1 && (
          <Link className="button" href={href(f.page - 1)}>
            Anterior
          </Link>
        )}
        <span>Página {f.page}</span>
        {f.page * 20 < (result.count ?? 0) && (
          <Link className="button" href={href(f.page + 1)}>
            Siguiente
          </Link>
        )}
      </div>
    </>
  );
}
