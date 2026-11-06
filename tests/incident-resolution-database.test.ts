import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createFleetTestDatabase } from './helpers/fleet-database';
let db: PGlite;
const org = '10000000-0000-4000-8000-000000000001';
const admin = crypto.randomUUID(),
  maintenance = crypto.randomUUID(),
  worker = crypto.randomUUID(),
  outsider = crypto.randomUUID();
let branch: string, otherBranch: string, type: string;
async function as(id: string) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function scalar<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, args)).rows[0].value;
}
async function fixture() {
  await db.exec('reset role');
  const equipment = crypto.randomUUID(),
    incident = crypto.randomUUID();
  await db.query(
    "insert into equipment(id,organization_id,equipment_type_id,internal_code,brand,model,status) values($1::uuid,$2,$3,$1::uuid::text,'Test','Test','BLOCKED')",
    [equipment, org, type],
  );
  await db.query(
    'insert into equipment_assignments(organization_id,equipment_id,branch_id) values($1,$2,$3)',
    [org, equipment, branch],
  );
  await db.query(
    "insert into incidents(id,organization_id,branch_id,equipment_id,reported_by,severity,title,description) values($1,$2,$3,$4,$5,'HIGH','Freno','Fallo de freno')",
    [incident, org, branch, equipment, worker],
  );
  await as(admin);
  return { equipment, incident };
}
const close = (id: string) =>
  db.query(
    "select resolve_incident($1,(select updated_at from incidents where id=$1),'Reparación verificada por el taller')",
    [id],
  );
const release = (id: string) =>
  db.query(
    "select return_equipment_to_service($1,(select updated_at from equipment where id=$1),'Revisión de taller y prueba funcional correctas')",
    [id],
  );
beforeAll(async () => {
  db = await createFleetTestDatabase();
  const branches = (await db.query<{ id: string }>('select id from branches order by id limit 2'))
    .rows;
  branch = branches[0].id;
  otherBranch = branches[1].id;
  type = await scalar<string>('select id value from equipment_types limit 1');
  const otherOrg = crypto.randomUUID();
  await db.query("insert into organizations(id,slug,name) values($1,'resolution-other','Other')", [
    otherOrg,
  ]);
  for (const [id, role, tenant] of [
    [admin, 'CORPORATE_ADMIN', org],
    [maintenance, 'MANTENIMIENTO', org],
    [worker, 'OPERARIO', org],
    [outsider, 'CORPORATE_ADMIN', otherOrg],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query(
      "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1::uuid,$2,$1::uuid::text,'Test','Test',$3)",
      [id, tenant, role],
    );
  }
  await db.query(
    'insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$4),($1,$3,$4)',
    [org, maintenance, worker, branch],
  );
});
afterAll(async () => {
  await db?.close();
});
it('closes with author, notes and audit but retains the machine block until explicit authorization', async () => {
  const { equipment, incident } = await fixture();
  await as(maintenance);
  await close(incident);
  expect(await scalar<string>('select status value from equipment where id=$1', [equipment])).toBe(
    'BLOCKED',
  );
  expect(
    await scalar<string>('select resolved_by value from incidents where id=$1', [incident]),
  ).toBe(maintenance);
  await expect(release(equipment)).rejects.toThrow('Not authorized');
  await as(admin);
  await release(equipment);
  expect(await scalar<string>('select status value from equipment where id=$1', [equipment])).toBe(
    'OPERATIVE',
  );
  expect(
    await scalar<string>(
      "select metadata->>'reason' value from audit_logs where entity_id=$1 and action='RETURN_TO_SERVICE'",
      [equipment],
    ),
  ).toContain('prueba funcional');
  expect(
    await scalar<number>(
      "select count(*)::int value from audit_logs where entity_id=$1 and action='UPDATE'",
      [incident],
    ),
  ).toBe(1);
});
it('denies operators, foreign admins and anonymous calls without direct-write bypass', async () => {
  const { equipment, incident } = await fixture();
  await as(worker);
  await expect(close(incident)).rejects.toThrow('Not authorized');
  await expect(
    db.query("update incidents set status='CLOSED' where id=$1", [incident]),
  ).rejects.toThrow('permission denied');
  await as(outsider);
  await expect(close(incident)).rejects.toThrow('Incident unavailable');
  await expect(release(equipment)).rejects.toThrow('Equipment unavailable');
  await db.exec('reset role; set role anon');
  await expect(close(incident)).rejects.toThrow('permission denied');
});
it('requires scope on both historical branch and current equipment location', async () => {
  const { equipment, incident } = await fixture();
  await db.exec('reset role');
  await db.query('update equipment_assignments set branch_id=$2 where equipment_id=$1', [
    equipment,
    otherBranch,
  ]);
  await as(maintenance);
  await expect(close(incident)).rejects.toThrow('Incident unavailable');
  await db.exec('reset role');
  await db.query('update equipment_assignments set branch_id=$2 where equipment_id=$1', [
    equipment,
    branch,
  ]);
  await db.query('update incidents set branch_id=$2 where id=$1', [incident, otherBranch]);
  await as(maintenance);
  await expect(close(incident)).rejects.toThrow('Not authorized');
});
it('rejects stale updates, invalid notes and replay without rewriting resolution', async () => {
  const { equipment, incident } = await fixture();
  await expect(db.query("select resolve_incident($1,now(),'short')", [incident])).rejects.toThrow(
    'Invalid resolution',
  );
  await expect(
    db.query("select resolve_incident($1,'2000-01-01','A sufficiently long reason')", [incident]),
  ).rejects.toThrow('Incident changed');
  await close(incident);
  await expect(close(incident)).rejects.toThrow('Incident changed');
  await expect(
    db.query("select return_equipment_to_service($1,'2000-01-01','A sufficiently long reason')", [
      equipment,
    ]),
  ).rejects.toThrow('Equipment changed');
});
it('refuses release with open incidents and never reactivates retired equipment', async () => {
  const { equipment, incident } = await fixture();
  await expect(release(equipment)).rejects.toThrow('Incidents pending');
  await close(incident);
  await db.exec('reset role');
  await db.query(
    "update equipment set status='INACTIVE',retired_at=now(),retirement_reason='Renovación' where id=$1",
    [equipment],
  );
  await as(admin);
  await expect(release(equipment)).rejects.toThrow('Equipment unavailable');
});
it('blocks resolution and release during maintenance, retaining all changes on failure', async () => {
  const { equipment, incident } = await fixture();
  await db.exec('reset role');
  await db.query(
    "insert into maintenance_orders(organization_id,branch_id,equipment_id,incident_id,description) values($1,$2,$3,$4,'Taller')",
    [org, branch, equipment, incident],
  );
  await as(admin);
  await expect(close(incident)).rejects.toThrow('Maintenance pending');
  expect(await scalar<string>('select status value from incidents where id=$1', [incident])).toBe(
    'OPEN',
  );
  await db.exec('reset role');
  await db.query("update incidents set status='CLOSED' where id=$1", [incident]);
  await as(admin);
  await expect(release(equipment)).rejects.toThrow('Maintenance pending');
});
it('revokes access for inactive and password-pending actors', async () => {
  const { incident } = await fixture();
  for (const column of ['must_change_password=true', 'active=false']) {
    await db.exec('reset role');
    await db.query(`update profiles set ${column} where id=$1`, [maintenance]);
    await as(maintenance);
    await expect(close(incident)).rejects.toThrow('Not authorized');
  }
});
it('refuses resolution and release while a previously started inspection remains open', async () => {
  const { equipment, incident } = await fixture();
  await db.exec('reset role');
  const template = await scalar<string>(
    'select id value from checklist_templates where equipment_type_id=$1 and archived_at is null limit 1',
    [type],
  );
  const schedule = await scalar<string>(
    'insert into equipment_schedules(organization_id,equipment_id,template_id) values($1,$2,$3) returning id value',
    [org, equipment, template],
  );
  await as(admin);
  await db.query('select start_inspection($1)', [schedule]);
  await expect(close(incident)).rejects.toThrow('Inspection in progress');
  await db.exec('reset role');
  await db.query("update incidents set status='CLOSED' where id=$1", [incident]);
  await as(admin);
  await expect(release(equipment)).rejects.toThrow('Inspection in progress');
  expect(await scalar<string>('select status value from equipment where id=$1', [equipment])).toBe(
    'BLOCKED',
  );
});
it.each(['WARNING', 'MAINTENANCE'])(
  'requires explicit authorization to release %s equipment',
  async (status) => {
    const { equipment, incident } = await fixture();
    await close(incident);
    await db.exec('reset role');
    await db.query('update equipment set status=$2 where id=$1', [equipment, status]);
    await as(admin);
    await release(equipment);
    expect(
      await scalar<string>('select status value from equipment where id=$1', [equipment]),
    ).toBe('OPERATIVE');
  },
);
