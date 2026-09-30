'use client';
import { useState, type FormEvent } from 'react';

type Entry = { question: string; answer: string };
export function AssistantForm({
  publicCode,
  canSeeMetrics,
}: {
  publicCode?: string;
  canSeeMetrics: boolean;
}) {
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3 || pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, ...(publicCode ? { publicCode } : {}) }),
      });
      const result: { answer?: string; error?: string } = await response.json();
      if (!response.ok || !result.answer) throw new Error(result.error || 'No se pudo responder.');
      setEntries((current) => [...current, { question: text, answer: result.answer! }]);
      setQuestion('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo responder.');
    } finally {
      setPending(false);
    }
  }
  const suggestions = publicCode
    ? [
        'Resume las incidencias de este equipo',
        '¿Qué revisiones recientes tiene este equipo?',
        'Ayúdame a redactar una incidencia',
      ]
    : [
        'Resume las últimas incidencias visibles',
        ...(canSeeMetrics ? ['¿Cuál es el estado de la flota hoy?'] : []),
        'Ayúdame a describir una incidencia',
      ];
  return (
    <div className="assistant-layout">
      <div className="assistant-suggestions" aria-label="Preguntas sugeridas">
        {suggestions.map((suggestion) => (
          <button
            className="button"
            key={suggestion}
            type="button"
            onClick={() => setQuestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
      <div className="assistant-conversation" aria-live="polite">
        {entries.length ? (
          entries.map((entry, index) => (
            <div className="assistant-exchange" key={index}>
              <p>
                <strong>Tú:</strong> {entry.question}
              </p>
              <div className="assistant-answer">
                <strong>Asistente:</strong>
                <p>{entry.answer}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">Escribe una pregunta para consultar tus datos autorizados.</p>
        )}
      </div>
      <form className="assistant-compose" onSubmit={submit}>
        <label htmlFor="assistant-question">Tu pregunta</label>
        <textarea
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Por ejemplo: resume las incidencias recientes"
          required
          minLength={3}
          disabled={pending}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={pending || question.trim().length < 3}>
          {pending ? 'Consultando…' : 'Preguntar'}
        </button>
      </form>
    </div>
  );
}
