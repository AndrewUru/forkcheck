'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignEquipment } from '@/app/fleet-actions';
export function AssignmentForm({
  employeeId,
  currentCode,
  assignmentId,
}: {
  employeeId: string;
  currentCode: string;
  assignmentId: string | null;
}) {
  const [code, setCode] = useState(currentCode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const r = await assignEquipment({
        employeeId,
        equipmentCode: code,
        expectedAssignment: assignmentId,
      });
      setFailed(!r.success);
      setMessage(r.error ?? 'Asignación guardada.');
      if (r.success) router.refresh();
    } catch {
      setFailed(true);
      setMessage(
        'No se pudo guardar. Recarga para comprobar la asignación actual antes de reintentar.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="assignment-form" onSubmit={save}>
      <label htmlFor={`equipment-${employeeId}`}>
        Código de equipo
        <input
          id={`equipment-${employeeId}`}
          name="equipmentCode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CAR-001"
          maxLength={60}
          disabled={busy}
        />
      </label>
      <small>Deja el campo vacío para quitar la asignación. El historial se conserva.</small>
      <button className="button" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar asignación'}
      </button>
      {message && (
        <p className={failed ? 'alert' : 'info-note'} role={failed ? 'alert' : 'status'}>
          {message}
        </p>
      )}
    </form>
  );
}
