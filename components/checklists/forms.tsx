'use client';
import { useActionState, useState } from 'react';
import { createTemplate, createDraft, retireTemplate } from '@/app/checklist-actions';
import { frequencies, frequencyLabels } from '@/lib/validations/checklists';

export function TemplateForm({ types, source, defaults }: { types: { id: string; name: string }[]; source?: string; defaults?: { name: string; equipment_type_id: string; frequency: string; custom_days: number | null } }) {
  const [state, action, pending] = useActionState(createTemplate, { message: '' });
  const [frequency, setFrequency] = useState(defaults?.frequency ?? 'DAILY');
  return <form action={action} className="panel detail-panel management-form">
    {source && <input type="hidden" name="source" value={source} />}
    <fieldset disabled={pending}>
      <label>Nombre de la plantilla<input name="name" required maxLength={120} defaultValue={defaults?.name ?? ''} /></label>
      <label>Tipo de equipo<select name="equipment_type_id" required defaultValue={defaults?.equipment_type_id ?? ''}><option value="">Selecciona un tipo</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Periodicidad<select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}>{frequencies.map((f) => <option key={f} value={f}>{frequencyLabels[f]}</option>)}</select></label>
      {frequency === 'CUSTOM' && <label>Intervalo en días<input type="number" name="custom_days" min={1} max={3650} required defaultValue={defaults?.custom_days ?? 1} /></label>}
      <p>El tipo y la periodicidad quedan fijados al crear la plantilla. Podrás duplicarla para cambiar esos datos.</p>
      <button className="button primary">{pending ? 'Creando…' : source ? 'Crear copia como borrador' : 'Crear plantilla y borrador'}</button>
    </fieldset><p role="status">{state.message}</p>
  </form>;
}
export function DraftButton({ template }: { template: string }) {
  const [state, action, pending] = useActionState(createDraft, { message: '' });
  return <form action={action}><input type="hidden" name="template" value={template} /><button className="button" disabled={pending}>{pending ? 'Abriendo…' : 'Editar nueva versión / abrir borrador'}</button><p role="status">{state.message}</p></form>;
}
export function RetireTemplateForm({ template }: { template: string }) {
  const [state, action, pending] = useActionState(retireTemplate, { message: '' });
  return <form action={action} className="panel detail-panel management-form"><h2>Retirar del catálogo</h2><input type="hidden" name="template" value={template} /><label className="user-checkbox"><input type="checkbox" name="confirm" value="yes" required disabled={pending} /> Confirmo que no podrá utilizarse en nuevas altas ni editarse. Los planes existentes seguirán funcionando.</label><button className="button" disabled={pending}>{pending ? 'Retirando…' : 'Retirar plantilla'}</button><p role="status">{state.message}</p></form>;
}
