import { z } from 'zod';
import { businessRoles } from '@/types/domain';
export const employeeRoles = businessRoles;
export const chiefDesignation = z
  .object({
    userId: z.uuid(),
    branches: z.array(z.uuid()).min(1).max(100),
    expectedRole: z.enum(['OPERARIO', 'JEFE_ALMACEN']),
    expectedBranches: z.array(z.uuid()).max(100),
  })
  .strict();
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
  .refine((v) => v.role === 'DIRECTOR_GENERAL' || v.branches.length > 0, {
    message: 'Selecciona al menos una sucursal.',
  });
