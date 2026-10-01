import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createFleetTestDatabase } from './helpers/fleet-database';

let db: PGlite;
const org = '10000000-0000-4000-8000-000000000001';
const manager = crypto.randomUUID(),
  operator = crypto.randomUUID(),
  outsider = crypto.randomUUID(),
  otherOrg = crypto.randomUUID();
let provider: string;
async function as(user: string) {
  await db.exec('reset role;set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
}
beforeAll(async () => {
  db = await createFleetTestDatabase();
  await db.query('insert into auth.users(id) values($1),($2),($3)', [manager, operator, outsider]);
  await db.query("insert into organizations(id,slug,name) values($1,'provider-other','Other')", [
    otherOrg,
  ]);
  await db.query(
    "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$4,'provider-admin','Admin','Test','CORPORATE_ADMIN'),($2,$4,'provider-worker','Worker','Test','OPERARIO'),($3,$5,'provider-other','Other','Test','CORPORATE_ADMIN')",
    [manager, operator, outsider, org, otherOrg],
  );
});
afterAll(async () => {
  await db?.close();
});
describe('renting providers authorization', () => {
  it('derives the organization from the authenticated administrator', async () => {
    await as(manager);
    const result = await db.query<{ id: string }>('select save_provider($1::jsonb,null) id', [
      JSON.stringify({
        name: 'Renting de prueba',
        phone: '+34 900 000 000',
        organization_id: otherOrg,
      }),
    ]);
    provider = result.rows[0].id;
    const record = await db.query<{ organization_id: string }>(
      'select organization_id from providers where id=$1',
      [provider],
    );
    expect(record.rows[0].organization_id).toBe(org);
  });
  it('lets operators read contacts but rejects writes and RPC changes', async () => {
    await as(operator);
    expect((await db.query('select id from providers where id=$1', [provider])).rows).toHaveLength(
      1,
    );
    await expect(
      db.query("update providers set phone='changed' where id=$1", [provider]),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query('select save_provider($1::jsonb,$2)', [
        JSON.stringify({ name: 'Changed', phone: '123' }),
        provider,
      ]),
    ).rejects.toThrow('Not authorized');
  });
  it('prevents reading or editing another organization provider', async () => {
    await as(outsider);
    expect((await db.query('select id from providers where id=$1', [provider])).rows).toHaveLength(
      0,
    );
    await expect(
      db.query('select save_provider($1::jsonb,$2)', [
        JSON.stringify({ name: 'Changed', phone: '123' }),
        provider,
      ]),
    ).rejects.toThrow('Provider unavailable');
  });
  it('requires contact details and lets the administrator deactivate a provider', async () => {
    await as(manager);
    await expect(
      db.query('select save_provider($1::jsonb,null)', [JSON.stringify({ name: 'No contact' })]),
    ).rejects.toThrow();
    await db.query('select save_provider($1::jsonb,$2)', [
      JSON.stringify({ name: 'Renting de prueba', phone: '+34 900 000 001', active: false }),
      provider,
    ]);
    expect(
      (await db.query<{ active: boolean }>('select active from providers where id=$1', [provider]))
        .rows[0].active,
    ).toBe(false);
  });
});
