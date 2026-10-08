import { beforeAll, afterAll, it, expect } from 'vitest';
import { createFleetTestDatabase } from './helpers/fleet-database';
import type { PGlite } from '@electric-sql/pglite';

let db: PGlite;
const admin = crypto.randomUUID(),
  worker = crypto.randomUUID(),
  outsider = crypto.randomUUID();
const org = '10000000-0000-4000-8000-000000000001',
  otherOrg = crypto.randomUUID();
async function as(id: string) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function reset(target: string, actor = admin) {
  await db.exec('reset role');
  // Match GoTrue: password first, metadata second, commit only after both succeed.
  await db.transaction(async (tx) => {
    await tx.query('update auth.users set encrypted_password=$2 where id=$1', [
      target,
      crypto.randomUUID(),
    ]);
    await tx.query('update auth.users set raw_app_meta_data=$2::jsonb where id=$1', [
      target,
      JSON.stringify({ forkcheck_reset_nonce: crypto.randomUUID(), forkcheck_reset_actor: actor }),
    ]);
  });
}
beforeAll(async () => {
  db = await createFleetTestDatabase();
  await db.query(
    "insert into auth.users(id,encrypted_password) values($1,'old'),($2,'old'),($3,'old')",
    [admin, worker, outsider],
  );
  await db.query("insert into organizations(id,slug,name) values($1,'password-other','Other')", [
    otherOrg,
  ]);
  await db.query(
    "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$4,'password-admin','Admin','Test','CORPORATE_ADMIN'),($2,$4,'password-worker','Worker','Test','OPERARIO'),($3,$5,'password-other','Other','Test','CORPORATE_ADMIN')",
    [admin, worker, outsider, org, otherOrg],
  );
});
afterAll(async () => {
  await db?.close();
});

it('rejects cross-tenant, self and non-admin resets atomically', async () => {
  await expect(reset(worker, outsider)).rejects.toThrow('User unavailable');
  await expect(reset(admin)).rejects.toThrow('User unavailable');
  await expect(reset(admin, worker)).rejects.toThrow('Not authorized');
  expect(
    (
      await db.query<{ encrypted_password: string }>(
        'select encrypted_password from auth.users where id=$1',
        [worker],
      )
    ).rows[0].encrypted_password,
  ).toBe('old');
  expect(
    (await db.query("select * from audit_logs where action='RESET_PASSWORD'")).rows,
  ).toHaveLength(0);
});

it('blocks business reads, storage and RPCs until a real password change; metadata cannot unlock', async () => {
  await reset(worker);
  await as(worker);
  expect((await db.query('select * from equipment')).rows).toHaveLength(0);
  expect((await db.query('select * from organizations')).rows).toHaveLength(0);
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  const profiles = (
    await db.query<{ id: string; must_change_password: boolean }>('select * from profiles')
  ).rows;
  expect(profiles).toHaveLength(1);
  expect(profiles[0]).toMatchObject({ id: worker, must_change_password: true });
  await expect(db.query("select update_my_nickname('bypass')")).rejects.toThrow('Not authorized');
  await expect(db.query('select start_inspection($1)', [crypto.randomUUID()])).rejects.toThrow(
    'Not authorized',
  );
  await expect(db.query('select deactivate_employee($1)', [admin])).rejects.toThrow(
    'Not authorized',
  );
  await expect(
    db.query('update profiles set must_change_password=false where id=$1', [worker]),
  ).rejects.toThrow('permission denied');
  await expect(
    db.query("update auth.users set encrypted_password='bypass' where id=$1", [worker]),
  ).rejects.toThrow('permission denied');
  await db.exec('reset role');
  await db.query(
    'update auth.users set raw_app_meta_data=raw_app_meta_data || \'{"unrelated":true}\'::jsonb where id=$1',
    [worker],
  );
  expect(
    (
      await db.query<{ must_change_password: boolean }>(
        'select must_change_password from profiles where id=$1',
        [worker],
      )
    ).rows[0].must_change_password,
  ).toBe(true);
  await db.query("update auth.users set encrypted_password='new-personal-hash' where id=$1", [
    worker,
  ]);
  await as(worker);
  expect((await db.query('select * from organizations')).rows).toHaveLength(1);
  await db.query("select update_my_nickname('Recovered')");
  await as(admin);
  const audit = (
    await db.query<{ action: string; actor_user_id: string; metadata: unknown }>(
      "select action,actor_user_id,metadata from audit_logs where entity_id=$1 and action in ('RESET_PASSWORD','CHANGE_PASSWORD') order by created_at",
      [worker],
    )
  ).rows;
  expect(audit.map((row) => [row.action, row.actor_user_id])).toEqual([
    ['RESET_PASSWORD', admin],
    ['CHANGE_PASSWORD', worker],
  ]);
  expect(JSON.stringify(audit)).not.toContain('hash');
});

it('rate limits retries without replacing a working password', async () => {
  await expect(reset(worker)).rejects.toThrow('Reset rate limited');
  expect(
    (
      await db.query<{ encrypted_password: string }>(
        'select encrypted_password from auth.users where id=$1',
        [worker],
      )
    ).rows[0].encrypted_password,
  ).toBe('new-personal-hash');
  await db.query("update profiles set password_reset_at=now()-interval '2 minutes' where id=$1", [
    worker,
  ]);
  await reset(worker);
  expect(
    (
      await db.query<{ must_change_password: boolean }>(
        'select must_change_password from profiles where id=$1',
        [worker],
      )
    ).rows[0].must_change_password,
  ).toBe(true);
});

it('blocks pending administrators, inactive actors/targets and anonymous access', async () => {
  await db.query('update profiles set must_change_password=true where id=$1', [admin]);
  await as(admin);
  await expect(
    db.query('select register_employee($1,$2)', [crypto.randomUUID(), '{}']),
  ).rejects.toThrow('Not authorized');
  await expect(db.query('select deactivate_employee($1)', [worker])).rejects.toThrow(
    'Not authorized',
  );
  await expect(reset(worker)).rejects.toThrow('Not authorized');
  await db.query('update profiles set must_change_password=false,active=false where id=$1', [
    admin,
  ]);
  await expect(reset(worker)).rejects.toThrow('Not authorized');
  await db.query('update profiles set active=true where id=$1', [admin]);
  await db.query('update profiles set active=false where id=$1', [worker]);
  await expect(reset(worker)).rejects.toThrow('User unavailable');
  await expect(
    db.query("update auth.users set encrypted_password='inactive' where id=$1", [worker]),
  ).rejects.toThrow('User unavailable');
  await as(worker);
  expect((await db.query('select * from profiles')).rows).toHaveLength(0);
  await db.exec('reset role; set role anon');
  await expect(db.query('select private.password_changed()')).rejects.toThrow('permission denied');
});
