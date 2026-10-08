import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { checklistSchemaReady } from '@/lib/checklists';
import { ChecklistUpdateNotice } from '@/components/checklists/update-notice';
import { DraftButton, RetireTemplateForm } from '@/components/checklists/forms';
import { ChecklistEditor } from '@/components/checklists/editor';
import { ChecklistPreview } from '@/components/checklists/preview';
import { parseFilters, type SearchParams } from '@/lib/validations/filters';
import { frequencies, frequencyLabels } from '@/lib/validations/checklists';
export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { db } = await requirePermission('configure');
  if (!await checklistSchemaReady(db)) return <ChecklistUpdateNotice />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const search = await searchParams;
  const { page } = parseFilters(search);
  if (search.version && !z.uuid().safeParse(search.version).success) notFound();
  const [template, history] = await Promise.all([
    db.from('checklist_templates').select('*').eq('id', id).maybeSingle(),
    db.from('checklist_versions').select('*', { count: 'exact' }).eq('template_id', id).order('version', { ascending: false }).range((page - 1) * 10, page * 10 - 1),
  ]);
  if (template.error || history.error) throw new Error('No se pudo cargar la plantilla.');
  if (!template.data) notFound();
  const t = template.data;
  let selected = db.from('checklist_versions').select('*').eq('template_id', id);
  if (typeof search.version === 'string') selected = selected.eq('id', search.version);
  const { data: version, error } = await selected.order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('No se pudo cargar la versión.');
  if (!version) notFound();
  const [sections, items, type] = await Promise.all([
    db.from('checklist_sections').select('*').eq('version_id', version.id).order('sort_order').order('id').limit(31),
    db.from('checklist_items').select('*').eq('version_id', version.id).order('sort_order').order('id').limit(201),
    db.from('equipment_types').select('name').eq('id', t.equipment_type_id).single(),
  ]);
  if (sections.error || items.error || type.error) throw new Error('No se pudo cargar el contenido del checklist.');
  const content = sections.data.map((s) => ({ title: s.title, items: items.data.filter((q) => q.section_id === s.id) }));
  const frequency = z.enum(frequencies).parse(t.frequency);
  const historyLink = (p: number) => `?${new URLSearchParams({ page: String(p), version: version.id })}`;
  return <><Link className="back-link" href="/admin/templates">← Plantillas</Link><div className="page-heading"><div><p className="eyebrow">PLANTILLA DE INSPECCIÓN</p><h1>{t.name}</h1><p>{type.data.name} · {frequencyLabels[frequency]}{frequency === 'CUSTOM' ? ` (${t.custom_days} días)` : ''} · {t.archived_at ? 'Retirada' : 'Activa'}</p></div><Link className="button" href={`/admin/templates/new?source=${version.id}`}>Duplicar esta versión</Link></div>
    <section className="panel detail-panel"><h2>Versiones</h2><p>Las nuevas inspecciones usan la última publicada. Las ya iniciadas conservan su versión.</p><ul>{history.data.map((v) => <li key={v.id}><Link href={`?version=${v.id}&page=${page}`} aria-current={v.id === version.id ? 'page' : undefined}>Versión {v.version} · {v.published_at ? 'Publicada' : 'Borrador'}{v.id === version.id ? ' · seleccionada' : ''}</Link></li>)}</ul><div className="pagination">{page > 1 && <Link className="button" href={historyLink(page - 1)}>Versiones anteriores en la lista</Link>}{page * 10 < (history.count ?? 0) && <Link className="button" href={historyLink(page + 1)}>Más versiones</Link>}</div>{!t.archived_at && <DraftButton template={id} />}</section>
    <h2>Versión {version.version} · {version.published_at ? 'Publicada' : 'Borrador'}</h2>
    {sections.data.length > 30 || items.data.length > 200 ? <p>Esta versión excede los límites del editor (30 secciones y 200 preguntas). No se mostrará un contenido incompleto.</p> : !version.published_at && !t.archived_at ? <ChecklistEditor key={`${version.id}:${version.edit_revision}`} version={version.id} revision={version.edit_revision} initial={content} /> : <section className="panel detail-panel"><p>Solo lectura. Para cambiar una versión publicada, abre un nuevo borrador.</p><ChecklistPreview sections={content} /></section>}
    {!t.archived_at && <RetireTemplateForm template={id} />}
  </>;
}
