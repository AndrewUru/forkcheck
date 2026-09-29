import { z } from 'zod';
import { answerKinds } from '@/types/domain';
export const answerSchema = z.object({
  item_id: z.uuid(),
  answer: z.enum(answerKinds),
  notes: z.string().trim().max(4000).default(''),
  photos: z.array(z.string().max(500)).max(5).default([]),
});
export const completionSchema = z.object({
  inspectionId: z.uuid(),
  answers: z.array(answerSchema).max(500),
});
export type Answer = z.infer<typeof answerSchema>;
export const loginSchema = z.object({
  organization: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/),
  employee: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,40}$/),
  password: z.string().min(1).max(128),
});
export function employeeEmail(organization: string, employee: string) {
  return `${employee.toLowerCase()}@${organization.toLowerCase()}.employees.forkcheck.invalid`;
}
