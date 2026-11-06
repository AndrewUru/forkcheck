import { z } from 'zod';

const messages: Record<string, string> = {
  AUTH_REQUIRED: 'Tu sesión ha caducado. Vuelve a iniciar sesión antes de crear el usuario.',
  FORBIDDEN: 'No tienes permiso para crear ese usuario o asignarle esas sucursales.',
  INVALID_INPUT: 'Revisa los datos del empleado y las sucursales seleccionadas.',
  DUPLICATE_USER:
    'Ese ID de empleado ya existe en tu empresa. Utiliza otro o revisa la cuenta existente.',
  WEAK_PASSWORD:
    'La contraseña no cumple la política de seguridad. Utiliza una contraseña más larga y variada.',
  SETUP_REQUIRED: 'El alta de usuarios necesita una actualización. Contacta con el administrador.',
  CLEANUP_REQUIRED:
    'El alta quedó incompleta. Contacta con el administrador antes de volver a intentarlo.',
  PROFILE_FAILED: 'No se pudo asignar el perfil. Recarga y comprueba los permisos y sucursales.',
  AUTH_UNAVAILABLE:
    'El servicio de usuarios no está disponible. Espera un momento antes de reintentar.',
};
const fallback =
  'No se pudo crear el usuario. Recarga y vuelve a intentarlo; si persiste, contacta con el administrador.';

// Only emit allowlisted messages. Auth responses may contain internal identifiers.
export async function employeeCreationError(error: unknown): Promise<string> {
  if (
    !error ||
    typeof error !== 'object' ||
    !('context' in error) ||
    !(error.context instanceof Response)
  )
    return fallback;
  const response = error.context;
  try {
    const parsed = z.object({ code: z.string() }).safeParse(await response.clone().json());
    if (parsed.success && messages[parsed.data.code]) return messages[parsed.data.code];
  } catch {
    /* Gateways may return a non-JSON error. */
  }
  if (response.status === 401) return messages.AUTH_REQUIRED;
  if (response.status === 403) return messages.FORBIDDEN;
  if (response.status === 404) return messages.SETUP_REQUIRED;
  if (response.status === 429 || response.status >= 500) return messages.AUTH_UNAVAILABLE;
  return fallback;
}
