'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import { session } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { completionSchema, employeeEmail, loginSchema } from '@/lib/validations/inspection';
import { evaluateInspection } from '@/lib/inspections/evaluate';
export async function login(form: FormData) {
  const input = loginSchema.safeParse(Object.fromEntries(form));
  if (!input.success) redirect('/login?error=credentials');
  const db = await createClient();
  const { organization, employee, password } = input.data;
  const { error } = await db.auth.signInWithPassword({
    email: employeeEmail(organization, employee),
    password,
  });
  if (error) redirect('/login?error=credentials');
  redirect('/');
}
export async function logout() {
  const db = await createClient();
  await db.auth.signOut();
  redirect('/login');
}
export async function startInspection(form: FormData) {
  const { db, profile } = await session();
  if (!can(profile, 'inspect')) throw new Error('No tienes permiso para inspeccionar');
  const schedule = z.uuid().parse(form.get('schedule'));
  const { data, error } = await db.rpc('start_inspection', { p_schedule: schedule });
  if (error) redirect('/equipment?error=inspection');
  redirect(`/inspections/${data}`);
}
export async function uploadEvidence(form: FormData): Promise<{ path?: string; error?: string }> {
  const { db, profile } = await session();
  if (!can(profile, 'inspect')) return { error: 'Sin autorización' };
  const parsed = z
    .object({ inspection: z.uuid(), item: z.union([z.uuid(), z.literal('signature')]) })
    .safeParse({ inspection: form.get('inspection'), item: form.get('item') });
  const file = form.get('file');
  if (
    !parsed.success ||
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 5 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  )
    return { error: 'Utiliza PNG, JPEG o WebP de hasta 5 MB.' };
  const { data: inspection } = await db
    .from('inspections')
    .select('*')
    .eq('id', parsed.data.inspection)
    .eq('user_id', profile.id)
    .is('completed_at', null)
    .single();
  if (!inspection) return { error: 'Inspección no disponible' };
  try {
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
    })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const prefix = `${profile.organization_id}/${inspection.id}`;
    const path =
      parsed.data.item === 'signature'
        ? `${prefix}/signature.png`
        : `${prefix}/${parsed.data.item}/${crypto.randomUUID()}.png`;
    if (parsed.data.item === 'signature') {
      const { data: existing } = await db.storage
        .from('inspection-evidence')
        .list(prefix, { search: 'signature.png' });
      if (existing?.some((object) => object.name === 'signature.png')) return { path };
    }
    const { error } = await db.storage
      .from('inspection-evidence')
      .upload(path, bytes, { contentType: 'image/png', upsert: false });
    return error ? { error: 'No se pudo guardar la evidencia. Reintenta.' } : { path };
  } catch {
    return { error: 'El archivo no es una imagen válida o excede los límites.' };
  }
}
export async function completeInspection(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const { db, profile } = await session();
  if (!can(profile, 'inspect')) return { ok: false, error: 'Sin autorización' };
  const parsed = completionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa las respuestas.' };
  const { data: inspection } = await db
    .from('inspections')
    .select('*')
    .eq('id', parsed.data.inspectionId)
    .eq('user_id', profile.id)
    .single();
  if (!inspection) return { ok: false, error: 'Inspección no disponible' };
  if (inspection.completed_at) return { ok: true };
  const { data: items, error: itemError } = await db
    .from('checklist_items')
    .select('*')
    .eq('version_id', inspection.checklist_version_id);
  if (itemError || !items?.length)
    return { ok: false, error: 'No se pudo cargar la versión original.' };
  try {
    evaluateInspection(items, parsed.data.answers);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Respuestas inválidas' };
  }
  const { error } = await db.rpc('finish_inspection', {
    p_inspection: inspection.id,
    p_answers: parsed.data.answers,
  });
  if (error)
    return {
      ok: false,
      error:
        'No se ha finalizado. Comprueba la firma, las fotografías y que el equipo siga en la misma sucursal. Puedes reintentar sin duplicar resultados.',
    };
  revalidatePath('/admin');
  revalidatePath('/equipment');
  revalidatePath(`/inspections/${inspection.id}`);
  return { ok: true };
}
