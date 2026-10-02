import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createFleetTestDatabase } from './helpers/fleet-database';

it('isolates demo participants and rejects repeat installation without changing data', async () => {
  const db = await createFleetTestDatabase();
  try {
    const sql = await readFile('supabase/demo-testers.sql', 'utf8');
    await db.exec(sql);
    const org = (
      await db.query<{ id: string }>("select id from organizations where slug='demo-testers'")
    ).rows[0].id;
    const branches = (
      await db.query<{ id: string }>(
        'select id from branches where organization_id=$1 order by name',
        [org],
      )
    ).rows;
    expect(branches).toHaveLength(5);
    for (const [index, branch] of branches.entries()) {
      const user = crypto.randomUUID();
      await db.query('insert into auth.users(id) values($1)', [user]);
      await db.query(
        "insert into profiles(id,organization_id,employee_id,first_name,last_name,role) values($1,$2,$3,'Demo','Test','OPERARIO')",
        [user, org, `demo0${index + 1}`],
      );
      await db.query(
        'insert into user_branches(organization_id,user_id,branch_id) values($1,$2,$3)',
        [org, user, branch.id],
      );
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      const visible = (
        await db.query<{ internal_code: string }>('select internal_code from equipment')
      ).rows;
      expect(visible.map((row) => row.internal_code).sort()).toEqual([
        `DEMO-0${index + 1}-1`,
        `DEMO-0${index + 1}-2`,
      ]);
      await db.exec('reset role');
    }
    await expect(db.exec(sql)).rejects.toThrow('demo-testers ya existe');
    await db.exec('rollback');
    expect(
      (await db.query('select id from equipment where organization_id=$1', [org])).rows,
    ).toHaveLength(10);
    expect(
      (
        await db.query(
          "select id from equipment where organization_id='10000000-0000-4000-8000-000000000001'",
        )
      ).rows,
    ).toHaveLength(40);
  } finally {
    await db.close();
  }
}, 60000);
