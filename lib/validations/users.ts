import { z } from 'zod';
export const employeeRoles = [
  'OPERARIO',
  'MANTENIMIENTO',
  'SUPERVISOR',
  'REGIONAL_MANAGER',
  'CORPORATE_ADMIN',
] as const;
export const newEmployee = z
  .object({
    employee_id: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,40}$/),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(128),
    role: z.enum(employeeRoles),
    branches: z.array(z.uuid()).max(100),
  })
  .refine((v) => v.role === 'CORPORATE_ADMIN' || v.branches.length > 0, {
    message: 'Selecciona al menos una sucursal.',
  });
