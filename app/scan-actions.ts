'use server';
import { session } from '@/lib/auth/session';
import { publicCodeSchema } from '@/lib/qr';
export async function resolveScannedEquipment(
  input: unknown,
): Promise<{ href?: string; message?: string }> {
  const { db } = await session();
  const code = publicCodeSchema.safeParse(input);
  if (!code.success) return { message: 'Ese QR no es una etiqueta de equipo válida.' };
  const { data, error } = await db
    .from('equipment')
    .select('public_code')
    .eq('public_code', code.data)
    .maybeSingle();
  if (error)
    return {
      message: 'No se pudo consultar el equipo. Comprueba la conexión e inténtalo de nuevo.',
    };
  if (!data)
    return {
      message:
        'No encontramos un equipo accesible con esa etiqueta. Comprueba el QR o contacta con el administrador.',
    };
  return { href: `/equipment/${encodeURIComponent(data.public_code)}` };
}
