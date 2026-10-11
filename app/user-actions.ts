'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { newEmployee, chiefDesignation } from '@/lib/validations/users';
import { rolesForNewUsers } from '@/lib/permissions';
export async function createEmployee(_previous: { message: string }, form: FormData) {
  const { db, profile } = await requirePermission('create_users');
  const input = newEmployee.safeParse({
    ...Object.fromEntries(form),
    branches: form.getAll('branches'),
  });
  if (!input.success)
    return {
      message:
        'Revisa los datos: contraseña de 12 caracteres, ID en minúsculas y sucursales para roles operativos.',
    };
  if (!rolesForNewUsers(profile).includes(input.data.role))
    return { message: 'Tu rol no permite crear ese tipo de usuario.' };
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
export async function designateChief(_previous: { message: string }, form: FormData) {
  const { db } = await requirePermission('designate_chiefs');
  const parsed = chiefDesignation.safeParse({
    userId: form.get('userId'),
    branches: form.getAll('branches'),
    expectedRole: form.get('expectedRole'),
    expectedBranches: form.getAll('expectedBranches'),
  });
  if (!parsed.success || form.get('confirm') !== 'yes')
    return { message: 'Selecciona los centros y confirma la designación.' };
  const { error } = await db.rpc('designate_warehouse_chief', {
    p_user_id: parsed.data.userId,
    p_branches: parsed.data.branches,
    p_expected_role: parsed.data.expectedRole,
    p_expected_branches: parsed.data.expectedBranches,
  });
  if (error)
    return {
      message: error.message.includes('still in progress')
        ? 'El usuario debe terminar sus inspecciones abiertas antes de la designación.'
        : 'No se pudo designar al jefe. Recarga y comprueba que todos sus centros y asignaciones estén dentro de tu alcance.',
    };
  revalidatePath('/admin', 'layout');
  revalidatePath('/equipment', 'layout');
  return { message: 'Jefe de almacén y centros autorizados guardados.' };
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
