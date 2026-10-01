'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { session } from '@/lib/auth/session';

const providerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contact_name: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.union([z.email().max(254), z.literal('')]),
  notes: z.string().trim().max(1000),
  active: z.boolean(),
}).refine((value) => Boolean(value.phone || value.email));

export async function saveProvider(form: FormData) {
  const { db, profile } = await session();
  if (profile.role !== 'CORPORATE_ADMIN') redirect('/providers?error=permission');
  const id = z.union([z.uuid(), z.literal('')]).safeParse(form.get('id'));
  const input = providerSchema.safeParse({
    name: form.get('name'), contact_name: form.get('contact_name'), phone: form.get('phone'),
    email: String(form.get('email') ?? '').trim(), notes: form.get('notes'), active: form.get('active') === 'on',
  });
  if (!id.success || !input.success) redirect('/providers?error=validation');
  const { error } = await db.rpc('save_provider', { p_id: id.data || null, p_input: input.data });
  if (error) redirect('/providers?error=save');
  revalidatePath('/providers');
  redirect('/providers?saved=1');
}
