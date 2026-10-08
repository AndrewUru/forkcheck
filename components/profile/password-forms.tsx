'use client';
import { useActionState, useState } from 'react';
import { changePassword, resetEmployeePassword } from '@/app/password-actions';

export function ChangePasswordForm({ required = false }: { required?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, { message: '' });
  return (
    <form action={action} className="management-form">
      <p>
        {required
          ? 'Elige una contraseña personal para continuar.'
          : 'Confirma tu contraseña actual y elige una nueva.'}{' '}
        Usa entre 12 y 128 caracteres.
      </p>
      <fieldset disabled={pending}>
        <label>
          {required ? 'Contraseña temporal' : 'Contraseña actual'}
          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          Nueva contraseña
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          Repite la nueva contraseña
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <button className="button primary">{pending ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  );
}

export function ResetPasswordForm({ id, employee }: { id: string; employee: string }) {
  const [generation, setGeneration] = useState(0);
  return (
    <ResetPasswordAttempt
      key={generation}
      id={id}
      employee={employee}
      onDismiss={() => setGeneration((value) => value + 1)}
    />
  );
}

function ResetPasswordAttempt({
  id,
  employee,
  onDismiss,
}: {
  id: string;
  employee: string;
  onDismiss: () => void;
}) {
  const [state, action, pending] = useActionState(resetEmployeePassword, { message: '' });
  if (state.temporaryPassword)
    return (
      <section className="management-form" aria-label={`Contraseña temporal de ${employee}`}>
        <p role="status">{state.message}</p>
        <label>
          Contraseña temporal de {employee}
          <input
            readOnly
            value={state.temporaryPassword}
            autoComplete="off"
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <p>Solo se muestra ahora. Al cerrar no podrás consultarla de nuevo.</p>
        <button type="button" className="button" onClick={onDismiss}>
          Ya la he entregado: cerrar
        </button>
      </section>
    );
  return (
    <form action={action} className="management-form">
      <input type="hidden" name="user_id" value={id} />
      <label className="user-checkbox">
        <input type="checkbox" name="confirm" value="yes" required disabled={pending} /> He
        verificado la identidad de {employee}. Su contraseña actual dejará de funcionar.
      </label>
      <button className="button" disabled={pending}>
        {pending ? 'Restableciendo…' : 'Restablecer contraseña'}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}
