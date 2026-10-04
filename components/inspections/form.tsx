'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
  existingSignature,
}: {
  inspectionId: string;
  items: ChecklistItem[];
  sections: { id: string; title: string }[];
  existingSignature?: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [photos, setPhotos] = useState<Record<string, File[]>>({});
  const [signature, setSignature] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorTarget, setErrorTarget] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [signatureUploaded, setSignatureUploaded] = useState(Boolean(existingSignature));
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string[]>>({});
  const unanswered = items.filter((i) => !answers[i.id] && i.allowed_answers.includes('OK'));
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => answers[i.id]).length;
  const failures = items.filter((item) =>
    ['WARNING', 'CRITICAL'].includes(answers[item.id]?.answer),
  );
  const willBlock = failures.some(
    (item) =>
      item.blocks_equipment_on_failure ||
      item.severity_when_failed === 'CRITICAL' ||
      answers[item.id]?.answer === 'CRITICAL',
  );
  function showError(message: string, target: string) {
    setError(message);
    setErrorTarget(target);
    document.getElementById(target)?.focus();
    document.getElementById(target)?.scrollIntoView({ behavior: 'auto', block: 'center' });
  }
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
    setErrorTarget(null);
    if (done < required.length || (!signature && !existingSignature) || !confirmed) {
      const missing = required.find((item) => !answers[item.id]);
      showError(
        missing
          ? `Responde este punto: ${missing.label}`
          : !signature && !existingSignature
            ? 'Añade tu firma antes de finalizar.'
            : 'Confirma que has comprobado los puntos antes de finalizar.',
        missing ? `item-${missing.id}` : 'inspection-confirmation',
      );
      return;
    }
    for (const item of items) {
      const a = answers[item.id];
      if (a && ['WARNING', 'CRITICAL'].includes(a.answer)) {
        if (!a.notes.trim()) {
          showError(`Describe la incidencia: ${item.label}`, `notes-${item.id}`);
          return;
        }
        if (
          item.requires_photo_on_failure &&
          !photos[item.id]?.length &&
          !uploadedPhotos[item.id]?.length
        ) {
          showError(`Añade una fotografía: ${item.label}`, `photos-${item.id}`);
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
      if (!signatureUploaded && signature) {
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
      <details className="inspection-shortcuts">
        <summary>Opciones de revisión</summary>
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
              disabled={busy}
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
      </details>
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
                  <article
                    id={`item-${item.id}`}
                    tabIndex={-1}
                    className={`checklist-card ${a ? 'answered' : ''}`}
                    key={item.id}
                  >
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
                    {error && errorTarget?.endsWith(item.id) && (
                      <p role="alert" className="alert field-error">
                        {error}
                      </p>
                    )}
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
                            id={`notes-${item.id}`}
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
                            id={`photos-${item.id}`}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            capture="environment"
                            multiple
                            disabled={Boolean(uploadedPhotos[item.id]?.length)}
                            onChange={(event) => {
                              const files = Array.from(event.target.files ?? []);
                              if (files.length > 5 || files.some((f) => f.size > 5 * 1024 * 1024)) {
                                showError(
                                  'Máximo 5 fotos de hasta 5 MB por punto.',
                                  `photos-${item.id}`,
                                );
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
        <section className="panel inspection-review" aria-labelledby="review-title">
          <p className="eyebrow">ANTES DE FIRMAR</p>
          <h2 id="review-title">Resumen de tu revisión</h2>
          <p>
            {done} de {required.length} puntos obligatorios respondidos · {failures.length}{' '}
            {failures.length === 1 ? 'punto con incidencia' : 'puntos con incidencia'}.
          </p>
          {done < required.length && (
            <p>Quedan {required.length - done} puntos obligatorios por revisar.</p>
          )}
          {failures.length > 0 && (
            <ul>
              {failures.map((item) => (
                <li key={item.id}>
                  <a className="text-link" href={`#item-${item.id}`}>
                    {item.label} · {labels[answers[item.id].answer]}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {willBlock ? (
            <p className="alert">
              Al finalizar, estos fallos bloquearán el equipo. No lo utilices.
            </p>
          ) : (
            <p>
              Finalizar registra la revisión y las incidencias detectadas. Un bloqueo previo se
              mantiene.
            </p>
          )}
        </section>
        <section id="inspection-confirmation" tabIndex={-1} className="panel signature-panel">
          {error && errorTarget === 'inspection-confirmation' && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {existingSignature ? (
            <div className="signature">
              <h2>Firma ya guardada</h2>
              <Image
                src={existingSignature}
                alt="Tu firma guardada para esta inspección"
                width={400}
                height={140}
                unoptimized
              />
              <p>
                La firma se conserva del envío anterior. Revisa las respuestas y confirma de nuevo
                antes de finalizar.
              </p>
            </div>
          ) : (
            <Signature disabled={busy || signatureUploaded} onChange={setSignature} />
          )}
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
        {error && !errorTarget && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <button type="button" className="button primary full" disabled={busy} onClick={submit}>
          {busy ? 'Guardando evidencias e inspección…' : 'Guardar revisión firmada'}
        </button>
        <small>El bloqueo y las incidencias se procesan al confirmar el guardado.</small>
      </div>
    </div>
  );
}
