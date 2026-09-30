'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { retireEquipment } from '@/app/fleet-actions';
export function RetireEquipmentForm({
  publicCode,
  internalCode,
}: {
  publicCode: string;
  internalCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const r = await retireEquipment({
        publicCode,
        confirmCode: f.get('confirmCode'),
        reason: f.get('reason'),
      });
      if (r.success) {
        setOpen(false);
        router.refresh();
      } else setError(r.error ?? 'No se ha retirado el equipo.');
    } catch {
      setError('No se pudo confirmar la baja. Recarga la ficha para comprobar su estado.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel detail-panel retirement-panel">
      <h2>Renovación de flota</h2>
      <p>
        Retira este equipo cuando deje de formar parte de la flota. Se conservan las inspecciones e
        incidencias y sus usuarios quedan sin equipo asignado.
      </p>
      {!open ? (
        <button className="button danger-button" onClick={() => setOpen(true)}>
          Dar de baja equipo
        </button>
      ) : (
        <form className="management-form" onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>
              Motivo de la baja
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder="Sustitución por renovación de flota…"
              />
            </label>
            <label>
              Escribe {internalCode} para confirmar
              <input name="confirmCode" required maxLength={60} autoComplete="off" />
            </label>
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <div className="heading-actions">
              <button className="button danger-button" disabled={busy}>
                {busy ? 'Retirando…' : 'Confirmar baja'}
              </button>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
