import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { parseFilters, type SearchParams } from '@/lib/validations/filters';
import { checklistSchemaReady } from '@/lib/checklists';
import { ChecklistUpdateNotice } from '@/components/checklists/update-notice';
export default async function TemplatesPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePermission('configure');
  if (!await checklistSchemaReady(db)) return <ChecklistUpdateNotice />;
  const f = parseFilters(await searchParams);
  let query = db.from('checklist_templates').select('*', { count: 'exact' }).order('name').order('id').range((f.page - 1) * 20, f.page * 20 - 1);
  if (f.q) query = query.ilike('name', `%${f.q.replace(/[%_]/g, '')}%`);
  const { data, count, error } = await query;
  if (error) throw new Error('No se pudieron cargar las plantillas.');
  const link = (page: number) => `?${new URLSearchParams({ q: f.q, page: String(page) })}`;
  return <><div className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Plantillas de inspección</h1><p>Crea checklists y publica versiones sin alterar las inspecciones anteriores.</p></div><Link href="/admin/templates/new" className="button primary">Nueva plantilla</Link></div><form className="search-bar"><label>Buscar plantilla<input name="q" defaultValue={f.q} maxLength={60} /></label><button className="button">Buscar</button></form><p>{count} plantillas · Página {f.page}</p><div className="equipment-grid">{data.map((t) => <article className="panel detail-panel" key={t.id}><h2>{t.name}</h2><p>{t.archived_at ? 'Retirada del catálogo' : 'Activa en el catálogo'}</p><Link href={`/admin/templates/${t.id}`} className="button">Ver versiones y editar</Link></article>)}</div>{!data.length && <p>No hay plantillas que coincidan con la búsqueda.</p>}<div className="pagination">{f.page > 1 && <Link className="button" href={link(f.page - 1)}>Anterior</Link>}{f.page * 20 < (count ?? 0) && <Link className="button" href={link(f.page + 1)}>Siguiente</Link>}</div></>;
}
