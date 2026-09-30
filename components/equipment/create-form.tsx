'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEquipment } from '@/app/fleet-actions';
type Option = { id: string; name: string };
export function CreateEquipmentForm({
  types,
  branches,
  zones,
  templates,
}: {
  types: Option[];
  branches: Option[];
  zones: (Option & { branch_id: string })[];
  templates: (Option & { equipment_type_id: string })[];
}) {
  const [type, setType] = useState(types[0]?.id ?? '');
  const [branch, setBranch] = useState(branches[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await createEquipment(Object.fromEntries(new FormData(event.currentTarget)));
      if (result.publicCode) router.push(`/equipment/${result.publicCode}`);
      else setError(result.error ?? 'No se pudo crear el equipo.');
    } catch {
      setError(
        'No se pudo contactar con el servidor. Antes de reintentar, comprueba si el código ya aparece en Equipos.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel detail-panel management-form">
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label>
            Código interno
            <input name="internal_code" required maxLength={60} placeholder="CAR-041" />
          </label>
          <label>
            Tipo de equipo
            <select
              name="equipment_type_id"
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Marca
            <input name="brand" required maxLength={80} placeholder="Still, Linde, Toyota…" />
          </label>
          <label>
            Modelo
            <input name="model" required maxLength={80} />
          </label>
          <label>
            Número de serie
            <input name="serial_number" maxLength={100} />
          </label>
          <label>
            Año de fabricación
            <input name="year" type="number" min={1900} max={2200} />
          </label>
          <label>
            Sucursal
            <select
              name="branch_id"
              required
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zona
            <select name="zone_id" key={branch} defaultValue="">
              <option value="">Sin zona</option>
              {zones
                .filter((z) => z.branch_id === branch)
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Plan de inspección
            <select name="template_id" required key={type} defaultValue="">
              <option value="" disabled>
                Selecciona una plantilla publicada
              </option>
              {templates
                .filter((t) => t.equipment_type_id === type)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="info-note">
          Se creará un equipo operativo con ubicación, QR y plan de inspección. Después puedes
          asignarlo a un usuario.
        </p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={busy || !templates.some((t) => t.equipment_type_id === type)}
        >
          {busy ? 'Creando equipo…' : 'Dar de alta equipo'}
        </button>
      </fieldset>
    </form>
  );
}
