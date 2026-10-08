import { z } from 'zod';
export const publicCodeSchema = z.string().regex(/^[a-zA-Z0-9-]{4,80}$/);
export function equipmentCodeFromQr(raw: string, origin: string): string | null {
  const value = raw.trim();
  if (value.length > 2048) return null;
  if (publicCodeSchema.safeParse(value).success) return value;
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== new URL(origin).origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = /^\/equipment\/([a-zA-Z0-9-]{4,80})\/?$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
