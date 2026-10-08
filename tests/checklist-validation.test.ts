import { it, expect } from 'vitest';
import { templateInput, sectionsInput } from '@/lib/validations/checklists';
const question = {
  label: 'Frenos',
  description: '',
  required: true,
  severity_when_failed: 'HIGH',
  requires_photo_on_failure: true,
  blocks_equipment_on_failure: true,
  allowed_answers: ['OK', 'WARNING'],
};
it('validates frequency and bounded content without trusting tenant input', () => {
  const input = {
    name: 'Diaria',
    equipment_type_id: crypto.randomUUID(),
    frequency: 'CUSTOM',
    custom_days: 3,
    organization_id: 'untrusted',
  };
  expect(templateInput.parse(input)).not.toHaveProperty('organization_id');
  expect(templateInput.safeParse({ ...input, custom_days: null }).success).toBe(false);
  expect(sectionsInput.safeParse([{ title: 'Seguridad', items: [question] }]).success).toBe(true);
  expect(sectionsInput.safeParse([{ title: '', items: [question] }]).success).toBe(false);
  expect(
    sectionsInput.safeParse([{ title: 'Seguridad', items: [{ ...question, allowed_answers: [] }] }])
      .success,
  ).toBe(false);
  expect(
    sectionsInput.safeParse([
      { title: 'Seguridad', items: Array.from({ length: 201 }, () => question) },
    ]).success,
  ).toBe(false);
});
