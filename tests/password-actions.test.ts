import { beforeEach, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permission: vi.fn(),
  signIn: vi.fn(),
  update: vi.fn(),
  invoke: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  passwordSession: mocks.session,
  requirePermission: mocks.permission,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { changePassword, resetEmployeePassword } from '@/app/password-actions';

const id = crypto.randomUUID();
const form = (values: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
};
const passwordForm = () =>
  form({
    current_password: 'old-password',
    password: 'new-personal-password',
    confirmation: 'new-personal-password',
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id, email: 'worker@tenant.employees.forkcheck.invalid' },
    profile: { must_change_password: true },
    db: { auth: { updateUser: mocks.update, signInWithPassword: mocks.signIn } },
  });
  mocks.permission.mockResolvedValue({ db: { functions: { invoke: mocks.invoke } } });
  mocks.signIn.mockResolvedValue({ data: { user: { id } }, error: null });
  mocks.update.mockResolvedValue({ error: null });
});
it('never changes a password if reauthentication fails', async () => {
  mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
  expect((await changePassword({ message: '' }, passwordForm()))?.message).toContain(
    'contraseña actual',
  );
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it('reauthenticates the same identity and redirects only on success', async () => {
  await changePassword({ message: '' }, passwordForm());
  expect(mocks.signIn).toHaveBeenCalledWith({
    email: 'worker@tenant.employees.forkcheck.invalid',
    password: 'old-password',
  });
  expect(mocks.update).toHaveBeenCalledWith({
    password: 'new-personal-password',
    current_password: 'old-password',
  });
  expect(mocks.redirect).toHaveBeenCalledWith('/profile?password=changed');
});
it('does not report success when Auth rejects the new password', async () => {
  mocks.update.mockResolvedValue({ error: { message: 'rejected' } });
  expect((await changePassword({ message: '' }, passwordForm()))?.message).toContain(
    'No se pudo cambiar',
  );
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it('authorizes reset again, requires confirmation, and ignores browser tenant/role', async () => {
  await resetEmployeePassword({ message: '' }, form({ user_id: id }));
  expect(mocks.permission).toHaveBeenCalledWith('configure');
  expect(mocks.invoke).not.toHaveBeenCalled();
  mocks.invoke.mockResolvedValue({
    data: { temporaryPassword: 'temporary-test-password' },
    error: null,
  });
  const result = await resetEmployeePassword(
    { message: '' },
    form({ user_id: id, confirm: 'yes', organization_id: 'spoofed', role: 'SUPERADMIN' }),
  );
  expect(mocks.invoke).toHaveBeenCalledWith('manage-users', {
    body: { action: 'reset_password', user_id: id },
  });
  expect(result.temporaryPassword).toBe('temporary-test-password');
});
it('never echoes a previous temporary password on a failed retry', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { message: 'failed' } });
  const result = await resetEmployeePassword(
    { message: '', temporaryPassword: 'previous-secret' },
    form({ user_id: id, confirm: 'yes' }),
  );
  expect(result.temporaryPassword).toBeUndefined();
});
