import type { ChecklistItem } from '@/types/domain';
import type { Answer } from '@/lib/validations/inspection';
export function inspectionSteps(sections: { id: string; title: string }[], items: ChecklistItem[]) {
  return sections.flatMap((section) => {
    const questions = items.filter((item) => item.section_id === section.id);
    return Array.from({ length: Math.ceil(questions.length / 5) }, (_, index) => ({
      id: `${section.id}-${index}`,
      title: section.title,
      part: index + 1,
      parts: Math.ceil(questions.length / 5),
      items: questions.slice(index * 5, (index + 1) * 5),
    }));
  });
}
export function stepIssue(
  items: ChecklistItem[],
  answers: Record<string, Answer>,
  photoCounts: Record<string, number>,
) {
  for (const item of items) {
    const answer = answers[item.id];
    if (item.required && !answer)
      return { message: `Responde este punto: ${item.label}`, target: `item-${item.id}` };
    if (!answer || !['WARNING', 'CRITICAL'].includes(answer.answer)) continue;
    if (!answer.notes.trim())
      return { message: `Describe la incidencia: ${item.label}`, target: `notes-${item.id}` };
    if (item.requires_photo_on_failure && !photoCounts[item.id])
      return { message: `Añade una fotografía: ${item.label}`, target: `photos-${item.id}` };
  }
  return null;
}
