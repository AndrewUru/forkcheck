import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createFleetTestDatabase } from './helpers/fleet-database';

let db: PGlite;
const org = '10000000-0000-4000-8000-000000000001';
const ehs = crypto.randomUUID(), chief = crypto.randomUUID(), worker = crypto.randomUUID();
const shared = crypto.randomUUID(), reader = crypto.randomUUID(), foreign = crypto.randomUUID();
const newUser = crypto.randomUUID(), otherOrg = crypto.randomUUID();
let branch: string, remoteBranch: string, type: string, template: string;
let asset: string, publicCode: string, remoteCode: string, remotePublic: string;
async function as(id: string) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function denied(sql: string, params: unknown[] = [], message?: string) {
  await db.exec('savepoint denied_action');
  await expect(db.query(sql, params)).rejects.toThrow(message);
  await db.exec('rollback to savepoint denied_action');
}
const createInput = () => ({ equipment_type_id: type, template_id: template, branch_id: branch, zone_id: '', internal_code: 'NEW-FLEET', brand: 'New brand', model: 'New model', serial_number: 'serial', year: 2026 });
const editInput = () => ({ branch_id: branch, zone_id: '', internal_code: 'CAR-EDITED', brand: 'Edited brand', model: 'Edited model', serial_number: 'edited', year: 2025 });
const registerInput = (role = 'JEFE_ALMACEN', branches = [branch]) => ({ employee_id: 'new-fleet-user', first_name: 'New', last_name: 'User', role, branches, organization_id: otherOrg });
async function version(code = publicCode) {
  return (await db.query<{ updated_at: string }>('select updated_at::text from equipment where public_code=$1', [code])).rows[0].updated_at;
}
beforeAll(async () => {
  db = await createFleetTestDatabase();
  const own = (await db.query<{ id: string; public_code: string; branch_id: string; equipment_type_id: string }>("select * from equipment_overview where internal_code='CAR-001'")).rows[0];
  asset = own.id; branch = own.branch_id; type = own.equipment_type_id; publicCode = own.public_code;
  template = (await db.query<{ template_id: string }>('select template_id from equipment_schedules where equipment_id=$1', [asset])).rows[0].template_id;
  const remote = (await db.query<{ branch_id: string; internal_code: string; public_code: string }>('select * from equipment_overview where branch_id<>$1 limit 1', [branch])).rows[0];
  remoteBranch = remote.branch_id; remoteCode = remote.internal_code; remotePublic = remote.public_code;
  await db.query("insert into organizations(id,slug,name) values($1,'foreign-fleet','Foreign')", [otherOrg]);
  for (const [id, role, employee] of [[ehs, 'EHS', 'ehs'], [chief, 'JEFE_ALMACEN', 'chief'], [worker, 'OPERARIO', 'worker'], [shared, 'OPERARIO', 'shared'], [reader, 'DIRECTOR_GENERAL', 'reader'], [foreign, 'EHS', 'foreign']]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query("insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$2,$3,'Fleet','Test',$4)", [id, id === foreign ? otherOrg : org, employee, role]);
    if (id !== reader && id !== foreign)
      await db.query('insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)', [org,id,branch]);
  }
  await db.query('insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)', [org,shared,remoteBranch]);
  await db.query("insert into auth.users(id,email) values($1,'new-fleet-user@demo-logistics.employees.forkcheck.invalid')", [newUser]);
});
beforeEach(async () => { await db.exec('reset role; begin'); });
afterEach(async () => { await db.exec('rollback; reset role'); });
afterAll(async () => { await db?.close(); });

it.each(['OPERARIO', 'JEFE_ALMACEN'])('EHS creates %s only in its scope and session organization', async (role) => {
  await as(ehs);
  await db.query('select register_employee($1,$2::jsonb)', [newUser,JSON.stringify(registerInput(role))]);
  expect((await db.query<{ role: string; organization_id: string }>('select role,organization_id from profiles where id=$1', [newUser])).rows[0]).toEqual({ role, organization_id: org });
});
it('EHS cannot grant superior roles, remote centers or manipulate another tenant', async () => {
  await as(ehs);
  for (const role of ['EHS','DELEGADO_CENTRO','DIRECTOR_REGIONAL','DIRECTOR_GENERAL','CORPORATE_ADMIN','SUPERADMIN'])
    await denied('select register_employee($1,$2::jsonb)', [newUser,JSON.stringify(registerInput(role))]);
  await denied('select register_employee($1,$2::jsonb)', [newUser,JSON.stringify(registerInput('JEFE_ALMACEN',[branch,remoteBranch]))], 'Invalid branch');
  await denied('select designate_warehouse_chief($1,$2,$3,$4)', [foreign,[branch],'JEFE_ALMACEN',[]], 'User unavailable');
  expect((await db.query('select * from profiles where id=$1',[newUser])).rows).toHaveLength(0);
});
it('designates an existing operator, closes their personal assignment and audits without losing history', async () => {
  await as(ehs);
  await db.query("select assign_equipment('worker','CAR-001',null)");
  await db.query('select designate_warehouse_chief($1,$2,$3,$4)', [worker,[branch],'OPERARIO',[branch]]);
  expect((await db.query<{ role: string }>('select role from profiles where id=$1',[worker])).rows[0].role).toBe('JEFE_ALMACEN');
  await db.exec('reset role');
  const assignments = (await db.query<{ ended_at: string }>('select ended_at from equipment_operators where user_id=$1',[worker])).rows;
  expect(assignments).toHaveLength(1); expect(assignments[0].ended_at).toBeTruthy();
  expect((await db.query("select * from audit_logs where entity_id=$1 and action='DESIGNATE_CHIEF'",[worker])).rows).toHaveLength(1);
});
it('updates a chief scope only after checking old/new scope and optimistic concurrency', async () => {
  await as(ehs);
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[chief,[remoteBranch],'JEFE_ALMACEN',[branch]],'Invalid branch');
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[shared,[branch],'OPERARIO',[branch]],'Invalid branch');
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[chief,[branch],'OPERARIO',[branch]],'User changed');
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[chief,[branch],'JEFE_ALMACEN',[]],'User changed');
  await db.exec('reset role');
  await db.query('insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)',[org,ehs,remoteBranch]);
  await as(ehs);
  await db.query('select designate_warehouse_chief($1,$2,$3,$4)',[chief,[branch,remoteBranch],'JEFE_ALMACEN',[branch]]);
  expect((await db.query('select * from user_branches where user_id=$1',[chief])).rows).toHaveLength(2);
});
it('refuses designation while the operator has an open inspection', async () => {
  await as(worker);
  await db.query('select start_inspection(id) from equipment_schedules where equipment_id=$1',[asset]);
  await as(ehs);
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[worker,[branch],'OPERARIO',[branch]],'Inspection still in progress');
});
it.each([chief,worker,reader,foreign])('rejects unauthorized designation by %s', async (actor) => {
  await as(actor);
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[worker,[branch],'OPERARIO',[branch]]);
});
it.each([ehs,chief])('creates and edits fleet with authorized actor %s, preserving its plan and status', async (actor) => {
  await as(actor);
  const created = (await db.query<{ code: string }>('select create_equipment($1::jsonb) code',[JSON.stringify({...createInput(),organization_id:otherOrg})])).rows[0].code;
  const token = await version(created);
  await db.query('select update_equipment($1,$2,$3::jsonb)',[created,token,JSON.stringify({...editInput(),status:'OPERATIVE'})]);
  const result = (await db.query<{ id: string; organization_id: string; model: string }>('select id,organization_id,model from equipment where public_code=$1',[created])).rows[0];
  expect(result.organization_id).toBe(org); expect(result.model).toBe('Edited model');
  expect((await db.query<{ template_id: string }>('select template_id from equipment_schedules where equipment_id=$1',[result.id])).rows[0].template_id).toBe(template);
  await denied('select update_equipment($1,$2,$3::jsonb)',[created,token,JSON.stringify(editInput())],'Equipment changed');
});
it.each([ehs,chief])('denies remote equipment creation/editing by %s and rolls back failed edits', async (actor) => {
  const remoteToken = await version(remotePublic);
  await as(actor);
  await denied('select create_equipment($1::jsonb)',[JSON.stringify({...createInput(),branch_id:remoteBranch})]);
  await denied('select update_equipment($1,$2,$3::jsonb)',[remotePublic,remoteToken,JSON.stringify(editInput())],'Not authorized');
  await denied('select update_equipment($1,$2,$3::jsonb)',[publicCode,await version(),JSON.stringify({...editInput(),branch_id:remoteBranch})],'Not authorized');
  await denied('select update_equipment($1,$2,$3::jsonb)',[publicCode,await version(),JSON.stringify({...editInput(),year:2500})]);
  expect((await db.query<{ internal_code: string }>('select internal_code from equipment where id=$1',[asset])).rows[0].internal_code).toBe('CAR-001');
});
it('does not unlock a machine through metadata edits or self-assignment', async () => {
  await db.query("update equipment set status='BLOCKED' where id=$1",[asset]);
  await as(ehs);
  await db.query('select update_equipment($1,$2,$3::jsonb)',[publicCode,await version(),JSON.stringify({...editInput(),status:'OPERATIVE'})]);
  await as(worker);
  await db.query("select assign_my_equipment('CAR-EDITED',null)");
  expect((await db.query<{ status: string }>('select status from equipment where id=$1',[asset])).rows[0].status).toBe('BLOCKED');
});
it('preserves location history on authorized transfer and checks assigned operators first', async () => {
  await db.query('insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)',[org,ehs,remoteBranch]);
  await as(ehs);
  const assigned = (await db.query<{ id: string }>("select assign_equipment('worker','CAR-001',null) id")).rows[0].id;
  const token = await version();
  await denied('select update_equipment($1,$2,$3::jsonb)',[publicCode,token,JSON.stringify({...editInput(),branch_id:remoteBranch})],'Assigned operators lack');
  await db.query("select assign_equipment('worker','',$1)",[assigned]);
  await db.query('select update_equipment($1,$2,$3::jsonb)',[publicCode,token,JSON.stringify({...editInput(),branch_id:remoteBranch})]);
  const locations = (await db.query<{ branch_id: string; end_date: string | null }>('select branch_id,end_date from equipment_assignments where equipment_id=$1',[asset])).rows;
  expect(locations).toHaveLength(2);
  expect(locations.find((l)=>l.end_date===null)?.branch_id).toBe(remoteBranch);
  expect(locations.find((l)=>l.end_date!==null)?.branch_id).toBe(branch);
});
it('denies relocation during an inspection without rewriting its captured center', async () => {
  await db.query('insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)',[org,ehs,remoteBranch]);
  await as(worker);
  await db.query('select start_inspection(id) from equipment_schedules where equipment_id=$1',[asset]);
  await as(ehs);
  await denied('select update_equipment($1,$2,$3::jsonb)',[publicCode,await version(),JSON.stringify({...editInput(),branch_id:remoteBranch})],'Inspection still in progress');
  expect((await db.query<{ branch_id: string }>('select branch_id from inspections where equipment_id=$1',[asset])).rows[0].branch_id).toBe(branch);
});
it('self-assigns only the session operator, supports shared equipment and retains assignment history', async () => {
  await as(ehs);
  await db.query("select assign_equipment('shared','CAR-001',null)");
  await as(worker);
  const id = (await db.query<{ id: string }>("select assign_my_equipment('CAR-001',null) id")).rows[0].id;
  expect((await db.query<{ id: string }>("select assign_my_equipment('CAR-001',$1) id",[id])).rows[0].id).toBe(id);
  await denied("select assign_my_equipment('',null)",[],'Assignment changed');
  await denied("select assign_equipment('shared','',null)",[],'Not authorized');
  await denied("select private.assign_equipment_for('shared','',null)",[],'permission denied');
  await db.query("select assign_my_equipment('',$1)",[id]);
  await db.exec('reset role');
  expect((await db.query('select * from equipment_operators where user_id=$1 and ended_at is null',[shared])).rows).toHaveLength(1);
  expect((await db.query('select * from equipment_operators where user_id=$1 and ended_at is not null',[worker])).rows).toHaveLength(1);
});
it('rejects self-assignment outside the center or to retired equipment', async () => {
  await as(worker);
  await denied('select assign_my_equipment($1,null)',[remoteCode],'Not authorized');
  await db.exec('reset role');
  await db.query("update equipment set status='INACTIVE' where id=$1",[asset]);
  await as(worker);
  await denied("select assign_my_equipment('CAR-001',null)",[],'Equipment unavailable');
});
it.each([ehs,chief,reader])('keeps operator self-assignment unavailable to %s', async (id) => {
  await as(id);
  await denied("select assign_my_equipment('CAR-001',null)",[],'Not authorized');
});
it.each([worker,reader,foreign])('denies fleet mutation to unauthorized user %s', async (actor) => {
  const token = await version();
  await as(actor);
  await denied('select create_equipment($1::jsonb)',[JSON.stringify(createInput())]);
  await denied('select update_equipment($1,$2,$3::jsonb)',[publicCode,token,JSON.stringify(editInput())]);
});
it.each(['inactive','password'])('revokes all new capabilities for %s actors', async (state) => {
  await db.query(state==='inactive' ? 'update profiles set active=false where id=any($1)' : 'update profiles set must_change_password=true where id=any($1)',[[ehs,worker]]);
  await as(ehs);
  await denied('select create_equipment($1::jsonb)',[JSON.stringify(createInput())],'Not authorized');
  await denied('select register_employee($1,$2::jsonb)',[newUser,JSON.stringify(registerInput())],'Not authorized');
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[chief,[branch],'JEFE_ALMACEN',[branch]],'Not authorized');
  await as(worker);
  await denied("select assign_my_equipment('CAR-001',null)",[],'Not authorized');
});
it('denies anonymous execution and direct table writes', async () => {
  await as(worker);
  await denied('insert into equipment_operators(organization_id,user_id,equipment_id,assigned_by) values($1,$2,$3,$2)',[org,worker,asset],'permission denied');
  await db.exec('set role anon');
  await denied("select assign_my_equipment('CAR-001',null)",[],'permission denied');
  await denied('select designate_warehouse_chief($1,$2,$3,$4)',[worker,[branch],'OPERARIO',[branch]],'permission denied');
});
