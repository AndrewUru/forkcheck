'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { templateInput, sectionsInput } from '@/lib/validations/checklists';
const errorMessage = 'No se pudo guardar. Comprueba que la plantilla sigue activa y recarga si otro administrador la ha modificado.';
export async function createTemplate(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('configure');
  const parsed = templateInput.safeParse({ ...Object.fromEntries(form), custom_days: form.get('frequency') === 'CUSTOM' ? Number(form.get('custom_days')) : null });
  const source = z.uuid().nullable().safeParse(form.get('source') || null);
  if (!parsed.success || !source.success) return { message: 'Revisa el nombre, tipo de equipo y periodicidad (1–3650 días).' };
  const { data, error } = await db.rpc('create_checklist_template', { p_input: parsed.data, p_source: source.data });
  if (error || !data) return { message: errorMessage };
  revalidatePath('/admin/templates');
  redirect(`/admin/templates/${data}`);
}
export async function createDraft(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('configure');
  const id = z.uuid().safeParse(form.get('template'));
  if (!id.success) return { message: 'Plantilla no válida.' };
  const { data, error } = await db.rpc('create_checklist_draft', { p_template: id.data });
  if (error || !data) return { message: errorMessage };
  revalidatePath(`/admin/templates/${id.data}`);
  redirect(`/admin/templates/${id.data}?version=${data}`);
}
export async function saveDraft(input: unknown): Promise<{ message: string; revision?: number }> {
  const { db } = await requirePermission('configure');
  const parsed = z.object({ version: z.uuid(), revision: z.number().int().nonnegative(), sections: sectionsInput }).safeParse(input);
  if (!parsed.success) return { message: 'Revisa los títulos y las respuestas permitidas. Cada sección necesita preguntas. Máximo 30 secciones y 200 preguntas.' };
  const { data, error } = await db.rpc('save_checklist_draft', { p_version: parsed.data.version, p_revision: parsed.data.revision, p_sections: parsed.data.sections });
  if (error || data === null) return { message: errorMessage };
  return { message: 'Borrador guardado. Ya puedes publicarlo.', revision: data };
}
export async function publishVersion(input: unknown): Promise<{ message: string; published?: boolean }> {
  const { db } = await requirePermission('configure');
  const parsed = z.object({ version: z.uuid(), revision: z.number().int().nonnegative(), confirm: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { message: 'Confirma la publicación.' };
  const { error } = await db.rpc('publish_checklist_version', { p_version: parsed.data.version, p_revision: parsed.data.revision });
  if (error) return { message: 'No se pudo publicar. Guarda un borrador completo y recarga si ha cambiado o se ha retirado la plantilla.' };
  revalidatePath('/admin/templates', 'layout');
  revalidatePath('/admin/equipment/new');
  return { message: 'Versión publicada. Se utilizará en las nuevas inspecciones.', published: true };
}
export async function retireTemplate(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('configure');
  const parsed = z.object({ template: z.uuid(), confirm: z.literal('yes') }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: 'Confirma la retirada del catálogo.' };
  const { error } = await db.rpc('retire_checklist_template', { p_template: parsed.data.template });
  if (error) return { message: errorMessage };
  revalidatePath('/admin/templates', 'layout');
  revalidatePath('/admin/equipment/new');
  return { message: 'Plantilla retirada del catálogo. Los planes existentes continúan.' };
}
