import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('lending role seed links all 66 skills and preserves existing records on rerun', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE skills(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, description text, archived boolean DEFAULT false);
      CREATE TABLE skill_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
      CREATE UNIQUE INDEX skill_roles_name_unique ON skill_roles(lower(btrim(name)));
      CREATE TABLE role_skills(role_id uuid REFERENCES skill_roles(id), skill_id uuid REFERENCES skills(id), PRIMARY KEY(role_id, skill_id));
      INSERT INTO skills(name, description, archived) VALUES (' basic mortgage broking knowledge ', 'Keep this description', true), ('Existing skill', 'Original', false);
      INSERT INTO skill_roles(name) VALUES (' BASIC LOAN PROCESSING '), ('Existing role');
      INSERT INTO role_skills SELECT r.id, s.id FROM skill_roles r CROSS JOIN skills s WHERE r.name = 'Existing role' AND s.name = 'Existing skill';
    `);
    const before = (await db.query('SELECT * FROM skills ORDER BY name')).rows;
    const migration = await readFile(new URL('../supabase/migrations/202611120001_lending_role_skills.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const counts = (await db.query(`SELECT lower(btrim(r.name)) AS name, count(*)::int AS count FROM skill_roles r JOIN role_skills rs ON rs.role_id = r.id GROUP BY r.id ORDER BY name`)).rows;
    assert.deepEqual(counts, [
      { name: 'advanced loan processing', count: 16 },
      { name: 'advanced loan structuring & technical lending', count: 18 },
      { name: 'basic loan processing', count: 14 },
      { name: 'existing role', count: 1 },
      { name: 'financial assessment & credit analysis', count: 18 },
    ]);
    const snapshot = async () => (await db.query(`SELECT (SELECT count(*)::int FROM skills) AS skills, (SELECT count(*)::int FROM skill_roles) AS roles, (SELECT count(*)::int FROM role_skills) AS links`)).rows;
    const first = await snapshot();
    assert.deepEqual(first, [{ skills: 67, roles: 5, links: 67 }]);
    await db.exec(migration);
    assert.deepEqual(await snapshot(), first);
    for (const skill of before) {
      assert.deepEqual((await db.query('SELECT * FROM skills WHERE id = $1', [skill.id])).rows[0], skill);
    }
  } finally { await db.close(); }
});

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
