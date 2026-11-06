import { z } from 'zod';
export const resolutionInput = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().min(10).max(2000),
  confirm: z.literal('yes'),
});
export function workflowError(error: { code?: string; message: string }) {
  if (error.code === 'PGRST202' || error.code === '42883')
    return 'Esta función necesita una actualización. Contacta con el administrador.';
  const messages: Record<string, string> = {
    'Incident changed': 'La incidencia ha cambiado. Recarga antes de continuar.',
    'Equipment changed': 'La máquina ha cambiado. Recarga y revisa su estado.',
    'Incidents pending': 'Quedan incidencias abiertas. Deben resolverse antes de autorizar el uso.',
    'Maintenance pending':
      'Quedan órdenes de mantenimiento abiertas. Deben cerrarse antes de continuar.',
    'Inspection in progress': 'Hay una inspección en curso. Debe finalizar antes de continuar.',
  };
  return (
    messages[error.message] ??
    'No se pudo guardar. Recarga y comprueba tus permisos y el estado actual.'
  );
}
