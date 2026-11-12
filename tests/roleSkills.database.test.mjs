import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('role skills seed, access control and atomic updates', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE FUNCTION private.ka_role() RETURNS text LANGUAGE sql AS
        $$ SELECT current_setting('test.role', true) $$;
      GRANT USAGE ON SCHEMA auth, private TO authenticated;
      CREATE TABLE public.skills(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL);
    `);
    for (const name of ['202611110001_employee_course_skills.sql','202611110002_role_skills.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
    }
    const role = (await db.query('SELECT * FROM skill_roles')).rows[0];
    assert.equal(role.name,'Loan Processor');
    assert.equal((await db.query('SELECT * FROM role_skills')).rows.length,15);
    const skill = (await db.query('SELECT id FROM skills LIMIT 1')).rows[0].id;
    const as = (user,sql,args=[]) => db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query("SELECT set_config('test.role',$1,true)",[user]);
      return tx.query(sql,args);
    });
    assert.equal((await as('trainer','SELECT * FROM skill_roles')).rows.length,1);
    await assert.rejects(as('employee',"INSERT INTO skill_roles(name) VALUES ('Forbidden')"),/row-level security/);
    await assert.rejects(as('trainer','SELECT save_skill_role($1,$2,$3)',[role.id,'Changed',[]]),/Administrator/);
    await as('admin','SELECT save_skill_role($1,$2,$3)',[role.id,'Loan Processor',[skill,skill]]);
    assert.equal((await db.query('SELECT * FROM role_skills')).rows.length,1);
    await assert.rejects(as('admin','SELECT save_skill_role($1,$2,$3)',[role.id,'Invalid',['00000000-0000-0000-0000-000000000099']]),/foreign key/);
    assert.equal((await db.query('SELECT name FROM skill_roles WHERE id=$1',[role.id])).rows[0].name,'Loan Processor');
    assert.equal((await db.query('SELECT * FROM role_skills')).rows.length,1);
    await as('admin','SELECT save_skill_role($1,$2,$3)',[null,'Underwriter',[skill]]);
    assert.equal((await db.query('SELECT * FROM skill_roles')).rows.length,2);
  } finally { await db.close(); }
});
