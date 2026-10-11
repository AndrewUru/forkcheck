'use client';
import { useActionState } from 'react';
import { designateChief } from '@/app/user-actions';

export function ChiefDesignationForm({
  userId,
  currentRole,
  currentBranches,
  branches,
}: {
  userId: string;
  currentRole: 'OPERARIO' | 'JEFE_ALMACEN';
  currentBranches: string[];
  branches: { id: string; name: string }[];
}) {
  const [state, action, busy] = useActionState(designateChief, { message: '' });
  return (
    <form action={action} className="panel detail-panel management-form">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="expectedRole" value={currentRole} />
      {currentBranches.map((id) => (
        <input key={id} type="hidden" name="expectedBranches" value={id} />
      ))}
      <fieldset disabled={busy}>
        <legend>Centros a cargo del jefe de almacén</legend>
        {branches.map((b) => (
          <label key={b.id} className="user-checkbox">
            <input
              type="checkbox"
              name="branches"
              value={b.id}
              defaultChecked={currentBranches.includes(b.id)}
            />{' '}
            {b.name}
          </label>
        ))}
        {currentRole === 'OPERARIO' && (
          <p>
            La designación cierra su asignación personal de maquinaria y conserva el historial. Debe
            terminar sus inspecciones abiertas antes de continuar.
          </p>
        )}
        <label className="user-checkbox">
          <input type="checkbox" name="confirm" value="yes" required /> Confirmo el cargo y los
          centros seleccionados.
        </label>
        <button className="button primary">{busy ? 'Guardando…' : 'Guardar designación'}</button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  );
}
