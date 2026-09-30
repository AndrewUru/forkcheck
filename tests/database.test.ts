import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import type { ChecklistItem } from '@/types/domain';
const db = new PGlite({ extensions: { pgcrypto } });
const org = '10000000-0000-4000-8000-000000000001';
const user = '30000000-0000-4000-8000-000000000001';
const outsider = '30000000-0000-4000-8000-000000000002';
let branch: string;
let equipment: string;
let schedule: string;
let inspection: string;
let version: string;
let items: ChecklistItem[];
async function scalar<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function asUser(id = user) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function admin() {
  await db.exec('reset role');
}
async function finish(answers: unknown) {
  return db.query('select public.finish_inspection($1,$2::jsonb)', [
    inspection,
    JSON.stringify(answers),
  ]);
}
beforeAll(async () => {
  await db.exec(`create schema auth; create schema storage; create schema extensions;
 create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create table auth.users(id uuid primary key,aud text,role text,email text,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage,extensions to authenticated; grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;`);
  const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  branch = (await scalar<{ id: string }>("select id from branches where name='Valencia'"))!.id;
  const e = await scalar<{ id: string }>("select id from equipment where internal_code='CAR-001'");
  equipment = e!.id;
  schedule = (await scalar<{ id: string }>(
    'select id from equipment_schedules where equipment_id=$1',
    [equipment],
  ))!.id;
  await db.query(`insert into auth.users(id) values($1),($2)`, [user, outsider]);
  await db.query(
    `insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$2,'test-op','Ana','López','OPERARIO')`,
    [user, org],
  );
  await db.query('insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)', [
    org,
    user,
    branch,
  ]);
  const org2 = crypto.randomUUID();
  await db.query(
    "insert into organizations(id,slug,name) values($1,'other-company','Other Company')",
    [org2],
  );
  await db.query(
    "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$2,'other','Otro','Usuario','CORPORATE_ADMIN')",
    [outsider, org2],
  );
}, 60000);
afterAll(async () => {
  await db.close();
});
describe('real PostgreSQL migrations, RLS and transactional workflow', () => {
  it('loads the requested development organization, regions, branches and 40 assets', async () => {
    expect(
      (await scalar<{ count: number }>('select count(*)::int count from equipment'))?.count,
    ).toBe(40);
    expect(
      (await scalar<{ count: number }>('select count(*)::int count from branches'))?.count,
    ).toBe(6);
  });
  it('filters tables AND security-invoker views by employee branch', async () => {
    await asUser();
    const visible = await db.query<{ branch_id: string }>(
      'select branch_id from equipment_overview',
    );
    expect(visible.rows.length).toBe(7);
    expect(visible.rows.every((e) => e.branch_id === branch)).toBe(true);
    expect(
      (await scalar<{ count: number }>('select count(*)::int count from branches'))?.count,
    ).toBe(1);
  });
  it('denies another tenant all equipment, incidents and audit history', async () => {
    await asUser(outsider);
    for (const table of [
      'equipment',
      'equipment_overview',
      'inspections',
      'incidents',
      'audit_logs',
    ])
      expect(
        (
          await scalar<{ count: number }>(
            `select count(*)::int count from ${table} where organization_id='${org}'`,
          )
        )?.count,
      ).toBe(0);
    await expect(db.query('select start_inspection($1)', [schedule])).rejects.toThrow();
  });
  it('rejects browser writes and privilege escalation', async () => {
    await asUser();
    await expect(
      db.query("update profiles set role='CORPORATE_ADMIN' where id=$1", [user]),
    ).rejects.toThrow();
    await expect(
      db.query("update equipment set status='OPERATIVE' where id=$1", [equipment]),
    ).rejects.toThrow();
    await expect(db.exec('delete from audit_logs')).rejects.toThrow();
  });
  it('pins a published version and reuses the owner draft', async () => {
    await asUser();
    inspection = (await scalar<{ id: string }>('select start_inspection($1) id', [schedule]))!.id;
    expect((await scalar<{ id: string }>('select start_inspection($1) id', [schedule]))?.id).toBe(
      inspection,
    );
    version = (await scalar<{ checklist_version_id: string }>(
      'select checklist_version_id from inspections where id=$1',
      [inspection],
    ))!.checklist_version_id;
    items = (
      await db.query<ChecklistItem>(
        'select * from checklist_items where version_id=$1 order by sort_order',
        [version],
      )
    ).rows;
    expect(items.length).toBe(12);
  });
  it('prevents historical question changes even by a privileged writer', async () => {
    await admin();
    await expect(
      db.query("update checklist_items set label='Changed' where id=$1", [items[0].id]),
    ).rejects.toThrow('immutable');
    await expect(db.query('delete from checklist_versions where id=$1', [version])).rejects.toThrow(
      'immutable',
    );
    await asUser();
  });
  it('requires signature before committing anything', async () => {
    await expect(finish(items.map((item) => ({ item_id: item.id, answer: 'OK' })))).rejects.toThrow(
      'Signature required',
    );
    expect(
      (await scalar<{ count: number }>('select count(*)::int count from inspection_answers'))
        ?.count,
    ).toBe(0);
  });
  it('isolates storage paths from other users and tenants', async () => {
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('inspection-evidence',$1,'{}')",
        [`${org}/${crypto.randomUUID()}/signature.png`],
      ),
    ).rejects.toThrow();
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('inspection-evidence',$1,$2)",
      [`${org}/${inspection}/signature.png`, JSON.stringify({ mimetype: 'image/png', size: 500 })],
    );
    await asUser(outsider);
    expect(
      (await scalar<{ count: number }>('select count(*)::int count from storage.objects'))?.count,
    ).toBe(0);
    await asUser();
  });
  it('rolls back every answer when a required item is missing', async () => {
    await expect(finish([{ item_id: items[0].id, answer: 'OK' }])).rejects.toThrow(
      'Required item unanswered',
    );
    expect(
      (await scalar<{ count: number }>('select count(*)::int count from inspection_answers'))
        ?.count,
    ).toBe(0);
  });
  it('rejects duplicate and foreign-version answers transactionally', async () => {
    await expect(
      finish([
        { item_id: items[0].id, answer: 'OK' },
        { item_id: items[0].id, answer: 'OK' },
      ]),
    ).rejects.toThrow('Duplicate');
    await expect(finish([{ item_id: crypto.randomUUID(), answer: 'OK' }])).rejects.toThrow(
      'version',
    );
  });
  it('requires failure photographs and leaves equipment unchanged on failure', async () => {
    const answers = items.map((item) => ({
      item_id: item.id,
      answer: item.blocks_equipment_on_failure ? 'WARNING' : 'OK',
      notes: 'Fallo comprobado',
      photos: [],
    }));
    await expect(finish(answers)).rejects.toThrow('Photo required');
    expect(
      (await scalar<{ status: string }>('select status from equipment where id=$1', [equipment]))
        ?.status,
    ).toBe('OPERATIVE');
  });
  it('atomically creates critical incidents, blocks equipment, attaches evidence and signs', async () => {
    const fail = items.find((item) => item.blocks_equipment_on_failure)!;
    const photo = `${org}/${inspection}/${fail.id}/photo.png`;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('inspection-evidence',$1,$2)",
      [photo, JSON.stringify({ mimetype: 'image/png', size: 1000 })],
    );
    const answers = items.map((item) => ({
      item_id: item.id,
      answer: item.id === fail.id ? 'WARNING' : 'OK',
      notes: item.id === fail.id ? 'El cinturón no cierra' : '',
      photos: item.id === fail.id ? [photo] : [],
    }));
    await finish(answers);
    expect(
      (await scalar<{ status: string }>('select status from equipment where id=$1', [equipment]))
        ?.status,
    ).toBe('BLOCKED');
    expect(
      (
        await scalar<{ severity: string }>(
          'select severity from incidents where inspection_id=$1',
          [inspection],
        )
      )?.severity,
    ).toBe('CRITICAL');
    expect(
      (
        await scalar<{ overall_status: string; signature_id: string }>(
          'select overall_status,signature_id from inspections where id=$1',
          [inspection],
        )
      )?.overall_status,
    ).toBe('CRITICAL');
    expect(
      (
        await scalar<{ count: number }>(
          'select count(*)::int count from inspection_answers where inspection_id=$1',
          [inspection],
        )
      )?.count,
    ).toBe(12);
  });
  it('is idempotent and preserves immutable storage after completion', async () => {
    await finish([]);
    expect(
      (
        await scalar<{ count: number }>(
          'select count(*)::int count from incidents where inspection_id=$1',
          [inspection],
        )
      )?.count,
    ).toBe(1);
    const result = await db.query('delete from storage.objects returning *');
    expect(result.rows.length).toBe(0);
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('inspection-evidence',$1,'{}')",
        [`${org}/${inspection}/${items[0].id}/late.png`],
      ),
    ).rejects.toThrow();
  });
  it('preserves old questions when a new version is published and never auto-unblocks', async () => {
    await admin();
    const template = (await scalar<{ template_id: string }>(
      'select template_id from checklist_versions where id=$1',
      [version],
    ))!.template_id;
    const nextVersion = crypto.randomUUID();
    const section = crypto.randomUUID();
    const nextItem = crypto.randomUUID();
    await db.query(
      'insert into checklist_versions(id,organization_id,template_id,version) values($1,$2,$3,2)',
      [nextVersion, org, template],
    );
    await db.query(
      "insert into checklist_sections(id,organization_id,version_id,title,sort_order) values($1,$2,$3,'Nueva sección',1)",
      [section, org, nextVersion],
    );
    await db.query(
      "insert into checklist_items(id,organization_id,version_id,section_id,label,sort_order) values($1,$2,$3,$4,'Nueva comprobación',1)",
      [nextItem, org, nextVersion, section],
    );
    await db.query('update checklist_versions set published_at=now() where id=$1', [nextVersion]);
    await asUser();
    expect(
      (
        await scalar<{ checklist_version_id: string }>(
          'select checklist_version_id from inspections where id=$1',
          [inspection],
        )
      )?.checklist_version_id,
    ).toBe(version);
    expect(
      (
        await scalar<{ count: number }>(
          'select count(*)::int count from checklist_items where version_id=$1',
          [version],
        )
      )?.count,
    ).toBe(12);
    const nextInspection = (await scalar<{ id: string }>('select start_inspection($1) id', [
      schedule,
    ]))!.id;
    expect(
      (
        await scalar<{ checklist_version_id: string }>(
          'select checklist_version_id from inspections where id=$1',
          [nextInspection],
        )
      )?.checklist_version_id,
    ).toBe(nextVersion);
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('inspection-evidence',$1,$2)",
      [
        `${org}/${nextInspection}/signature.png`,
        JSON.stringify({ mimetype: 'image/png', size: 500 }),
      ],
    );
    await db.query('select finish_inspection($1,$2::jsonb)', [
      nextInspection,
      JSON.stringify([{ item_id: nextItem, answer: 'OK' }]),
    ]);
    expect(
      (await scalar<{ status: string }>('select status from equipment where id=$1', [equipment]))
        ?.status,
    ).toBe('BLOCKED');
  });
  it('rejects cross-tenant foreign keys even for privileged tooling', async () => {
    await admin();
    const otherOrg = (await scalar<{ organization_id: string }>(
      'select organization_id from profiles where id=$1',
      [outsider],
    ))!.organization_id;
    await expect(
      db.query(
        'insert into equipment_assignments(organization_id,equipment_id,branch_id) values($1,$2,$3)',
        [otherOrg, equipment, branch],
      ),
    ).rejects.toThrow();
    await asUser();
  });
  it('counts completed plans once and keeps dashboard aggregates inside RLS', async () => {
    await expect(
      db.query("select dashboard_metrics((now() at time zone 'Europe/Madrid')::date)"),
    ).rejects.toThrow('Not authorized');
    await admin();
    await db.query("update profiles set role='SUPERVISOR' where id=$1", [user]);
    await asUser();
    const row = await scalar<{ metrics: { equipment: number; completed: number } }>(
      "select dashboard_metrics((now() at time zone 'Europe/Madrid')::date) metrics",
    );
    expect(row?.metrics.equipment).toBe(7);
    expect(row?.metrics.completed).toBe(1);
    await asUser(outsider);
    expect(
      (
        await scalar<{ metrics: { equipment: number } }>(
          "select dashboard_metrics((now() at time zone 'Europe/Madrid')::date) metrics",
        )
      )?.metrics.equipment,
    ).toBe(0);
    await asUser();
  });
  it('denies an otherwise branch-authorized maintenance role inspection mutations', async () => {
    await admin();
    await db.query("update profiles set role='MANTENIMIENTO' where id=$1", [user]);
    await asUser();
    await expect(db.query('select start_inspection($1)', [schedule])).rejects.toThrow(
      'Not authorized',
    );
    await admin();
    await db.query("update profiles set role='OPERARIO' where id=$1", [user]);
    await asUser();
  });
  it('honors revoked access immediately', async () => {
    await admin();
    await db.query('update profiles set active=false where id=$1', [user]);
    await asUser();
    expect(
      (await scalar<{ count: number }>('select count(*)::int count from equipment'))?.count,
    ).toBe(0);
    await expect(db.query('select start_inspection($1)', [schedule])).rejects.toThrow();
  });
});
