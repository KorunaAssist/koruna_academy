import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('only admins can manage signatures; learners can read certificate signatures', async () => {
  const db = new PGlite();
  const trainer = '00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`CREATE ROLE authenticated;
      CREATE SCHEMA private;
      CREATE FUNCTION private.ka_role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role') $$;
      GRANT USAGE ON SCHEMA private TO authenticated;
      CREATE TABLE profiles(id uuid PRIMARY KEY, role text);
      GRANT SELECT ON profiles TO authenticated;
      INSERT INTO profiles VALUES ('${trainer}', 'trainer');`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611130001_trainer_signatures.sql', import.meta.url), 'utf8'));
    await db.exec(`SET ROLE authenticated; SET test.role = 'admin';`);
    await db.query('INSERT INTO trainer_signatures VALUES ($1,$2)', [trainer, 'data:image/png;base64,YQ==']);
    await assert.rejects(db.query('UPDATE trainer_signatures SET image=$1', ['data:image/svg+xml;base64,YQ==']));
    await db.exec(`SET test.role = 'employee';`);
    assert.equal((await db.query('SELECT image FROM trainer_signatures')).rows.length, 1);
    await assert.rejects(db.query('INSERT INTO trainer_signatures VALUES ($1,$2) ON CONFLICT(profile_id) DO UPDATE SET image=excluded.image', [trainer, 'data:image/png;base64,Yg==']));
    await db.exec('DELETE FROM trainer_signatures');
    assert.equal((await db.query('SELECT image FROM trainer_signatures')).rows.length, 1);
    await db.exec(`SET test.role = 'admin'; DELETE FROM trainer_signatures;`);
    assert.equal((await db.query('SELECT image FROM trainer_signatures')).rows.length, 0);
  } finally { await db.close(); }
});
