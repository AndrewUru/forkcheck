'use client';
import { useActionState } from 'react';
import { createEmployee, deactivateEmployee } from '@/app/user-actions';
import { roleLabels, type Role } from '@/types/domain';
import { rolesForNewUsers } from '@/lib/permissions';
export function CreateEmployeeForm({
  branches,
  actorRole,
}: {
  branches: { id: string; name: string }[];
  actorRole: Role;
}) {
  const [state, action, pending] = useActionState(createEmployee, { message: '' });
  return (
    <form action={action} className="panel detail-panel management-form">
      <h2>Crear usuario</h2>
      <fieldset disabled={pending}>
        <label>
          ID de empleado
          <input
            name="employee_id"
            required
            pattern="[a-z0-9_\-]{1,40}"
            maxLength={40}
            autoComplete="off"
          />
        </label>
        <label>
          Nombre
          <input name="first_name" required maxLength={100} />
        </label>
        <label>
          Apellidos
          <input name="last_name" required maxLength={100} />
        </label>
        <label>
          Contraseña inicial
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          Rol
          <select name="role">
            {rolesForNewUsers({ role: actorRole, active: true }).map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>
            Sucursales autorizadas
            {actorRole === 'CORPORATE_ADMIN'
              ? ' (obligatorias salvo director general)'
              : ' (obligatorias)'}
          </legend>
          {actorRole === 'CORPORATE_ADMIN' && (
            <p>
              Dirección regional consulta las sucursales que selecciones. Dirección general consulta
              toda la organización.
            </p>
          )}
          {branches.map((branch) => (
            <label key={branch.id} className="user-checkbox">
              <input name="branches" type="checkbox" value={branch.id} /> {branch.name}
            </label>
          ))}
        </fieldset>
        <button className="button primary">{pending ? 'Creando…' : 'Crear usuario'}</button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  );
}
export function DeactivateEmployeeForm({ id, employee }: { id: string; employee: string }) {
  const [state, action, pending] = useActionState(deactivateEmployee, { message: '' });
  return (
    <form action={action} className="management-form">
      <input type="hidden" name="user_id" value={id} />
      <label className="user-checkbox">
        <input type="checkbox" name="confirm" value="yes" required disabled={pending} /> Confirmo la
        baja de {employee}. Perderá el acceso y sus asignaciones; el historial se conserva.
      </label>
      <button className="button" disabled={pending}>
        {pending ? 'Eliminando…' : 'Eliminar usuario (dar de baja)'}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}
