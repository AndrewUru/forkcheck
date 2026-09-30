import { z } from 'zod';
const optionalUuid = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.uuid().optional(),
);
const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().max(80).optional(),
);
export const filterSchema = z.object({
  date: z.iso.date().optional(),
  region: optionalUuid,
  branch: optionalUuid,
  zone: optionalUuid,
  type: optionalUuid,
  brand: optionalText,
  model: optionalText,
  q: z.string().trim().max(60).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  sort: z.enum(['name', 'region']).default('name'),
  fleet: z.enum(['active', 'inactive', 'all']).default('active'),
});
export type Filters = z.infer<typeof filterSchema>;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export function parseFilters(input: Record<string, string | string[] | undefined>): Filters {
  const result = filterSchema.safeParse(input);
  return result.success ? result.data : filterSchema.parse({});
}
export function todayIn(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
