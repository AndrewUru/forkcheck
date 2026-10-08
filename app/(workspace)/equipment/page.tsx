import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { parseFilters, type SearchParams } from '@/lib/validations/filters';
import { EquipmentList } from '@/components/equipment/list';
import { MyEquipment } from '@/components/equipment/my-equipment';
export default async function EquipmentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const f = parseFilters(params);
  const { db, profile } = await session();
  let query = db
    .from('equipment_overview')
    .select('*', { count: 'exact' })
    .order('internal_code')
    .range((f.page - 1) * 12, f.page * 12 - 1);
  if (f.q) query = query.ilike('internal_code', `%${f.q.replace(/[%_]/g, '')}%`);
  if (f.branch) query = query.eq('branch_id', f.branch);
  if (f.region) query = query.eq('region_id', f.region);
  if (f.zone) query = query.eq('zone_id', f.zone);
  if (f.type) query = query.eq('equipment_type_id', f.type);
  if (f.brand) query = query.eq('brand', f.brand);
  if (f.model) query = query.eq('model', f.model);
  if (f.status) query = query.eq('status', f.status);
  if (f.before) query = query.lt('next_inspection', f.before);
  if (f.fleet === 'active') query = query.neq('status', 'INACTIVE');
  if (f.fleet === 'inactive') query = query.eq('status', 'INACTIVE');
  const [result, branches] = await Promise.all([
    query,
    db.from('branches').select('*').order('name').limit(200),
  ]);
  if (result.error || branches.error) throw new Error('No se pudo cargar la flota');
  const carried = Object.fromEntries(
    Object.entries({
      region: f.region,
      zone: f.zone,
      type: f.type,
      brand: f.brand,
      model: f.model,
      status: f.status,
      before: f.before,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const link = (page: number) =>
    `/equipment?${new URLSearchParams({ ...carried, q: f.q, branch: f.branch ?? '', fleet: f.fleet, page: String(page) })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FLOTA / ACTIVOS AUTORIZADOS</p>
          <h1>Equipos</h1>
          <p>Consulta el estado de tus equipos e inicia una revisión.</p>
        </div>
        <div className="heading-actions">
          {profile.role === 'CORPORATE_ADMIN' && (
            <Link className="button primary" href="/admin/equipment/new">
              + Nuevo equipo
            </Link>
          )}
          <Link className="button" href="/scan">
            <ScanLine size={18} /> Acceso por QR
          </Link>
        </div>
      </div>
      <MyEquipment />
      {params.error && (
        <p className="alert" role="alert">
          No se pudo iniciar la revisión. Puede haber otro operario inspeccionando el equipo, un
          estado no disponible o una plantilla pendiente de publicar.
        </p>
      )}
      <form className="search-bar">
        {Object.entries(carried).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
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
        <label>
          Mostrar
          <select name="fleet" defaultValue={f.fleet}>
            <option value="active">Flota activa</option>
            <option value="inactive">Bajas e inactivos</option>
            <option value="all">Todos, incluido histórico</option>
          </select>
        </label>
        <button className="button dark">Buscar</button>
      </form>
      <div className="section-label">
        <span>{result.count ?? 0} EQUIPOS</span>
        <span>Página {f.page}</span>
      </div>
      {Object.keys(carried).length > 0 && (
        <p className="info-note">
          Vista filtrada{f.status === 'BLOCKED' ? ': equipos bloqueados' : ''}
          {f.before ? ` · revisión anterior al ${f.before}` : ''}.{' '}
          <Link href="/equipment">Quitar filtros y ver la flota</Link>
        </p>
      )}
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
