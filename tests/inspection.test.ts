import { describe, it, expect } from 'vitest';
import { evaluateInspection } from '@/lib/inspections/evaluate';
import type { ChecklistItem } from '@/types/domain';
import type { Answer } from '@/lib/validations/inspection';
const item: ChecklistItem = {
  id: crypto.randomUUID(),
  organization_id: crypto.randomUUID(),
  version_id: crypto.randomUUID(),
  section_id: crypto.randomUUID(),
  label: 'Cinturón',
  description: 'Comprueba el cierre',
  sort_order: 1,
  required: true,
  severity_when_failed: 'MEDIUM',
  requires_photo_on_failure: false,
  blocks_equipment_on_failure: false,
  allowed_answers: ['OK', 'WARNING', 'CRITICAL', 'NOT_APPLICABLE'],
};
const answer: Answer = { item_id: item.id, answer: 'OK', notes: '', photos: [] };
describe('inspection outcome', () => {
  it('all OK completes without incidents', () =>
    expect(evaluateInspection([item], [answer])).toEqual({
      status: 'OK',
      blocked: false,
      incidents: [],
    }));
  it('requires mandatory answers', () =>
    expect(() => evaluateInspection([item], [])).toThrow('Falta responder'));
  it('blocks and emits critical incident for a blocking item even when answer is WARNING', () =>
    expect(
      evaluateInspection(
        [{ ...item, blocks_equipment_on_failure: true }],
        [{ ...answer, answer: 'WARNING', notes: 'No cierra' }],
      ),
    ).toEqual({
      status: 'CRITICAL',
      blocked: true,
      incidents: [{ itemId: item.id, severity: 'CRITICAL' }],
    }));
  it('creates nonblocking warning incident', () =>
    expect(
      evaluateInspection([item], [{ ...answer, answer: 'WARNING', notes: 'Desgaste' }]).blocked,
    ).toBe(false));
  it('requires photos according to the original item', () =>
    expect(() =>
      evaluateInspection(
        [{ ...item, requires_photo_on_failure: true }],
        [{ ...answer, answer: 'CRITICAL', notes: 'Roto' }],
      ),
    ).toThrow('fotografía'));
  it('rejects foreign-version item IDs and duplicates', () => {
    expect(() => evaluateInspection([item], [{ ...answer, item_id: crypto.randomUUID() }])).toThrow(
      'versión',
    );
    expect(() => evaluateInspection([item], [answer, answer])).toThrow('duplicadas');
  });
  it('rejects N/A if the published item disallows it', () =>
    expect(() =>
      evaluateInspection(
        [{ ...item, allowed_answers: ['OK', 'CRITICAL'] }],
        [{ ...answer, answer: 'NOT_APPLICABLE' }],
      ),
    ).toThrow('permitida'));
  it('allows optional unanswered items', () =>
    expect(evaluateInspection([{ ...item, required: false }], []).status).toBe('OK'));
});
