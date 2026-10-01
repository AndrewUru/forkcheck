'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { newEmployee } from '@/lib/validations/users';
export async function createEmployee(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('configure');
  const input = newEmployee.safeParse({
    ...Object.fromEntries(form),
    branches: form.getAll('branches'),
  });
  if (!input.success)
    return {
      message:
        'Revisa los datos: contraseña de 12 caracteres, ID en minúsculas y sucursales para roles operativos.',
    };
  const { error } = await db.functions.invoke('manage-users', { body: input.data });
  if (error)
    return {
      message:
        'No se pudo crear el usuario. Comprueba si el ID ya existe y si la función manage-users y la migración están instaladas.',
    };
  revalidatePath('/admin/assignments');
  revalidatePath('/admin/users');
  return { message: 'Usuario creado.' };
}
export async function deactivateEmployee(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('configure');
  const id = z.uuid().safeParse(form.get('user_id'));
  if (!id.success || form.get('confirm') !== 'yes')
    return { message: 'Confirma la baja del usuario.' };
  const { error } = await db.rpc('deactivate_employee', { p_user_id: id.data });
  if (error)
    return {
      message:
        'No se pudo dar de baja. No puedes eliminarte a ti mismo; comprueba la migración y recarga.',
    };
  revalidatePath('/admin', 'layout');
  revalidatePath('/equipment', 'layout');
  return { message: 'Usuario dado de baja. Su historial se conserva.' };
}
