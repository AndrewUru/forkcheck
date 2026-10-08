'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveDraft, publishVersion } from '@/app/checklist-actions';
import { answerKinds } from '@/types/domain';
import { answerLabels, type DraftQuestion, type DraftSection } from '@/lib/validations/checklists';
import { ChecklistPreview } from './preview';

type Question = DraftQuestion & { key: string };
type Section = Omit<DraftSection, 'items'> & { key: string; items: Question[] };
const emptyQuestion = (): Question => ({ key: crypto.randomUUID(), label: '', description: '', required: true, severity_when_failed: 'MEDIUM', requires_photo_on_failure: false, blocks_equipment_on_failure: false, allowed_answers: [...answerKinds] });
function move<T>(values: T[], from: number, to: number): T[] {
  const result = [...values];
  if (to < 0 || to >= result.length) return result;
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
export function ChecklistEditor({ version, revision: initialRevision, initial }: { version: string; revision: number; initial: DraftSection[] }) {
  const [sections, setSections] = useState<Section[]>(() => initial.map((s, i) => ({ ...s, key: `s-${i}`, items: s.items.map((q, j) => ({ ...q, key: `q-${i}-${j}` })) })));
  const [revision, setRevision] = useState(initialRevision);
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(next: Section[]) { setSections(next); setDirty(true); setConfirmed(false); setMessage('Hay cambios sin guardar.'); }
  function updateSection(index: number, update: Partial<Section>) { change(sections.map((s, i) => i === index ? { ...s, ...update } : s)); }
  function updateQuestion(si: number, qi: number, update: Partial<DraftQuestion>) { updateSection(si, { items: sections[si].items.map((q, i) => i === qi ? { ...q, ...update } : q) }); }
  return <div className="checklist-editor">
    <form className="management-form" onSubmit={(event) => {
      event.preventDefault();
      startTransition(async () => {
        try { const result = await saveDraft({ version, revision, sections }); setMessage(result.message); if (result.revision !== undefined) { setRevision(result.revision); setDirty(false); setConfirmed(false); } }
        catch { setMessage('No se pudo guardar. Tus cambios siguen en este formulario; reintenta cuando recuperes la conexión.'); }
      });
    }}>
      <fieldset disabled={pending}>
        <p>{sections.length}/30 secciones · {total}/200 preguntas. {dirty ? 'Cambios sin guardar.' : 'Contenido guardado.'}</p>
        <p>Los fallos generan incidencias. Una respuesta crítica, una gravedad crítica o la opción de bloqueo bloquean el equipo; ninguna respuesta lo desbloquea automáticamente.</p>
        {sections.map((section, si) => <section className="panel detail-panel" key={section.key}>
          <h2>Sección {si + 1}</h2>
          <label>Título de la sección<input value={section.title} required maxLength={120} onChange={(e) => updateSection(si, { title: e.target.value })} /></label>
          <div className="checklist-toolbar">
            <button type="button" className="button" disabled={si === 0} onClick={() => change(move(sections, si, si - 1))}>Subir sección {si + 1}</button>
            <button type="button" className="button" disabled={si === sections.length - 1} onClick={() => change(move(sections, si, si + 1))}>Bajar sección {si + 1}</button>
            <button type="button" className="button" onClick={() => { if (window.confirm('¿Quitar esta sección y sus preguntas del borrador?')) change(sections.filter((_, i) => i !== si)); }}>Quitar sección {si + 1}</button>
          </div>
          {section.items.map((q, qi) => <fieldset className="checklist-question" key={q.key}>
            <legend>Pregunta {si + 1}.{qi + 1}</legend>
            <label>Pregunta<input required maxLength={300} value={q.label} onChange={(e) => updateQuestion(si, qi, { label: e.target.value })} /></label>
            <label>Instrucciones<textarea maxLength={2000} rows={2} value={q.description} onChange={(e) => updateQuestion(si, qi, { description: e.target.value })} /></label>
            <label className="user-checkbox"><input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(si, qi, { required: e.target.checked })} />Respuesta obligatoria</label>
            <fieldset><legend>Respuestas permitidas (al menos una)</legend>{answerKinds.map((answer) => <label className="user-checkbox" key={answer}><input type="checkbox" checked={q.allowed_answers.includes(answer)} onChange={(e) => updateQuestion(si, qi, { allowed_answers: e.target.checked ? [...q.allowed_answers, answer] : q.allowed_answers.filter((a) => a !== answer) })} />{answerLabels[answer]}</label>)}</fieldset>
            <label>Gravedad de un fallo<select value={q.severity_when_failed} onChange={(e) => { const value = e.target.value; if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL') updateQuestion(si, qi, { severity_when_failed: value }); }}><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica (bloquea)</option></select></label>
            <label className="user-checkbox"><input type="checkbox" checked={q.requires_photo_on_failure} onChange={(e) => updateQuestion(si, qi, { requires_photo_on_failure: e.target.checked })} />Exigir fotografía ante un fallo</label>
            <label className="user-checkbox"><input type="checkbox" checked={q.blocks_equipment_on_failure} onChange={(e) => updateQuestion(si, qi, { blocks_equipment_on_failure: e.target.checked })} />Bloquear equipo ante cualquier fallo</label>
            <div className="checklist-toolbar"><button type="button" className="button" disabled={qi === 0} onClick={() => updateSection(si, { items: move(section.items, qi, qi - 1) })}>Subir pregunta {qi + 1}</button><button type="button" className="button" disabled={qi === section.items.length - 1} onClick={() => updateSection(si, { items: move(section.items, qi, qi + 1) })}>Bajar pregunta {qi + 1}</button><button type="button" className="button" onClick={() => { if (window.confirm('¿Quitar esta pregunta del borrador?')) updateSection(si, { items: section.items.filter((_, i) => i !== qi) }); }}>Quitar pregunta {qi + 1}</button></div>
          </fieldset>)}
          <button type="button" className="button" disabled={total >= 200} onClick={() => updateSection(si, { items: [...section.items, emptyQuestion()] })}>Añadir pregunta</button>
        </section>)}
        <div className="checklist-toolbar"><button type="button" className="button" disabled={sections.length >= 30 || total >= 200} onClick={() => change([...sections, { key: crypto.randomUUID(), title: '', items: [emptyQuestion()] }])}>Añadir sección</button><button className="button primary">{pending ? 'Procesando…' : 'Guardar borrador'}</button></div>
      </fieldset>
    </form>
    <p role="status">{message}</p>
    <details className="panel detail-panel"><summary>Vista previa del checklist</summary><ChecklistPreview sections={sections} /></details>
    <section className="panel detail-panel management-form"><h2>Publicar versión</h2><p>La publicación es definitiva. Las inspecciones ya iniciadas conservarán su versión anterior. Guarda los cambios y revisa la vista previa.</p><label className="user-checkbox"><input type="checkbox" checked={confirmed} disabled={dirty || pending} onChange={(e) => setConfirmed(e.target.checked)} />He revisado el checklist y confirmo su publicación.</label><button type="button" className="button primary" disabled={dirty || pending || !confirmed || total === 0} onClick={() => startTransition(async () => { try { const result = await publishVersion({ version, revision, confirm: confirmed }); setMessage(result.message); if (result.published) router.refresh(); } catch { setMessage('No se pudo confirmar la publicación. Recarga para consultar su estado antes de reintentar.'); } })}>Publicar versión</button></section>
  </div>;
}
