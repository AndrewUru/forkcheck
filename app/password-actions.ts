'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { passwordSession, requirePermission } from '@/lib/auth/session';
import { passwordChange, passwordReset } from '@/lib/validations/password';

export async function changePassword(_previous: { message: string }, form: FormData) {
  const { db, user, profile } = await passwordSession();
  if (typeof profile.must_change_password !== 'boolean')
    return {
      message: 'Falta instalar la actualización de contraseñas. Contacta con el administrador.',
    };
  const parsed = passwordChange.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      message:
        'La nueva contraseña debe ser distinta, tener entre 12 y 128 caracteres y coincidir con la confirmación.',
    };
  if (!user.email) return { message: 'No se pudo verificar tu cuenta.' };
  // Refresh this same identity's session so secure password changes use a recent login.
  const { data, error: verificationError } = await db.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current_password,
  });
  if (verificationError || data.user?.id !== user.id)
    return {
      message: 'No se pudo verificar la contraseña actual. Revísala o espera antes de reintentar.',
    };
  const { error } = await db.auth.updateUser({
    password: parsed.data.password,
    current_password: parsed.data.current_password,
  });
  if (error)
    return {
      message:
        'No se pudo cambiar la contraseña. Revisa la política de seguridad o vuelve a iniciar sesión e inténtalo de nuevo.',
    };
  revalidatePath('/', 'layout');
  redirect('/profile?password=changed');
}

export async function resetEmployeePassword(
  _previous: { message: string; temporaryPassword?: string },
  form: FormData,
): Promise<{ message: string; temporaryPassword?: string }> {
  const { db } = await requirePermission('configure');
  const parsed = passwordReset.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: 'Confirma que has verificado la identidad del empleado.' };
  const { data, error } = await db.functions.invoke('manage-users', {
    body: { action: 'reset_password', user_id: parsed.data.user_id },
  });
  const result = z.object({ temporaryPassword: z.string().min(12).max(128) }).safeParse(data);
  if (error || !result.success)
    return {
      message:
        'No se pudo restablecer. Comprueba que el usuario sigue activo y que la actualización está instalada. Espera un minuto antes de reintentar.',
    };
  revalidatePath('/admin/users');
  return {
    message: 'Contraseña restablecida. Entrégala individualmente; tendrá que cambiarla al entrar.',
    temporaryPassword: result.data.temporaryPassword,
  };
}
