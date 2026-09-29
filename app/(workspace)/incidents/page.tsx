import Link from 'next/link';
import { session } from '@/lib/auth/session';
import { Empty } from '@/components/ui/status';
import { parseFilters, type SearchParams } from '@/lib/validations/filters';
export default async function Incidents({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await session();
  const f = parseFilters(await searchParams);
  const { data, error, count } = await db
    .from('incidents')
    .select('*', { count: 'exact' })
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false })
    .range((f.page - 1) * 20, f.page * 20 - 1);
  if (error) throw error;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEGURIDAD / SEGUIMIENTO</p>
          <h1>Incidencias abiertas</h1>
          <p>{count} incidencias en tus sucursales autorizadas.</p>
        </div>
      </div>
      <section className="panel detail-panel">
        {data.length ? (
          data.map((i) => (
            <article className="incident-row" key={i.id}>
              <span className={`severity severity-${i.severity.toLowerCase()}`}>{i.severity}</span>
              <div>
                <h2>{i.title}</h2>
                <p>{i.description}</p>
                <small>
                  {new Date(i.created_at).toLocaleString('es-ES')} · {i.status}
                </small>
              </div>
              {i.inspection_id && (
                <Link className="text-link" href={`/inspections/${i.inspection_id}`}>
                  Ver inspección →
                </Link>
              )}
            </article>
          ))
        ) : (
          <Empty title="Sin incidencias abiertas">
            No hay incidencias pendientes en tu alcance.
          </Empty>
        )}
      </section>
      <div className="pagination">
        {f.page > 1 && (
          <Link className="button" href={`?page=${f.page - 1}`}>
            Anterior
          </Link>
        )}
        {f.page * 20 < (count ?? 0) && (
          <Link className="button" href={`?page=${f.page + 1}`}>
            Siguiente
          </Link>
        )}
      </div>
    </>
  );
}
