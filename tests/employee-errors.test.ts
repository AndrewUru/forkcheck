import { it, expect } from 'vitest';
import { employeeCreationError } from '@/lib/users/errors';
it.each([
  [401, 'sesión'],
  [403, 'permiso'],
  [404, 'actualización'],
  [429, 'disponible'],
  [503, 'disponible'],
] as const)('explains gateway status %s without exposing its body', async (status, text) => {
  expect(
    await employeeCreationError({ context: new Response('private gateway details', { status }) }),
  ).toContain(text);
});
it('uses allowlisted error codes and ignores raw error text', async () => {
  const error = {
    context: Response.json({ code: 'WEAK_PASSWORD', error: 'secret detail' }, { status: 400 }),
  };
  expect(await employeeCreationError(error)).toContain('contraseña');
  expect(await employeeCreationError(error)).not.toContain('secret');
});
