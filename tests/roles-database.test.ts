import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createFleetTestDatabase } from './helpers/fleet-database';

let db: PGlite;
const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = crypto.randomUUID();
const chief = crypto.randomUUID(),
  regional = crypto.randomUUID(),
  admin = crypto.randomUUID();
const worker = crypto.randomUUID(),
  shared = crypto.randomUUID(),
  outside = crypto.randomUUID();
const delegate = crypto.randomUUID(),
  ehs = crypto.randomUUID(),
  director = crypto.randomUUID();
const maintenance = crypto.randomUUID(),
  technical = crypto.randomUUID();
let branch: string, remoteBranch: string, asset: string, remoteAsset: string, remoteCode: string;
let schedule: string, inspection: string;
async function as(id: string) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function register(role = 'OPERARIO', branches: string[] = [branch]) {
  const id = crypto.randomUUID();
  const employee = `new-${id.slice(0, 8)}`;
  await db.exec('reset role');
  await db.query('insert into auth.users(id,email) values($1,$2)', [
    id,
    `${employee}@demo-logistics.employees.forkcheck.invalid`,
  ]);
  await db.exec('set role authenticated');
  await db.query('select register_employee($1,$2::jsonb)', [
    id,
    JSON.stringify({
      employee_id: employee,
      first_name: 'New',
      last_name: 'Operator',
      role,
      branches,
      organization_id: otherOrg,
    }),
  ]);
  return id;
}
beforeAll(async () => {
  db = await createFleetTestDatabase('202610080001_checklist_management.sql');
  const own = (
    await db.query<{ id: string; branch_id: string }>(
      "select id,branch_id from equipment_overview where internal_code='CAR-001'",
    )
  ).rows[0];
  asset = own.id;
  branch = own.branch_id;
  const remote = (
    await db.query<{ id: string; branch_id: string; internal_code: string }>(
      'select id,branch_id,internal_code from equipment_overview where branch_id<>$1 limit 1',
      [branch],
    )
  ).rows[0];
  remoteAsset = remote.id;
  remoteBranch = remote.branch_id;
  remoteCode = remote.internal_code;
  const fixtures = [
    [chief, 'chief', 'SUPERVISOR'],
    [regional, 'regional', 'REGIONAL_MANAGER'],
    [admin, 'admin', 'CORPORATE_ADMIN'],
    [worker, 'worker', 'OPERARIO'],
    [shared, 'shared', 'OPERARIO'],
    [outside, 'outside', 'OPERARIO'],
    [maintenance, 'maintenance', 'MANTENIMIENTO'],
    [technical, 'technical', 'SUPERADMIN'],
  ];
  for (const [id, employee, role] of fixtures) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query(
      "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$2,$3,'Role','Test',$4)",
      [id, org, employee, role],
    );
  }
  for (const id of [chief, regional, worker, shared, maintenance])
    await db.query(
      'insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)',
      [org, id, branch],
    );
  for (const id of [shared, outside])
    await db.query(
      'insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)',
      [org, id, remoteBranch],
    );
  schedule = (
    await db.query<{ id: string }>('select id from equipment_schedules where equipment_id=$1', [
      asset,
    ])
  ).rows[0].id;
  await as(chief);
  inspection = (await db.query<{ id: string }>('select start_inspection($1) id', [schedule]))
    .rows[0].id;
  await db.exec('reset role');
  await db.exec(await readFile('supabase/migrations/202610110001_business_roles.sql', 'utf8'));
  for (const [id, role] of [
    [delegate, 'DELEGADO_CENTRO'],
    [ehs, 'EHS'],
    [director, 'DIRECTOR_GENERAL'],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query(
      "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$2,$3,'Reader','Test',$3::text::public.app_role)",
      [id, org, role],
    );
    if (id !== director)
      await db.query(
        'insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)',
        [org, id, branch],
      );
  }
  await db.query(
    "insert into organizations(id,slug,name) values($1,'roles-other','Other tenant')",
    [otherOrg],
  );
  const type = crypto.randomUUID();
  await db.query(
    "insert into equipment_types(id,organization_id,name) values($1,$2,'Other type')",
    [type, otherOrg],
  );
  await db.query(
    "insert into equipment(organization_id,equipment_type_id,internal_code,brand,model) values($1,$2,'FOREIGN','Other','Other')",
    [otherOrg, type],
  );
}, 60000);
beforeEach(async () => {
  await db.exec('reset role; begin');
});
afterEach(async () => {
  await db.exec('rollback; reset role');
});
afterAll(async () => {
  await db?.close();
});

it('renames existing accounts in place and preserves legacy responsibilities and historical ownership', async () => {
  const values = (await db.query<{ id: string; role: string }>('select id,role from profiles'))
    .rows;
  expect(values.find((p) => p.id === chief)?.role).toBe('JEFE_ALMACEN');
  expect(values.find((p) => p.id === regional)?.role).toBe('DIRECTOR_REGIONAL');
  expect(values.find((p) => p.id === admin)?.role).toBe('CORPORATE_ADMIN');
  expect(values.find((p) => p.id === maintenance)?.role).toBe('MANTENIMIENTO');
  expect(
    (
      await db.query('select * from user_branches where user_id=$1 and branch_id=$2', [
        regional,
        branch,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query<{ user_id: string }>('select user_id from inspections where id=$1', [
        inspection,
      ])
    ).rows[0].user_id,
  ).toBe(chief);
  await as(chief);
  expect(
    (await db.query<{ id: string }>('select start_inspection($1) id', [schedule])).rows[0].id,
  ).toBe(inspection);
  const path = `${org}/${inspection}/signature.png`;
  await db.query(
    'insert into storage.objects(bucket_id,name,metadata) values(\'inspection-evidence\',$1,\'{"mimetype":"image/png","size":128}\')',
    [path],
  );
  const answers = (
    await db.query<{ id: string }>(
      'select id from checklist_items where version_id=(select checklist_version_id from inspections where id=$1)',
      [inspection],
    )
  ).rows.map((item) => ({ item_id: item.id, answer: 'OK' }));
  await db.query('select finish_inspection($1,$2::jsonb)', [inspection, JSON.stringify(answers)]);
  expect(
    (
      await db.query<{ completed_at: string }>('select completed_at from inspections where id=$1', [
        inspection,
      ])
    ).rows[0].completed_at,
  ).toBeTruthy();
});

it('lets chiefs create only scoped operators and derives the organization from the session', async () => {
  await as(chief);
  const id = await register();
  const row = (
    await db.query<{ organization_id: string; role: string }>(
      'select organization_id,role from profiles where id=$1',
      [id],
    )
  ).rows[0];
  expect(row).toEqual({ organization_id: org, role: 'OPERARIO' });
  expect((await db.query('select * from user_branches where user_id=$1', [id])).rows).toHaveLength(
    1,
  );
  await db.exec('reset role');
  expect(
    (await db.query("select * from audit_logs where entity_id=$1 and action='CREATE_USER'", [id]))
      .rows,
  ).toHaveLength(1);
});

it.each([
  'JEFE_ALMACEN',
  'DELEGADO_CENTRO',
  'EHS',
  'DIRECTOR_REGIONAL',
  'DIRECTOR_GENERAL',
  'CORPORATE_ADMIN',
  'SUPERADMIN',
])('denies chief escalation to %s without creating a profile', async (role) => {
  await as(chief);
  await expect(register(role)).rejects.toThrow();
});
it.each(['remote', 'mixed', 'empty', 'foreign'])(
  'rejects %s branch grants by a chief',
  async (scope) => {
    await as(chief);
    const branches =
      scope === 'remote'
        ? [remoteBranch]
        : scope === 'mixed'
          ? [branch, remoteBranch]
          : scope === 'empty'
            ? []
            : [crypto.randomUUID()];
    await expect(register('OPERARIO', branches)).rejects.toThrow();
  },
);

it('shows chiefs only operators sharing an authorized branch and only their in-scope grants', async () => {
  await as(chief);
  const visible = (await db.query<{ id: string }>('select id from profiles')).rows.map((p) => p.id);
  expect(visible.sort()).toEqual([chief, worker, shared].sort());
  const grants = (
    await db.query<{ branch_id: string }>('select branch_id from user_branches where user_id=$1', [
      shared,
    ])
  ).rows;
  expect(grants).toEqual([{ branch_id: branch }]);
});

it('assigns and unassigns local operators with optimistic concurrency and preserved history', async () => {
  await as(chief);
  const id = (await db.query<{ id: string }>("select assign_equipment('worker','CAR-001',null) id"))
    .rows[0].id;
  expect((await db.query('select * from equipment_operators where id=$1', [id])).rows).toHaveLength(
    1,
  );
  expect(
    (await db.query<{ id: string }>("select assign_equipment('worker','CAR-001',$1) id", [id]))
      .rows[0].id,
  ).toBe(id);
  await db.query("select assign_equipment('worker','',$1)", [id]);
  expect(
    (await db.query('select * from equipment_operators where id=$1 and ended_at is not null', [id]))
      .rows,
  ).toHaveLength(1);
});
it('rejects stale assignment edits', async () => {
  await as(chief);
  await db.query("select assign_equipment('worker','CAR-001',null)");
  await expect(db.query("select assign_equipment('worker','',null)")).rejects.toThrow(
    'Assignment changed',
  );
});
it.each(['outside', 'admin', 'regional'])(
  'cannot assign out-of-scope users or non-operators: %s',
  async (employee) => {
    await as(chief);
    await expect(
      db.query('select assign_equipment($1,$2,null)', [employee, 'CAR-001']),
    ).rejects.toThrow();
  },
);
it('cannot assign a shared operator to a remote machine', async () => {
  await as(chief);
  await expect(
    db.query('select assign_equipment($1,$2,null)', ['shared', remoteCode]),
  ).rejects.toThrow('Not authorized');
});
it.each(['', 'CAR-001'])('cannot end a remote assignment while selecting %s', async (code) => {
  await as(admin);
  const id = (
    await db.query<{ id: string }>('select assign_equipment($1,$2,null) id', ['shared', remoteCode])
  ).rows[0].id;
  await as(chief);
  expect(
    (await db.query('select * from equipment_operators where equipment_id=$1', [remoteAsset])).rows,
  ).toHaveLength(0);
  await expect(db.query('select assign_equipment($1,$2,$3)', ['shared', code, id])).rejects.toThrow(
    'Not authorized',
  );
});

it.each([
  ['delegate', delegate],
  ['EHS', ehs],
  ['regional', regional],
  ['general', director],
])('%s reads reports within scope and cannot inspect or administer', async (_name, id) => {
  await as(id);
  const assets = (
    await db.query<{ id: string; organization_id: string; status: string }>(
      'select id,organization_id,status from equipment',
    )
  ).rows;
  expect(assets.some((e) => e.id === asset)).toBe(true);
  expect(assets.some((e) => e.id === remoteAsset)).toBe(id === director);
  expect(assets.every((e) => e.organization_id === org)).toBe(true);
  const metrics = (
    await db.query<{ data: { equipment: number } }>('select dashboard_metrics(current_date) data')
  ).rows[0].data;
  expect(metrics.equipment).toBe(assets.filter((e) => e.status !== 'INACTIVE').length);
  // Savepoints keep exercising the same transaction after expected PostgreSQL errors.
  const forbidden = [
    ['select start_inspection($1)', [schedule]],
    ['select finish_inspection($1,$2::jsonb)', [inspection, '[]']],
    ["select assign_equipment('worker','CAR-001',null)", []],
    ['select deactivate_employee($1)', [worker]],
    ["select create_equipment('{}'::jsonb)", []],
    ["select retire_equipment('x','x','reason')", []],
    ["select save_provider('{}'::jsonb,null)", []],
    ["select create_checklist_template('{}'::jsonb,null)", []],
    ['select register_employee($1,$2::jsonb)', [worker, '{}']],
    ["update profiles set role='CORPORATE_ADMIN' where id=$1", [id]],
    ["update equipment set status='OPERATIVE' where id=$1", [asset]],
    [
      "insert into storage.objects(bucket_id,name) values('inspection-evidence',$1)",
      [`${org}/${inspection}/signature.png`],
    ],
  ] as const;
  for (const [sql, params] of forbidden) {
    await db.exec('savepoint denied');
    await expect(db.query(sql, [...params])).rejects.toThrow();
    await db.exec('rollback to savepoint denied');
  }
});

it.each(['inactive', 'password'])('revokes chief reads and writes when %s', async (state) => {
  await db.query(
    state === 'inactive'
      ? 'update profiles set active=false where id=$1'
      : 'update profiles set must_change_password=true where id=$1',
    [chief],
  );
  await as(chief);
  expect((await db.query('select * from equipment')).rows).toHaveLength(0);
  expect((await db.query('select * from profiles where id<>$1', [chief])).rows).toHaveLength(0);
  await expect(db.query("select assign_equipment('worker','CAR-001',null)")).rejects.toThrow(
    'Not authorized',
  );
});
it('keeps technical administration without implicit tenant access', async () => {
  await as(technical);
  expect((await db.query('select * from equipment')).rows).toHaveLength(0);
  await expect(db.query('select dashboard_metrics(current_date)')).rejects.toThrow(
    'Not authorized',
  );
});
it('lets the legacy administrator create the new read-only organization role', async () => {
  await as(admin);
  const id = await register('DIRECTOR_GENERAL', []);
  await as(id);
  expect((await db.query('select * from equipment')).rows).toHaveLength(40);
});
it('does not give chiefs user deactivation rights', async () => {
  await as(chief);
  await expect(db.query('select deactivate_employee($1)', [worker])).rejects.toThrow(
    'Not authorized',
  );
});
it('does not give chiefs password reset rights through the Auth trigger', async () => {
  await db.query(
    "update auth.users set encrypted_password='test-only-hash', raw_app_meta_data=$2::jsonb where id=$1",
    [
      worker,
      JSON.stringify({ forkcheck_reset_nonce: crypto.randomUUID(), forkcheck_reset_actor: chief }),
    ],
  );
  await expect(db.exec('set constraints all immediate')).rejects.toThrow('Not authorized');
});
it('denies anonymous execution of new authorization helpers', async () => {
  await db.exec('set role anon');
  await expect(db.query('select private.operator_in_scope($1)', [worker])).rejects.toThrow(
    'permission denied',
  );
});
