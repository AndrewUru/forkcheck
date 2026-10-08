import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { checklistSchemaReady } from '@/lib/checklists';
import { ChecklistUpdateNotice } from '@/components/checklists/update-notice';
import { TemplateForm } from '@/components/checklists/forms';
export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const { db } = await requirePermission('configure');
  if (!await checklistSchemaReady(db)) return <ChecklistUpdateNotice />;
  const { source } = await searchParams;
  const types = await db.from('equipment_types').select('id,name').order('name').limit(201);
  if (types.error) throw new Error('No se pudieron cargar los tipos de equipo.');
  let defaults;
  if (source) {
    if (!z.uuid().safeParse(source).success) notFound();
    const version = await db.from('checklist_versions').select('template_id').eq('id', source).maybeSingle();
    if (version.error) throw new Error('No se pudo cargar la versión.');
    if (!version.data) notFound();
    const template = await db.from('checklist_templates').select('*').eq('id', version.data.template_id).single();
    if (template.error) throw new Error('No se pudo cargar la plantilla original.');
    defaults = { ...template.data, name: `${template.data.name.slice(0, 112)} (copia)` };
  }
  return <><Link className="back-link" href="/admin/templates">← Plantillas</Link><div className="page-heading"><h1>{source ? 'Duplicar plantilla' : 'Nueva plantilla'}</h1></div>{types.data.length === 0 ? <p>Necesitas un tipo de equipo en la organización antes de crear plantillas.</p> : types.data.length > 200 ? <p>El catálogo supera los 200 tipos de equipo admitidos por este selector. Contacta con el responsable de configuración.</p> : <TemplateForm types={types.data} source={source} defaults={defaults} />}</>;
}
