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
    profile: { role: 'JEFE_ALMACEN' },
    db: { functions: { invoke: mocks.invoke } },
  });
  mocks.invoke.mockResolvedValue({ error: null });
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
      'solo puede crear operarios',
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
