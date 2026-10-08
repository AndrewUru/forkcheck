import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createFleetTestDatabase } from './helpers/fleet-database';
let db: PGlite;
const org = '10000000-0000-4000-8000-000000000001',
  otherOrg = crypto.randomUUID();
const admin = crypto.randomUUID(),
  worker = crypto.randomUUID(),
  outsider = crypto.randomUUID();
let type: string, branch: string, template: string, version: string;
const question = {
  label: 'Comprobar frenos',
  description: 'Con el equipo detenido.',
  required: true,
  severity_when_failed: 'HIGH',
  requires_photo_on_failure: true,
  blocks_equipment_on_failure: true,
  allowed_answers: ['OK', 'WARNING', 'CRITICAL'],
};
const sections = [{ title: 'Seguridad', items: [question] }];
const input = () => ({
  name: 'Revisión de prueba',
  equipment_type_id: type,
  frequency: 'DAILY',
  custom_days: null,
  organization_id: otherOrg,
});
async function as(id: string) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function scalar<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, args)).rows[0].value;
}
const save = (revision: number, content: unknown = sections) =>
  scalar<number>('select save_checklist_draft($1,$2,$3::jsonb) value', [
    version,
    revision,
    JSON.stringify(content),
  ]);
beforeAll(async () => {
  db = await createFleetTestDatabase();
  type = await scalar<string>('select id value from equipment_types limit 1');
  branch = await scalar<string>('select id value from branches limit 1');
  await db.query('insert into auth.users(id) values($1),($2),($3)', [admin, worker, outsider]);
  await db.query("insert into organizations(id,slug,name) values($1,'checklist-other','Other')", [
    otherOrg,
  ]);
  await db.query(
    "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$4,'template-admin','Admin','Test','CORPORATE_ADMIN'),($2,$4,'template-worker','Worker','Test','OPERARIO'),($3,$5,'template-outsider','Other','Test','CORPORATE_ADMIN')",
    [admin, worker, outsider, org, otherOrg],
  );
});
afterAll(async () => {
  await db?.close();
});
it('creates a tenant-derived draft and rejects foreign types and invalid frequencies', async () => {
  await as(admin);
  template = await scalar<string>('select create_checklist_template($1::jsonb) value', [
    JSON.stringify(input()),
  ]);
  expect(
    await scalar<string>('select organization_id value from checklist_templates where id=$1', [
      template,
    ]),
  ).toBe(org);
  version = await scalar<string>('select id value from checklist_versions where template_id=$1', [
    template,
  ]);
  expect(await scalar<string>('select create_checklist_draft($1) value', [template])).toBe(version);
  await expect(
    db.query('select create_checklist_template($1::jsonb)', [
      JSON.stringify({ ...input(), equipment_type_id: crypto.randomUUID() }),
    ]),
  ).rejects.toThrow('Invalid equipment type');
  await expect(
    db.query('select create_checklist_template($1::jsonb)', [
      JSON.stringify({ ...input(), frequency: 'CUSTOM' }),
    ]),
  ).rejects.toThrow('Invalid frequency');
  expect(
    (await db.query('select * from available_checklist_templates where id=$1', [template])).rows,
  ).toHaveLength(0);
});
it('denies all management RPCs to operators, anonymous and foreign administrators', async () => {
  const operations: [string, unknown[]][] = [
    ['select create_checklist_draft($1)', [template]],
    ['select save_checklist_draft($1,0,$2::jsonb)', [version, JSON.stringify(sections)]],
    ['select publish_checklist_version($1,0)', [version]],
    ['select retire_checklist_template($1)', [template]],
  ];
  await as(worker);
  for (const [sql, args] of operations)
    await expect(db.query(sql, args)).rejects.toThrow('Not authorized');
  await expect(
    db.query('select create_checklist_template($1::jsonb)', [JSON.stringify(input())]),
  ).rejects.toThrow('Not authorized');
  await expect(db.query('select private.copy_checklist($1,$1)', [version])).rejects.toThrow(
    'permission denied',
  );
  await as(outsider);
  for (const [sql, args] of operations)
    await expect(db.query(sql, args)).rejects.toThrow('Template unavailable');
  expect(
    (await db.query('select * from checklist_versions where id=$1', [version])).rows,
  ).toHaveLength(0);
  expect((await db.query('select * from available_checklist_templates')).rows).toHaveLength(0);
  await db.exec('reset role;set role anon');
  for (const [sql, args] of operations)
    await expect(db.query(sql, args)).rejects.toThrow('permission denied');
});
it('validates aggregate content atomically and prevents stale editors from overwriting drafts', async () => {
  await as(admin);
  await expect(db.query('select publish_checklist_version($1,0)', [version])).rejects.toThrow(
    'Complete the draft',
  );
  expect(await save(0)).toBe(1);
  await expect(save(0)).rejects.toThrow('Draft changed');
  await expect(
    save(1, [{ title: 'Bad', items: [{ ...question, allowed_answers: [] }] }]),
  ).rejects.toThrow('Invalid answers');
  await expect(
    save(1, [{ title: 'Bad', items: [{ ...question, required: 'true' }] }]),
  ).rejects.toThrow('Invalid question');
  await expect(
    save(1, [{ title: 'Too many', items: Array.from({ length: 201 }, () => question) }]),
  ).rejects.toThrow('Invalid questions');
  await expect(
    save(1, [{ title: 'Bad', items: [{ ...question, allowed_answers: ['OK', 'OK'] }] }]),
  ).rejects.toThrow('Invalid answers');
  expect(
    await scalar<string>('select label value from checklist_items where version_id=$1', [version]),
  ).toBe(question.label);
  expect(
    await scalar<number>('select edit_revision value from checklist_versions where id=$1', [
      version,
    ]),
  ).toBe(1);
  await expect(
    db.query("update checklist_items set label='bypass' where version_id=$1", [version]),
  ).rejects.toThrow('permission denied');
});
it('publishes idempotently and preserves immutable questions and rules', async () => {
  await expect(db.query('select publish_checklist_version($1,0)', [version])).rejects.toThrow(
    'Draft changed',
  );
  for (let retry = 0; retry < 2; retry++)
    expect(await scalar<string>('select publish_checklist_version($1,1) value', [version])).toBe(
      version,
    );
  await expect(save(1)).rejects.toThrow('Published versions are immutable');
  expect(
    (await db.query('select * from available_checklist_templates where id=$1', [template])).rows,
  ).toHaveLength(1);
  await db.exec('reset role');
  await expect(
    db.query("update checklist_items set label='rewrite history' where version_id=$1", [version]),
  ).rejects.toThrow('Published checklist is immutable');
  await expect(
    db.query('delete from checklist_sections where version_id=$1', [version]),
  ).rejects.toThrow('Published checklist is immutable');
  await as(admin);
  const draft = await scalar<string>('select create_checklist_draft($1) value', [template]);
  expect(draft).not.toBe(version);
  expect(await scalar<string>('select create_checklist_draft($1) value', [template])).toBe(draft);
  const copied = (
    await db.query<{
      id: string;
      requires_photo_on_failure: boolean;
      blocks_equipment_on_failure: boolean;
    }>('select * from checklist_items where version_id=$1', [draft])
  ).rows[0];
  expect(copied).toMatchObject({
    requires_photo_on_failure: true,
    blocks_equipment_on_failure: true,
  });
  expect(copied.id).not.toBe(
    await scalar<string>('select id value from checklist_items where version_id=$1', [version]),
  );
});
it('duplicates a scoped version into an independent template with editable creation attributes', async () => {
  const duplicate = await scalar<string>('select create_checklist_template($1::jsonb,$2) value', [
    JSON.stringify({ ...input(), name: 'Copia semanal', frequency: 'WEEKLY' }),
    version,
  ]);
  const copyVersion = await scalar<string>(
    'select id value from checklist_versions where template_id=$1',
    [duplicate],
  );
  expect(
    await scalar<string>('select frequency value from checklist_templates where id=$1', [
      duplicate,
    ]),
  ).toBe('WEEKLY');
  expect(
    await scalar<string>('select label value from checklist_items where version_id=$1', [
      copyVersion,
    ]),
  ).toBe(question.label);
  await as(outsider);
  const otherType = crypto.randomUUID();
  await db.exec('reset role');
  await db.query("insert into equipment_types(id,organization_id,name) values($1,$2,'Other')", [
    otherType,
    otherOrg,
  ]);
  await as(outsider);
  await expect(
    db.query('select create_checklist_template($1::jsonb,$2)', [
      JSON.stringify({ ...input(), equipment_type_id: otherType }),
      version,
    ]),
  ).rejects.toThrow('Version unavailable');
});
it('pins open inspections to their original version while new inspections adopt publication', async () => {
  await as(admin);
  const plans = (
    await db.query<{ id: string; template_id: string }>(
      'select id,template_id from equipment_schedules where template_id=(select template_id from equipment_schedules limit 1) order by id limit 2',
    )
  ).rows;
  const first = await scalar<string>('select start_inspection($1) value', [plans[0].id]);
  const oldVersion = await scalar<string>(
    'select checklist_version_id value from inspections where id=$1',
    [first],
  );
  const draft = await scalar<string>('select create_checklist_draft($1) value', [
    plans[0].template_id,
  ]);
  await db.query('select save_checklist_draft($1,0,$2::jsonb)', [draft, JSON.stringify(sections)]);
  await db.query('select publish_checklist_version($1,1)', [draft]);
  expect(await scalar<string>('select start_inspection($1) value', [plans[0].id])).toBe(first);
  expect(
    await scalar<string>('select checklist_version_id value from inspections where id=$1', [first]),
  ).toBe(oldVersion);
  await db.query('select retire_checklist_template($1)', [plans[0].template_id]);
  const second = await scalar<string>('select start_inspection($1) value', [plans[1].id]);
  expect(
    await scalar<string>('select checklist_version_id value from inspections where id=$1', [
      second,
    ]),
  ).toBe(draft);
  expect(
    (await db.query('select * from checklist_items where version_id=$1', [oldVersion])).rows.length,
  ).toBeGreaterThan(0);
});
it('retires idempotently, removes availability, blocks new assignments and retains audit/history', async () => {
  await db.query('select retire_checklist_template($1)', [template]);
  const archivedAt = await scalar<string>(
    'select archived_at::text value from checklist_templates where id=$1',
    [template],
  );
  await db.query('select retire_checklist_template($1)', [template]);
  expect(
    await scalar<string>('select archived_at::text value from checklist_templates where id=$1', [
      template,
    ]),
  ).toBe(archivedAt);
  expect(
    (await db.query('select * from available_checklist_templates where id=$1', [template])).rows,
  ).toHaveLength(0);
  await expect(db.query('select create_checklist_draft($1)', [template])).rejects.toThrow(
    'Template unavailable',
  );
  await expect(
    db.query('select create_equipment($1::jsonb)', [
      JSON.stringify({
        equipment_type_id: type,
        branch_id: branch,
        template_id: template,
        internal_code: 'RETIRED-TEMPLATE',
        brand: 'Test',
        model: 'Test',
      }),
    ]),
  ).rejects.toThrow('Template unavailable');
  expect(
    (await db.query('select * from checklist_versions where template_id=$1', [template])).rows,
  ).toHaveLength(2);
  expect(
    (await db.query('select * from audit_logs where entity_id=$1', [template])).rows.length,
  ).toBeGreaterThan(0);
});
it('revokes management immediately for inactive or password-pending administrators', async () => {
  await db.exec('reset role');
  await db.query('update profiles set must_change_password=true where id=$1', [admin]);
  await as(admin);
  await expect(
    db.query('select create_checklist_template($1::jsonb)', [JSON.stringify(input())]),
  ).rejects.toThrow('Not authorized');
  await db.exec('reset role');
  await db.query('update profiles set must_change_password=false,active=false where id=$1', [
    admin,
  ]);
  await as(admin);
  await expect(db.query('select retire_checklist_template($1)', [template])).rejects.toThrow(
    'Not authorized',
  );
});
