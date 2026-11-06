import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requirePermission: mocks.permission }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { resolveIncident, returnEquipmentToService } from '@/app/incident-actions';
function form(confirm = true) {
  const value = new FormData();
  for (const [key, item] of Object.entries({
    id: crypto.randomUUID(),
    expectedUpdatedAt: '2026-11-06T09:00:00.123456+00:00',
    notes: 'Reparado y verificado por el taller',
    organization_id: 'spoofed',
    actor_id: 'spoofed',
  }))
    value.set(key, item);
  if (confirm) value.set('confirm', 'yes');
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ error: null });
});
it('reauthorizes closure and sends only validated identifiers and notes', async () => {
  const data = form();
  await resolveIncident({ message: '' }, data);
  expect(mocks.permission).toHaveBeenCalledWith('maintain');
  expect(mocks.rpc).toHaveBeenCalledWith('resolve_incident', {
    p_incident: data.get('id'),
    p_expected_updated_at: data.get('expectedUpdatedAt'),
    p_notes: data.get('notes'),
  });
});
it('requires separate administrative authority and explicit confirmation for release', async () => {
  await returnEquipmentToService({ message: '' }, form(false));
  expect(mocks.permission).toHaveBeenCalledWith('configure');
  expect(mocks.rpc).not.toHaveBeenCalled();
  await returnEquipmentToService({ message: '' }, form());
  expect(mocks.rpc).toHaveBeenCalledOnce();
});
it('does not mutate when authorization fails', async () => {
  mocks.permission.mockRejectedValue(new Error('Denied'));
  await expect(resolveIncident({ message: '' }, form())).rejects.toThrow('Denied');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('explains pending incidents and does not invalidate as if successful', async () => {
  mocks.rpc.mockResolvedValue({ error: { message: 'Incidents pending' } });
  expect((await returnEquipmentToService({ message: '' }, form())).message).toContain(
    'incidencias abiertas',
  );
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
