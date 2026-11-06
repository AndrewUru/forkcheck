import { beforeEach, expect, it, vi } from 'vitest';
import { csv } from '@/lib/exports/csv';
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ session: mocks.session }));
import { GET } from '@/app/api/equipment/[publicCode]/history/route';

function chain(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'not', 'order', 'limit', 'gte', 'lt'])
    query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.then = vi.fn((resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve),
  );
  return query;
}
let equipment: ReturnType<typeof chain>, inspections: ReturnType<typeof chain>;
function setup(
  result: unknown = {
    data: [
      {
        id: 'inspection-1',
        completed_at: '2026-11-06T10:00:00Z',
        overall_status: 'OK',
        checklist_version_id: 'version-1',
        due_date: '2026-11-06',
      },
    ],
    count: 1,
    error: null,
  },
) {
  equipment = chain({
    data: { id: 'asset-1', internal_code: '=HYPERLINK("malicious")' },
    error: null,
  });
  inspections = chain(result);
  const organization = chain({ data: { timezone: 'Europe/Madrid' }, error: null });
  const from = vi.fn(
    (name: string) => ({ equipment, inspections, organizations: organization })[name],
  );
  mocks.session.mockResolvedValue({
    profile: { active: true, role: 'CORPORATE_ADMIN' },
    db: { from },
  });
  return from;
}
const request = (query = '') =>
  GET(new Request(`https://forkcheck.test/api/equipment/abcd/history${query}`), {
    params: Promise.resolve({ publicCode: 'abcd' }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  setup();
});
it('exports only authorized complete inspection fields with no-store and safe CSV', async () => {
  const response = await request('?from=2026-11-06&to=2026-11-06');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('content-disposition')).toContain('attachment');
  expect(equipment.eq).toHaveBeenCalledWith('public_code', 'abcd');
  expect(inspections.eq).toHaveBeenCalledWith('equipment_id', 'asset-1');
  expect(inspections.not).toHaveBeenCalledWith('completed_at', 'is', null);
  expect(inspections.gte).toHaveBeenCalledWith('completed_at', '2026-11-05T23:00:00.000Z');
  expect(inspections.lt).toHaveBeenCalledWith('completed_at', '2026-11-06T23:00:00.000Z');
  expect(await response.text()).toContain("'=HYPERLINK");
});
it('denies export to an operator before accessing tables', async () => {
  const from = setup();
  mocks.session.mockResolvedValue({ profile: { active: true, role: 'OPERARIO' }, db: { from } });
  expect((await request()).status).toBe(403);
  expect(from).not.toHaveBeenCalled();
});
it('does not export invisible equipment', async () => {
  equipment.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await request()).status).toBe(404);
  expect(inspections.select).not.toHaveBeenCalled();
});
it.each(['?from=2026-02-30', '?from=2026-11-07&to=2026-11-06'])(
  'rejects invalid dates %s',
  async (query) => {
    expect((await request(query)).status).toBe(400);
  },
);
it.each([1001, 2])('refuses oversized or truncated exports with count %s', async (count) => {
  setup({ data: [{ id: 'one-row' }], error: null, count });
  expect((await request()).status).toBe(413);
});
it('fails closed on database errors', async () => {
  setup({ data: null, error: { message: 'secret' }, count: null });
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('secret');
});
it('escapes quotes, separators, newlines and spreadsheet formulas', () => {
  const result = csv([['a;b', 'a"b', 'a\nb', '=1+1', '  +1', '@cmd', '-2', '\tfoo', null]]);
  expect(result).toBe(
    '\uFEFF"a;b";"a""b";"a\nb";"\'=1+1";"\'  +1";"\'@cmd";"\'-2";"\'\tfoo";""\r\n',
  );
});
