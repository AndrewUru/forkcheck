import { z } from 'zod';

export const passwordChange = z.object({
  current_password: z.string().min(1).max(128),
  password: z.string().min(12).max(128),
  confirmation: z.string().min(12).max(128),
}).refine((value) => value.password === value.confirmation && value.password !== value.current_password);

export const passwordReset = z.object({
  user_id: z.uuid(),
  confirm: z.literal('yes'),
});
