import { z } from 'zod';
export const createEquipmentSchema = z
  .object({
    equipment_type_id: z.uuid(),
    internal_code: z.string().trim().min(1).max(60),
    brand: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(80),
    serial_number: z.string().trim().max(100),
    year: z.union([z.literal(''), z.coerce.number().int().min(1900).max(2200)]),
    branch_id: z.uuid(),
    zone_id: z.union([z.literal(''), z.uuid()]),
    template_id: z.uuid(),
  })
  .strict();
export const assignmentSchema = z
  .object({
    employeeId: z.string().trim().min(1).max(40),
    equipmentCode: z.string().trim().max(60),
    expectedAssignment: z.uuid().nullable(),
  })
  .strict();
export type FleetActionResult = { success?: boolean; error?: string; publicCode?: string };
export const nicknameSchema = z
  .string()
  .trim()
  .max(40)
  .refine(
    (value) =>
      !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
    'No se permiten caracteres de control',
  );
export const retirementSchema = z
  .object({
    publicCode: z.string().min(1).max(80),
    confirmCode: z.string().trim().min(1).max(60),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
