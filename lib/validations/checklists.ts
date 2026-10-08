import { z } from 'zod';
import { answerKinds } from '@/types/domain';
export const frequencies = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
  'CUSTOM',
] as const;
export const frequencyLabels: Record<(typeof frequencies)[number], string> = {
  DAILY: 'Diaria',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  CUSTOM: 'Cada X días',
};
export const templateInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    equipment_type_id: z.uuid(),
    frequency: z.enum(frequencies),
    custom_days: z.number().int().min(1).max(3650).nullable(),
  })
  .refine((v) => v.frequency !== 'CUSTOM' || v.custom_days !== null);
export const questionInput = z.object({
  label: z.string().trim().min(1).max(300),
  description: z.string().max(2000),
  required: z.boolean(),
  severity_when_failed: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  requires_photo_on_failure: z.boolean(),
  blocks_equipment_on_failure: z.boolean(),
  allowed_answers: z
    .array(z.enum(answerKinds))
    .min(1)
    .max(4)
    .refine((a) => new Set(a).size === a.length),
});
export const sectionsInput = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(120),
      items: z.array(questionInput).min(1).max(200),
    }),
  )
  .min(1)
  .max(30)
  .refine((sections) => sections.reduce((sum, s) => sum + s.items.length, 0) <= 200);
export type DraftSection = z.infer<typeof sectionsInput>[number];
export type DraftQuestion = z.infer<typeof questionInput>;
export const answerLabels = {
  OK: 'Correcto',
  WARNING: 'Fallo / aviso',
  CRITICAL: 'Crítico',
  NOT_APPLICABLE: 'No aplica',
} as const;
