'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateNickname } from '@/app/fleet-actions';
export function NicknameForm({ nickname }: { nickname: string | null }) {
  const [value, setValue] = useState(nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const r = await updateNickname(value);
      setFailed(!r.success);
      setMessage(r.error ?? 'Nickname guardado.');
      if (r.success) router.refresh();
    } catch {
      setFailed(true);
      setMessage('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="management-form" onSubmit={submit}>
      <label>
        Tu nickname
        <input
          name="nickname"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={40}
          disabled={busy}
          autoComplete="nickname"
          placeholder="Cómo quieres aparecer en la app"
        />
      </label>
      <p className="help-text">
        Opcional. Tu ID de empleado y tus credenciales de acceso no cambian.
      </p>
      {message && (
        <p className={failed ? 'alert' : 'info-note'} role={failed ? 'alert' : 'status'}>
          {message}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar nickname'}
      </button>
    </form>
  );
}
