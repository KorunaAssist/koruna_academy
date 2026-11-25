import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('only admins can manage signatures; learners can read certificate signatures', async () => {
  const db = new PGlite();
  const trainer = '00000000-0000-0000-0000-000000000001';
  try {
    const learner = '00000000-0000-0000-0000-000000000002';
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA private;
      CREATE SCHEMA auth;
      CREATE FUNCTION private.ka_role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role') $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA private TO authenticated;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE profiles(id uuid PRIMARY KEY, role text, full_name text);
      GRANT SELECT ON profiles TO authenticated;
      INSERT INTO profiles VALUES ('${trainer}', 'trainer','Trainer Name'),('${learner}','employee','Learner Name');`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611130001_trainer_signatures.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/202611180003_certificate_signature_lookup.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/202611180007_certificate_signature_creator_lookup.sql', import.meta.url), 'utf8'));
    await db.exec(`SET ROLE authenticated; SET test.role = 'admin';`);
    await db.query('INSERT INTO trainer_signatures VALUES ($1,$2)', [trainer, 'data:image/png;base64,YQ==']);
    await assert.rejects(db.query('UPDATE trainer_signatures SET image=$1', ['data:image/svg+xml;base64,YQ==']));
    await db.exec(`SET test.role = 'employee'; SET "test.user" = '${learner}';`);
    assert.equal((await db.query('SELECT image FROM trainer_signatures')).rows.length, 1);
    assert.equal((await db.query("SELECT public.get_trainer_signature($1,$2) AS image",[trainer,'Trainer Name'])).rows[0].image, 'data:image/png;base64,YQ==');
    assert.equal((await db.query("SELECT public.get_trainer_signature($1,$2) AS image",[trainer,'Trainer name changed later'])).rows[0].image, 'data:image/png;base64,YQ==');
    await assert.rejects(db.query('INSERT INTO trainer_signatures VALUES ($1,$2) ON CONFLICT(profile_id) DO UPDATE SET image=excluded.image', [trainer, 'data:image/png;base64,Yg==']));
    await db.exec('DELETE FROM trainer_signatures');
    assert.equal((await db.query('SELECT image FROM trainer_signatures')).rows.length, 1);
    await db.exec(`SET test.role = 'admin'; DELETE FROM trainer_signatures;`);
    assert.equal((await db.query('SELECT image FROM trainer_signatures')).rows.length, 0);
  } finally { await db.close(); }
});
