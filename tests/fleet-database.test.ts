import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createFleetTestDatabase } from './helpers/fleet-database';
import type { PGlite } from '@electric-sql/pglite';
let db: PGlite;
const org = '10000000-0000-4000-8000-000000000001';
const manager = crypto.randomUUID(),
  operator = crypto.randomUUID(),
  outsider = crypto.randomUUID(),
  otherOrg = crypto.randomUUID();
let branch: string,
  type: string,
  template: string,
  createdId: string,
  createdCode: string,
  currentAssignment: string;
async function row<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0]!;
}
async function as(id: string) {
  await db.exec('reset role;set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
const createInput = () => ({
  equipment_type_id: type,
  branch_id: branch,
  zone_id: '',
  template_id: template,
  internal_code: 'CAR-NEW',
  brand: 'Still',
  model: 'RX 20',
  serial_number: 'TRIAL-NEW',
  year: 2025,
});
beforeAll(async () => {
  db = await createFleetTestDatabase();
  branch = (await row<{ id: string }>("select id from branches where name='Valencia'")).id;
  type = (
    await row<{ id: string }>("select id from equipment_types where name='Carretilla elevadora'")
  ).id;
  template = (
    await row<{ id: string }>('select id from checklist_templates where equipment_type_id=$1', [
      type,
    ])
  ).id;
  await db.query('insert into auth.users(id) values($1),($2),($3)', [manager, operator, outsider]);
  await db.query(
    "insert into organizations(id,slug,name) values($1,'another-company','Another Company')",
    [otherOrg],
  );
  await db.query(
    "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$4,'admin','Admin','Test','CORPORATE_ADMIN'),($2,$4,'worker','Worker','Test','OPERARIO'),($3,$5,'other','Other','Test','CORPORATE_ADMIN')",
    [manager, operator, outsider, org, otherOrg],
  );
  await db.query('insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)', [
    org,
    operator,
    branch,
  ]);
});
afterAll(async () => {
  await db?.close();
});
describe('fleet management enforced in PostgreSQL', () => {
  it('denies equipment management to an operator, including forged tenant input', async () => {
    await as(operator);
    await expect(
      db.query('select create_equipment($1::jsonb)', [
        JSON.stringify({ ...createInput(), organization_id: otherOrg }),
      ]),
    ).rejects.toThrow('Not authorized');
    await expect(db.query("select assign_equipment('worker','CAR-001',null)")).rejects.toThrow(
      'Not authorized',
    );
  });
  it('creates equipment, location and published inspection plan atomically in the session tenant', async () => {
    await as(manager);
    createdCode = (
      await row<{ code: string }>('select create_equipment($1::jsonb) code', [
        JSON.stringify({ ...createInput(), organization_id: otherOrg }),
      ])
    ).code;
    const e = await row<{ id: string; organization_id: string }>(
      'select id,organization_id from equipment where public_code=$1',
      [createdCode],
    );
    createdId = e.id;
    expect(e.organization_id).toBe(org);
    expect(
      (
        await row<{ branch_id: string }>(
          'select branch_id from equipment_assignments where equipment_id=$1',
          [createdId],
        )
      ).branch_id,
    ).toBe(branch);
    expect(
      (
        await row<{ template_id: string }>(
          'select template_id from equipment_schedules where equipment_id=$1',
          [createdId],
        )
      ).template_id,
    ).toBe(template);
    await expect(
      db.query('select create_equipment($1::jsonb)', [JSON.stringify(createInput())]),
    ).rejects.toThrow('unique');
  });
  it('rejects an incompatible template without leaving a partial asset', async () => {
    const otherTemplate = (
      await row<{ id: string }>(
        'select id from checklist_templates where equipment_type_id<>$1 limit 1',
        [type],
      )
    ).id;
    await expect(
      db.query('select create_equipment($1::jsonb)', [
        JSON.stringify({
          ...createInput(),
          internal_code: 'BAD-TEMPLATE',
          template_id: otherTemplate,
        }),
      ]),
    ).rejects.toThrow('compatible');
    expect(
      (
        await row<{ count: number }>(
          "select count(*)::int count from equipment where internal_code='BAD-TEMPLATE'",
        )
      ).count,
    ).toBe(0);
  });
  it('assigns only within branch scope and records one current assignment per user', async () => {
    await expect(db.query("select assign_equipment('worker','CAR-002',null)")).rejects.toThrow(
      'not authorized for this branch',
    );
    currentAssignment = (
      await row<{ id: string }>("select assign_equipment('worker','CAR-001',null) id")
    ).id;
    const previous = currentAssignment;
    currentAssignment = (
      await row<{ id: string }>("select assign_equipment('worker','CAR-NEW',$1) id", [previous])
    ).id;
    expect(
      (
        await row<{ count: number }>(
          'select count(*)::int count from equipment_operators where user_id=$1 and ended_at is null',
          [operator],
        )
      ).count,
    ).toBe(1);
    expect(
      (
        await row<{ ended_at: string | null }>(
          'select ended_at from equipment_operators where id=$1',
          [previous],
        )
      ).ended_at,
    ).not.toBeNull();
    await expect(
      db.query("select assign_equipment('worker','CAR-007',$1)", [previous]),
    ).rejects.toThrow('Assignment changed');
  });
  it('does not expose personal assignments across tenants or grant direct writes', async () => {
    await as(outsider);
    expect(
      (await row<{ count: number }>('select count(*)::int count from equipment_operators')).count,
    ).toBe(0);
    await expect(db.query("select assign_equipment('worker','CAR-NEW',null)")).rejects.toThrow();
    await as(operator);
    expect(
      (
        await row<{ count: number }>(
          'select count(*)::int count from equipment_operators where ended_at is null',
        )
      ).count,
    ).toBe(1);
    await expect(db.query('update equipment_operators set ended_at=now()')).rejects.toThrow(
      'permission denied',
    );
  });
  it('allows editing only the session nickname without changing legal identity or role', async () => {
    await as(operator);
    expect(
      (await row<{ nickname: string }>("select update_my_nickname('  Toro azul  ') nickname"))
        .nickname,
    ).toBe('Toro azul');
    const p = await row<{ nickname: string; first_name: string; role: string }>(
      'select nickname,first_name,role from profiles where id=$1',
      [operator],
    );
    expect(p).toEqual({ nickname: 'Toro azul', first_name: 'Worker', role: 'OPERARIO' });
    await expect(db.query('select update_my_nickname($1)', ['x'.repeat(41)])).rejects.toThrow(
      'Invalid nickname',
    );
    await expect(
      db.query("update profiles set nickname='forged' where id=$1", [manager]),
    ).rejects.toThrow('permission denied');
    expect(
      (await row<{ nickname: string | null }>("select update_my_nickname('') nickname")).nickname,
    ).toBeNull();
  });
  it('refuses retirement by an operator and requires exact confirmation', async () => {
    await expect(
      db.query("select retire_equipment($1,'CAR-NEW','Renewal')", [createdCode]),
    ).rejects.toThrow('Not authorized');
    await as(manager);
    await expect(
      db.query("select retire_equipment($1,'WRONG','Renewal')", [createdCode]),
    ).rejects.toThrow('Confirmation');
  });
  it('archives the asset, closes personal assignments, disables plans and preserves historical rows', async () => {
    const historyBefore = (
      await row<{ count: number }>(
        'select count(*)::int count from equipment_operators where user_id=$1',
        [operator],
      )
    ).count;
    await db.query("select retire_equipment($1,'CAR-NEW','Renovación de flota')", [createdCode]);
    const e = await row<{ status: string; retirement_reason: string; retired_at: string | null }>(
      'select status,retirement_reason,retired_at from equipment where id=$1',
      [createdId],
    );
    expect(e.status).toBe('INACTIVE');
    expect(e.retired_at).not.toBeNull();
    expect(e.retirement_reason).toBe('Renovación de flota');
    expect(
      (
        await row<{ count: number }>(
          'select count(*)::int count from equipment_operators where user_id=$1',
          [operator],
        )
      ).count,
    ).toBe(historyBefore);
    expect(
      (
        await row<{ count: number }>(
          'select count(*)::int count from equipment_operators where user_id=$1 and ended_at is null',
          [operator],
        )
      ).count,
    ).toBe(0);
    expect(
      (
        await row<{ active: boolean }>(
          'select active from equipment_schedules where equipment_id=$1',
          [createdId],
        )
      ).active,
    ).toBe(false);
    expect(
      (
        await row<{ retired_at: string | null }>(
          'select retired_at from equipment_overview where id=$1',
          [createdId],
        )
      ).retired_at,
    ).not.toBeNull();
    await expect(db.query("select assign_equipment('worker','CAR-NEW',null)")).rejects.toThrow(
      'Equipment unavailable',
    );
    await db.query("select retire_equipment($1,'CAR-NEW','Idempotent retry')", [createdCode]);
  });
  it('prevents retirement while an inspection is open', async () => {
    const s = await row<{ id: string; public_code: string }>(
      "select s.id,e.public_code from equipment_schedules s join equipment e on e.id=s.equipment_id where e.internal_code='CAR-007'",
    );
    await db.query('select start_inspection($1)', [s.id]);
    await expect(
      db.query("select retire_equipment($1,'CAR-007','Renewal')", [s.public_code]),
    ).rejects.toThrow('still in progress');
    expect(
      (await row<{ status: string }>("select status from equipment where internal_code='CAR-007'"))
        .status,
    ).toBe('OPERATIVE');
  });
  it('audits nickname, assignment, creation and retirement', async () => {
    expect(
      (
        await row<{ count: number }>(
          "select count(*)::int count from audit_logs where entity_type='equipment_operators' and actor_user_id=$1",
          [manager],
        )
      ).count,
    ).toBeGreaterThan(0);
    expect(
      (
        await row<{ count: number }>(
          "select count(*)::int count from audit_logs where entity_type='profiles' and actor_user_id=$1 and action='UPDATE'",
          [operator],
        )
      ).count,
    ).toBeGreaterThan(0);
    await as(outsider);
    await expect(
      db.query("select retire_equipment($1,'CAR-NEW','Cross tenant')", [createdCode]),
    ).rejects.toThrow('Equipment unavailable');
  });
});
