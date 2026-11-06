import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), invoke: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requirePermission: mocks.permission }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { createEmployee } from '@/app/user-actions';

function form(role = 'OPERARIO') {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    employee_id: 'worker01',
    first_name: 'Ana',
    last_name: 'López',
    password: 'example-password-123',
    role,
    branches: crypto.randomUUID(),
    organization_id: 'spoofed-organization',
    actor_role: 'CORPORATE_ADMIN',
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({
    profile: { role: 'JEFE_ALMACEN', active: true },
    db: { functions: { invoke: mocks.invoke } },
  });
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
});
it('reauthorizes operator creation and sends only validated employee fields', async () => {
  const data = form();
  expect((await createEmployee({ message: '' }, data)).message).toBe('Usuario creado.');
  expect(mocks.permission).toHaveBeenCalledWith('create_users');
  expect(mocks.invoke).toHaveBeenCalledWith('manage-users', {
    body: {
      employee_id: 'worker01',
      first_name: 'Ana',
      last_name: 'López',
      password: 'example-password-123',
      role: 'OPERARIO',
      branches: [data.get('branches')],
    },
  });
});
it.each(['JEFE_ALMACEN', 'DELEGADO_CENTRO', 'EHS', 'DIRECTOR_REGIONAL', 'DIRECTOR_GENERAL'])(
  'rejects a chief posting a crafted %s role before invoking Auth',
  async (role) => {
    expect((await createEmployee({ message: '' }, form(role))).message).toContain(
      'no permite crear ese tipo',
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
  },
);
it('does not call Auth when session authorization fails', async () => {
  mocks.permission.mockRejectedValue(new Error('Denied'));
  await expect(createEmployee({ message: '' }, form())).rejects.toThrow('Denied');
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('does not report success or refresh data when the backend rejects scope', async () => {
  mocks.invoke.mockResolvedValue({ error: { message: 'Invalid branch' } });
  expect((await createEmployee({ message: '' }, form())).message).toContain('No se pudo crear');
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it('does not report success for an empty or malformed backend response', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: null });
  expect((await createEmployee({ message: '' }, form())).message).toContain('No se pudo confirmar');
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('explains duplicate accounts without exposing raw backend errors', async () => {
  mocks.invoke.mockResolvedValue({
    error: {
      context: Response.json(
        { code: 'DUPLICATE_USER', error: 'sensitive backend detail' },
        { status: 409 },
      ),
    },
  });
  const result = await createEmployee({ message: '' }, form());
  expect(result.message).toContain('ya existe');
  expect(result.message).not.toContain('sensitive');
});
