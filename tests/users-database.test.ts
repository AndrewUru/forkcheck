import { beforeAll, afterAll, it, expect } from 'vitest';
import { createFleetTestDatabase } from './helpers/fleet-database';
import type { PGlite } from '@electric-sql/pglite';
let db: PGlite;
const admin = crypto.randomUUID(),
  worker = crypto.randomUUID(),
  outsider = crypto.randomUUID(),
  newUser = crypto.randomUUID();
const org = '10000000-0000-4000-8000-000000000001',
  otherOrg = crypto.randomUUID();
let branch: string;
async function as(id: string) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
const input = (branches: string[] = [branch]) => ({
  employee_id: 'new-worker',
  first_name: 'New',
  last_name: 'Worker',
  role: 'OPERARIO',
  branches,
});
beforeAll(async () => {
  db = await createFleetTestDatabase();
  branch = (await db.query<{ id: string }>('select id from branches limit 1')).rows[0].id;
  await db.query('insert into auth.users(id) values($1),($2),($3)', [admin, worker, outsider]);
  await db.query(
    "insert into auth.users(id,email) values($1,'new-worker@demo-logistics.employees.forkcheck.invalid')",
    [newUser],
  );
  await db.query("insert into organizations(id,slug,name) values($1,'other-org','Other')", [
    otherOrg,
  ]);
  await db.query(
    "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$4,'users-admin','Admin','Test','CORPORATE_ADMIN'),($2,$4,'users-worker','Worker','Test','OPERARIO'),($3,$5,'outsider','Other','Test','CORPORATE_ADMIN')",
    [admin, worker, outsider, org, otherOrg],
  );
});
afterAll(async () => {
  await db?.close();
});
it('denies ordinary users, anonymous callers, tenant spoofing and invalid branch scope', async () => {
  await as(worker);
  await expect(
    db.query('select register_employee($1,$2::jsonb)', [newUser, JSON.stringify(input())]),
  ).rejects.toThrow('Not authorized');
  await expect(db.query('select deactivate_employee($1)', [admin])).rejects.toThrow(
    'Not authorized',
  );
  await as(outsider);
  await expect(db.query('select deactivate_employee($1)', [worker])).rejects.toThrow(
    'User unavailable',
  );
  await as(admin);
  await expect(
    db.query('select register_employee($1,$2::jsonb)', [
      newUser,
      JSON.stringify(input([crypto.randomUUID()])),
    ]),
  ).rejects.toThrow('Invalid branch');
  await expect(
    db.query('select register_employee($1,$2::jsonb)', [
      newUser,
      JSON.stringify({ ...input(), role: 'SUPERADMIN' }),
    ]),
  ).rejects.toThrow('Invalid employee');
  await db.exec('reset role;set role anon');
  await expect(db.query('select deactivate_employee($1)', [worker])).rejects.toThrow(
    'permission denied',
  );
});
it('creates tenant-derived profiles and branch scope atomically; rejects duplicate and mismatched identities', async () => {
  await as(admin);
  await expect(
    db.query('select register_employee($1,$2::jsonb)', [worker, JSON.stringify(input())]),
  ).rejects.toThrow('Invalid identity');
  await db.query('select register_employee($1,$2::jsonb)', [
    newUser,
    JSON.stringify({ ...input(), organization_id: otherOrg }),
  ]);
  const profile = (
    await db.query<{ organization_id: string }>(
      'select organization_id from profiles where id=$1',
      [newUser],
    )
  ).rows[0];
  expect(profile.organization_id).toBe(org);
  expect(
    (await db.query('select * from user_branches where user_id=$1', [newUser])).rows,
  ).toHaveLength(1);
  await expect(
    db.query('select register_employee($1,$2::jsonb)', [newUser, JSON.stringify(input())]),
  ).rejects.toThrow();
  expect(
    (
      await db.query("select * from audit_logs where entity_id=$1 and action='CREATE_USER'", [
        newUser,
      ])
    ).rows,
  ).toHaveLength(1);
});
it('preserves history, closes assignments, retries idempotently and immediately revokes access', async () => {
  await as(admin);
  await expect(db.query('select deactivate_employee($1)', [admin])).rejects.toThrow(
    'Cannot deactivate yourself',
  );
  await db.query("select assign_equipment('new-worker','CAR-001',null)");
  await db.query('select deactivate_employee($1)', [newUser]);
  await db.query('select deactivate_employee($1)', [newUser]);
  expect(
    (await db.query<{ active: boolean }>('select active from profiles where id=$1', [newUser]))
      .rows[0].active,
  ).toBe(false);
  expect(
    (
      await db.query('select * from equipment_operators where user_id=$1 and ended_at is null', [
        newUser,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query('select * from equipment_operators where user_id=$1', [newUser])).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query("select * from audit_logs where entity_id=$1 and action='DEACTIVATE_USER'", [
        newUser,
      ])
    ).rows,
  ).toHaveLength(1);
  await as(newUser);
  expect((await db.query('select * from equipment')).rows).toHaveLength(0);
  expect((await db.query('select * from profiles')).rows).toHaveLength(0);
  await expect(db.query('update profiles set active=true where id=$1', [newUser])).rejects.toThrow(
    'permission denied',
  );
});
it('denies administrative RPCs after the administrator has been deactivated', async () => {
  await db.exec('reset role');
  await db.query('update profiles set active=false where id=$1', [admin]);
  await as(admin);
  await expect(db.query('select deactivate_employee($1)', [worker])).rejects.toThrow(
    'Not authorized',
  );
  await expect(
    db.query('select register_employee($1,$2::jsonb)', [newUser, JSON.stringify(input())]),
  ).rejects.toThrow('Not authorized');
});
