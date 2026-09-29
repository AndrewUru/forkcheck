import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { parseFilters, type SearchParams } from '@/lib/validations/filters';
import { EquipmentList } from '@/components/equipment/list';
export default async function EquipmentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const f = parseFilters(params);
  const { db } = await session();
  let query = db
    .from('equipment_overview')
    .select('*', { count: 'exact' })
    .order('internal_code')
    .range((f.page - 1) * 12, f.page * 12 - 1);
  if (f.q) query = query.ilike('internal_code', `%${f.q.replace(/[%_]/g, '')}%`);
  if (f.branch) query = query.eq('branch_id', f.branch);
  const [result, branches] = await Promise.all([
    query,
    db.from('branches').select('*').order('name'),
  ]);
  if (result.error || branches.error) throw new Error('No se pudo cargar la flota');
  const link = (page: number) =>
    `/equipment?${new URLSearchParams({ q: f.q, branch: f.branch ?? '', page: String(page) })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FLOTA / ACTIVOS AUTORIZADOS</p>
          <h1>Equipos</h1>
          <p>Consulta el estado de tus equipos e inicia una revisión.</p>
        </div>
        <Link className="button primary" href="/scan">
          <ScanLine size={18} /> Acceso por QR
        </Link>
      </div>
      {params.error && (
        <p className="alert" role="alert">
          No se pudo iniciar la revisión. Puede haber otro operario inspeccionando el equipo, un
          estado no disponible o una plantilla pendiente de publicar.
        </p>
      )}
      <form className="search-bar">
        <label className="grow">
          Buscar equipo
          <input name="q" placeholder="Código interno del equipo…" defaultValue={f.q} />
        </label>
        <label>
          Sucursal
          <select name="branch" defaultValue={f.branch}>
            <option value="">Todas las autorizadas</option>
            {branches.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button dark">Buscar</button>
      </form>
      <div className="section-label">
        <span>{result.count ?? 0} EQUIPOS</span>
        <span>Página {f.page}</span>
      </div>
      <EquipmentList equipment={result.data} />
      <div className="pagination">
        {f.page > 1 && (
          <Link className="button" href={link(f.page - 1)}>
            Anterior
          </Link>
        )}
        {f.page * 12 < (result.count ?? 0) && (
          <Link className="button" href={link(f.page + 1)}>
            Siguiente
          </Link>
        )}
      </div>
    </>
  );
}
