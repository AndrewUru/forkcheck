import { answerLabels, type DraftSection } from '@/lib/validations/checklists';
const severityLabels = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' };
export function ChecklistPreview({ sections }: { sections: DraftSection[] }) {
  if (!sections.length) return <p>Este borrador todavía no tiene secciones ni preguntas.</p>;
  return (
    <div className="checklist-preview">
      {sections.map((s, index) => (
        <section key={index}>
          <h3>
            {index + 1}. {s.title || 'Sección sin título'}
          </h3>
          <ol>
            {s.items.map((q, i) => (
              <li key={i}>
                <strong>{q.label || 'Pregunta sin título'}</strong>
                <p>{q.description}</p>
                <p>
                  {q.required ? 'Obligatoria' : 'Opcional'} · Respuestas:{' '}
                  {q.allowed_answers.map((a) => answerLabels[a]).join(', ')}
                </p>
                <p>
                  Ante un fallo: gravedad {severityLabels[q.severity_when_failed].toLowerCase()}
                  {q.requires_photo_on_failure ? ' · foto obligatoria' : ''}
                  {q.blocks_equipment_on_failure ? ' · bloqueo del equipo' : ''}.
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
