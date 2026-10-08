import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requirePermission: mocks.permission }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { saveDraft, publishVersion, retireTemplate } from '@/app/checklist-actions';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ db: { rpc: mocks.rpc } });
});
it('authorizes each save and rejects invalid aggregate input before invoking SQL', async () => {
  const result = await saveDraft({ version: crypto.randomUUID(), revision: 0, sections: [] });
  expect(mocks.permission).toHaveBeenCalledWith('configure');
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(result.revision).toBeUndefined();
});
it('preserves the local revision on conflict and strips tenant fields from valid saves', async () => {
  const version = crypto.randomUUID();
  const section = {
    title: 'Safety',
    items: [
      {
        label: 'Brakes',
        description: '',
        required: true,
        severity_when_failed: 'HIGH',
        requires_photo_on_failure: true,
        blocks_equipment_on_failure: true,
        allowed_answers: ['OK', 'WARNING'],
      },
    ],
  };
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Draft changed' } });
  expect(
    (await saveDraft({ version, revision: 2, sections: [section], organization_id: 'spoofed' }))
      .revision,
  ).toBeUndefined();
  expect(mocks.rpc).toHaveBeenCalledWith('save_checklist_draft', {
    p_version: version,
    p_revision: 2,
    p_sections: [section],
  });
  mocks.rpc.mockResolvedValue({ data: 3, error: null });
  expect((await saveDraft({ version, revision: 2, sections: [section] })).revision).toBe(3);
});
it('requires publication and retirement confirmation and never reports failed publication as success', async () => {
  const version = crypto.randomUUID();
  await publishVersion({ version, revision: 0, confirm: false });
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ error: { message: 'incomplete draft' } });
  expect((await publishVersion({ version, revision: 0, confirm: true })).published).toBeUndefined();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  mocks.rpc.mockClear();
  const form = new FormData();
  form.set('template', version);
  await retireTemplate({ message: '' }, form);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
