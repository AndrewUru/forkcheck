import Link from 'next/link';
import { z } from 'zod';
import { session } from '@/lib/auth/session';
import { saveProvider } from '@/app/provider-actions';
import { Empty } from '@/components/ui/status';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
import type { SearchParams } from '@/lib/validations/filters';

export default async function ProvidersPage({ searchParams }: { searchParams: SearchParams }) {
  const { db, profile } = await session();
  const params = await searchParams;
  const admin = profile.role === 'CORPORATE_ADMIN';
  const q = typeof params.q === 'string' ? params.q.slice(0, 120).trim() : '';
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse(params.page);
  const showInactive = admin && params.inactive === '1';
  let query = db
    .from('providers')
    .select('*', { count: 'exact' })
    .eq('active', !showInactive)
    .order('name')
    .order('id')
    .range((page - 1) * 20, page * 20 - 1);
  if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, '')}%`);
  const result = await query;
  if (result.error) {
    if (isMissingFleetSchema(result.error))
      return (
        <div className="panel detail-panel">
          <h1>Proveedores de renting</h1>
          <p>
            El directorio está pendiente de activar en la base de datos. El administrador debe
            aplicar la actualización de proveedores.
          </p>
        </div>
      );
    throw new Error('No se pudo cargar el directorio de proveedores');
  }
  const editId = z.uuid().safeParse(params.edit);
  const editing = admin && (params.edit === 'new' || editId.success);
  const selected =
    admin && editId.success
      ? await db.from('providers').select('*').eq('id', editId.data).maybeSingle()
      : { data: null, error: null };
  if (selected.error) throw new Error('No se pudo cargar el proveedor');
  const provider = selected.data;
  const href = (target: number) =>
    `/providers?${new URLSearchParams({ q, page: String(target), inactive: showInactive ? '1' : '0' })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RENTING / CONTACTOS</p>
          <h1>Proveedores de renting</h1>
          <p>
            La empresa de renting realiza el mantenimiento. Aquí puedes consultar a quién comunicar
            los reportes.
          </p>
        </div>
        {admin && (
          <Link className="button primary" href="/providers?edit=new">
            + Nuevo proveedor
          </Link>
        )}
      </div>
      {params.error && (
        <p className="alert" role="alert">
          No se guardó el proveedor. Revisa el nombre, un teléfono o correo de contacto y tus
          permisos.
        </p>
      )}
      {params.saved === '1' && (
        <p className="info-note" role="status">
          Proveedor guardado.
        </p>
      )}
      {editing && (params.edit === 'new' || provider) && (
        <section className="panel detail-panel profile-panel">
          <h2>{provider ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
          <form className="management-form" action={saveProvider}>
            <input type="hidden" name="id" value={provider?.id ?? ''} />
            <label>
              Empresa de renting
              <input name="name" defaultValue={provider?.name} required maxLength={120} />
            </label>
            <label>
              Persona o departamento de contacto
              <input name="contact_name" defaultValue={provider?.contact_name} maxLength={120} />
            </label>
            <label>
              Teléfono
              <input name="phone" type="tel" defaultValue={provider?.phone} maxLength={40} />
            </label>
            <label>
              Correo electrónico
              <input name="email" type="email" defaultValue={provider?.email} maxLength={254} />
            </label>
            <p className="muted">Indica al menos un teléfono o correo electrónico.</p>
            <label>
              Notas de contacto
              <textarea
                name="notes"
                defaultValue={provider?.notes}
                maxLength={1000}
                rows={3}
                placeholder="Horario de atención, referencia de contrato…"
              />
            </label>
            <label className="confirm-check">
              <input name="active" type="checkbox" defaultChecked={provider?.active ?? true} />
              Proveedor activo
            </label>
            <div className="heading-actions">
              <button className="button primary">Guardar proveedor</button>
              <Link className="button" href="/providers">
                Cancelar
              </Link>
            </div>
          </form>
        </section>
      )}
      {editing && editId.success && !provider && <p className="alert">Proveedor no disponible.</p>}
      <form className="search-bar">
        <label className="grow">
          Buscar proveedor
          <input name="q" defaultValue={q} placeholder="Nombre de la empresa" maxLength={120} />
        </label>
        {admin && (
          <label>
            Mostrar
            <select name="inactive" defaultValue={showInactive ? '1' : '0'}>
              <option value="0">Activos</option>
              <option value="1">Inactivos</option>
            </select>
          </label>
        )}
        <button className="button dark">Buscar</button>
      </form>
      <p className="section-label">
        {result.count ?? 0} proveedores · Página {page}
      </p>
      <div className="equipment-grid">
        {result.data.map((item) => (
          <article className="panel detail-panel provider-card" key={item.id}>
            <h2>{item.name}</h2>
            {item.contact_name && <p>{item.contact_name}</p>}
            {item.phone && (
              <p>
                <a className="text-link" href={`tel:${item.phone.replace(/[^+\d]/g, '')}`}>
                  {item.phone}
                </a>
              </p>
            )}
            {item.email && (
              <p>
                <a className="text-link" href={`mailto:${item.email}`}>
                  {item.email}
                </a>
              </p>
            )}
            {item.notes && <p className="provider-notes">{item.notes}</p>}
            {!item.active && <p className="muted">Proveedor inactivo</p>}
            {admin && (
              <Link className="button" href={`/providers?edit=${item.id}`}>
                Editar contacto
              </Link>
            )}
          </article>
        ))}
      </div>
      {!result.data.length && (
        <Empty title="Sin proveedores en esta lista">
          {admin
            ? 'Añade los datos reales de las empresas de renting para que los usuarios puedan contactar con ellas.'
            : 'El administrador debe registrar los contactos de las empresas de renting.'}
        </Empty>
      )}
      <div className="pagination">
        {page > 1 && (
          <Link className="button" href={href(page - 1)}>
            Anterior
          </Link>
        )}
        {page * 20 < (result.count ?? 0) && (
          <Link className="button" href={href(page + 1)}>
            Siguiente
          </Link>
        )}
      </div>
    </>
  );
}
