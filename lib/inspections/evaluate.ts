import type { Answer } from '@/lib/validations/inspection';
import type { AnswerKind, ChecklistItem, Severity } from '@/types/domain';
export function evaluateInspection(items: ChecklistItem[], answers: Answer[]) {
  const answerMap = new Map(answers.map((answer) => [answer.item_id, answer]));
  if (answerMap.size !== answers.length) throw new Error('Respuestas duplicadas');
  if (answers.some((a) => !items.some((i) => i.id === a.item_id)))
    throw new Error('Pregunta ajena a esta versión');
  let status: AnswerKind = 'OK';
  let blocked = false;
  const incidents: { itemId: string; severity: Severity }[] = [];
  for (const item of items) {
    const answer = answerMap.get(item.id);
    if (!answer) {
      if (item.required) throw new Error(`Falta responder: ${item.label}`);
      continue;
    }
    if (!item.allowed_answers.includes(answer.answer)) throw new Error('Respuesta no permitida');
    if (answer.answer === 'WARNING' || answer.answer === 'CRITICAL') {
      if (!answer.notes.trim()) throw new Error(`Describe la incidencia: ${item.label}`);
      if (item.requires_photo_on_failure && !answer.photos.length)
        throw new Error(`Falta fotografía: ${item.label}`);
      const severity =
        item.blocks_equipment_on_failure || answer.answer === 'CRITICAL'
          ? 'CRITICAL'
          : item.severity_when_failed;
      blocked ||= severity === 'CRITICAL';
      if (severity === 'CRITICAL') status = 'CRITICAL';
      else if (status !== 'CRITICAL') status = 'WARNING';
      incidents.push({ itemId: item.id, severity });
    }
  }
  return { status, blocked, incidents };
}
