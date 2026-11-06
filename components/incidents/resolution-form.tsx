'use client';
import { useActionState } from 'react';
import { resolveIncident, returnEquipmentToService } from '@/app/incident-actions';

export function ResolutionForm({
  id,
  updatedAt,
  equipment = false,
}: {
  id: string;
  updatedAt: string;
  equipment?: boolean;
}) {
  const [state, action, pending] = useActionState(
    equipment ? returnEquipmentToService : resolveIncident,
    { message: '' },
  );
  return (
    <details className="equipment-information">
      <summary>{equipment ? 'Autorizar puesta en servicio' : 'Registrar resolución'}</summary>
      <form action={action} className="management-form">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
        <fieldset disabled={pending}>
          <label>
            {equipment
              ? 'Verificación realizada y motivo de la autorización'
              : 'Reparación realizada y comprobación del resultado'}
            <textarea name="notes" required minLength={10} maxLength={2000} rows={4} />
          </label>
          <label className="user-checkbox">
            <input type="checkbox" name="confirm" value="yes" required />
            {equipment
              ? 'He comprobado el equipo y autorizo su vuelta al servicio. Las revisiones programadas siguen vigentes.'
              : 'Confirmo que la incidencia está resuelta. Cerrar este reporte no desbloquea la máquina.'}
          </label>
          <button className="button" type="submit">
            {pending
              ? 'Guardando…'
              : equipment
                ? 'Autorizar puesta en servicio'
                : 'Cerrar incidencia'}
          </button>
        </fieldset>
        <p role="status">{state.message}</p>
      </form>
    </details>
  );
}
