'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignMyEquipment } from '@/app/fleet-actions';

export function SelfAssignmentForm({
  equipmentCode,
  assignmentId,
  current,
}: {
  equipmentCode: string;
  assignmentId: string | null;
  current: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await assignMyEquipment({
        equipmentCode: current ? '' : equipmentCode,
        expectedAssignment: assignmentId,
      });
      setMessage(result.error ?? (current ? 'Asignación retirada.' : 'Equipo asignado.'));
      if (result.success) router.refresh();
    } catch {
      setMessage('No se pudo guardar. Recarga para comprobar tu asignación antes de reintentar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel detail-panel management-form" onSubmit={save}>
      <h2>Mi asignación</h2>
      <p>
        {current
          ? 'Este es tu equipo asignado.'
          : assignmentId
            ? 'Al confirmar cambiarás tu asignación actual a este equipo.'
            : 'Puedes asignarte este equipo de tu centro.'}
      </p>
      <p>
        Asignarte una máquina no autoriza su uso: respeta sus bloqueos y las revisiones pendientes.
      </p>
      <button className="button" disabled={busy}>
        {busy ? 'Guardando…' : current ? 'Quitar mi asignación' : 'Asignarme este equipo'}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
