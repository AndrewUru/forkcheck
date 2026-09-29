'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertTriangle, Ban, Minus, CheckCheck, Camera } from 'lucide-react';
import { completeInspection, uploadEvidence } from '@/app/actions';
import { Signature } from './signature';
import type { Answer } from '@/lib/validations/inspection';
import type { AnswerKind, ChecklistItem } from '@/types/domain';
const labels = {
  OK: 'Correcto',
  WARNING: 'Incidencia',
  CRITICAL: 'Crítico',
  NOT_APPLICABLE: 'No aplica',
};
const icons = { OK: Check, WARNING: AlertTriangle, CRITICAL: Ban, NOT_APPLICABLE: Minus };
export function InspectionForm({
  inspectionId,
  items,
  sections,
}: {
  inspectionId: string;
  items: ChecklistItem[];
  sections: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [photos, setPhotos] = useState<Record<string, File[]>>({});
  const [signature, setSignature] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bulk, setBulk] = useState(false);
  const [signatureUploaded, setSignatureUploaded] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string[]>>({});
  const unanswered = items.filter((i) => !answers[i.id] && i.allowed_answers.includes('OK'));
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => answers[i.id]).length;
  function answer(item: ChecklistItem, kind: AnswerKind) {
    setAnswers((previous) => ({
      ...previous,
      [item.id]: {
        item_id: item.id,
        answer: kind,
        notes: previous[item.id]?.notes ?? '',
        photos: [],
      },
    }));
  }
  async function submit() {
    setError('');
    if (done < required.length || !signature || !confirmed) {
      setError('Responde los puntos obligatorios, firma y confirma la revisión.');
      return;
    }
    for (const item of items) {
      const a = answers[item.id];
      if (a && ['WARNING', 'CRITICAL'].includes(a.answer)) {
        if (!a.notes.trim()) {
          setError(`Describe la incidencia: ${item.label}`);
          return;
        }
        if (
          item.requires_photo_on_failure &&
          !photos[item.id]?.length &&
          !uploadedPhotos[item.id]?.length
        ) {
          setError(`Añade una fotografía: ${item.label}`);
          return;
        }
      }
    }
    setBusy(true);
    try {
      const payload = Object.values(answers).map((a) => ({
        ...a,
        photos: [...(uploadedPhotos[a.item_id] ?? [])],
      }));
      for (const a of payload) {
        if (!['WARNING', 'CRITICAL'].includes(a.answer)) continue;
        const files = photos[a.item_id] ?? [];
        for (let index = a.photos.length; index < files.length; index++) {
          const data = new FormData();
          data.set('inspection', inspectionId);
          data.set('item', a.item_id);
          data.set('file', files[index]);
          const result = await uploadEvidence(data);
          if (!result.path) throw new Error(result.error);
          a.photos.push(result.path);
          setUploadedPhotos((prev) => ({ ...prev, [a.item_id]: [...a.photos] }));
        }
      }
      if (!signatureUploaded) {
        const data = new FormData();
        data.set('inspection', inspectionId);
        data.set('item', 'signature');
        data.set('file', signature);
        const result = await uploadEvidence(data);
        if (!result.path) throw new Error(result.error);
        setSignatureUploaded(true);
      }
      const result = await completeInspection({ inspectionId, answers: payload });
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar. Conservamos las respuestas mientras esta página esté abierta.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inspection-form">
      <div className="inspection-progress">
        <span>
          <strong>{done}</strong> / {required.length} puntos obligatorios
        </span>
        <div className="progress-track">
          <div style={{ width: `${required.length ? (done / required.length) * 100 : 100}%` }} />
        </div>
      </div>
      <p className="info-note">
        Comprueba físicamente cada punto. Las respuestas se envían juntas al finalizar; no cierres
        esta página antes de guardar.
      </p>
      <button
        type="button"
        className="button bulk-button"
        onClick={() => setBulk(!bulk)}
        disabled={busy || !unanswered.length}
      >
        <CheckCheck size={19} /> Marcar resto como correcto ({unanswered.length})
      </button>
      {bulk && (
        <div className="bulk-confirm">
          <h2>Confirma los puntos que has revisado</h2>
          <ul>
            {unanswered.map((i) => (
              <li key={i.id}>{i.label}</li>
            ))}
          </ul>
          <button
            type="button"
            className="button dark"
            onClick={() => {
              const next = { ...answers };
              for (const i of unanswered)
                next[i.id] = { item_id: i.id, answer: 'OK', notes: '', photos: [] };
              setAnswers(next);
              setBulk(false);
            }}
          >
            He comprobado estos {unanswered.length} puntos
          </button>
        </div>
      )}
      <fieldset disabled={busy} className="inspection-fieldset">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="checklist-section">{section.title}</h2>
            {items
              .filter((i) => i.section_id === section.id)
              .map((item, index) => {
                const a = answers[item.id];
                const failed = a && ['WARNING', 'CRITICAL'].includes(a.answer);
                return (
                  <article className={`checklist-card ${a ? 'answered' : ''}`} key={item.id}>
                    <div className="checklist-card-heading">
                      <span className="item-number">{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <h3>
                          {item.label}{' '}
                          {item.required && (
                            <span className="required-mark" aria-label="obligatorio">
                              *
                            </span>
                          )}
                        </h3>
                        {item.description && <p>{item.description}</p>}
                      </div>
                    </div>
                    <div className="answer-options" role="group" aria-label={item.label}>
                      {item.allowed_answers.map((kind) => {
                        const Icon = icons[kind];
                        return (
                          <button
                            type="button"
                            aria-pressed={a?.answer === kind}
                            className={`answer-button answer-${kind.toLowerCase()} ${a?.answer === kind ? 'selected' : ''}`}
                            key={kind}
                            onClick={() => answer(item, kind)}
                          >
                            <Icon size={21} />
                            {labels[kind]}
                          </button>
                        );
                      })}
                    </div>
                    {failed && (
                      <div className="failure-fields">
                        {item.blocks_equipment_on_failure && (
                          <p className="text-red">
                            Este fallo bloqueará el equipo y generará una incidencia crítica.
                          </p>
                        )}
                        <label>
                          Descripción de la incidencia y notas
                          <textarea
                            rows={3}
                            maxLength={4000}
                            value={a.notes}
                            onChange={(event) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [item.id]: { ...a, notes: event.target.value },
                              }))
                            }
                            placeholder="Describe qué has observado y dónde…"
                            required
                          />
                        </label>
                        <label className="photo-label">
                          <Camera size={18} /> Fotografía{' '}
                          {item.requires_photo_on_failure ? 'obligatoria' : 'opcional'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            capture="environment"
                            multiple
                            disabled={Boolean(uploadedPhotos[item.id]?.length)}
                            onChange={(event) => {
                              const files = Array.from(event.target.files ?? []);
                              if (files.length > 5 || files.some((f) => f.size > 5 * 1024 * 1024)) {
                                setError('Máximo 5 fotos de hasta 5 MB por punto.');
                                event.target.value = '';
                                return;
                              }
                              setPhotos((prev) => ({ ...prev, [item.id]: files }));
                            }}
                          />
                        </label>
                        <small>
                          {photos[item.id]?.map((f) => f.name).join(', ')} · PNG, JPEG o WebP, hasta
                          5 MB por foto.
                        </small>
                      </div>
                    )}
                  </article>
                );
              })}
          </section>
        ))}
        <section className="panel signature-panel">
          <Signature disabled={busy || signatureUploaded} onChange={setSignature} />
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Confirmo que he comprobado los puntos indicados y que la información registrada es
            correcta.
          </label>
        </section>
      </fieldset>
      <div className="inspection-submit">
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <button type="button" className="button primary full" disabled={busy} onClick={submit}>
          {busy ? 'Guardando evidencias e inspección…' : 'Firmar y finalizar inspección'}
        </button>
        <small>El bloqueo y las incidencias se procesan al confirmar el guardado.</small>
      </div>
    </div>
  );
}
